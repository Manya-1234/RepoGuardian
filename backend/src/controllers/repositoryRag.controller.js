import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Project } from "../models/project.model.js";
import {
    runRepositoryIndexing,
    getIndexingStatus
} from "../services/rag/ingestion.service.js";
import {
    performHybridRetrieval,
    classifyQueryIntent
} from "../services/rag/retrieval.service.js";
import { generateRepositoryAnswer } from "../services/rag/llm.service.js";

/**
 * Resolves repositoryId (which can be a Project ObjectId or repo name)
 * and verifies that the current user has access.
 */
const resolveProjectAndVerifyAccess = async (repositoryId, userId) => {
    let project = null;

    if (mongoose.isValidObjectId(repositoryId)) {
        project = await Project.findById(repositoryId);
    }

    if (!project) {
        // Fallback search by repo name or project name
        project = await Project.findOne({
            $or: [
                { "githubRepo.name": repositoryId },
                { name: repositoryId }
            ]
        });
    }

    if (!project) {
        throw new ApiError(404, "Repository or workspace not found");
    }

    // Access check: User must be owner or workspace member
    const isOwner = project.owner.equals(userId);
    const isMember = project.members.some((m) =>
        (m.user?._id || m.user).toString() === userId.toString()
    );

    if (!isOwner && !isMember) {
        throw new ApiError(
            403,
            "Access denied: You are not a member of this workspace"
        );
    }

    if (!project.githubRepo?.owner || !project.githubRepo?.name) {
        throw new ApiError(
            400,
            "No GitHub repository linked to this workspace. Please link a repository first."
        );
    }

    return project;
};

/**
 * Starts or updates repository indexing.
 * POST /api/v1/repositories/:repositoryId/index
 */
export const triggerRepositoryIndexing = asyncHandler(async (req, res) => {
    const { repositoryId } = req.params;
    const { branch, forceReindex = false } = req.body;

    const project = await resolveProjectAndVerifyAccess(repositoryId, req.user._id);

    const targetBranch =
        branch || project.githubRepo?.defaultBranch || "main";

    const status = await runRepositoryIndexing(
        project._id,
        targetBranch,
        Boolean(forceReindex)
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            status,
            `Indexing initiated for repository ${project.githubRepo.owner}/${project.githubRepo.name} (${targetBranch})`
        )
    );
});

/**
 * Retrieves the current indexing status and progress.
 * GET /api/v1/repositories/:repositoryId/index/status
 */
export const getRepositoryIndexingStatus = asyncHandler(async (req, res) => {
    const { repositoryId } = req.params;
    const { branch } = req.query;

    const project = await resolveProjectAndVerifyAccess(repositoryId, req.user._id);

    const targetBranch =
        branch || project.githubRepo?.defaultBranch || "main";

    const status = await getIndexingStatus(project._id, targetBranch);

    return res.status(200).json(
        new ApiResponse(200, status, "Indexing status retrieved successfully")
    );
});

/**
 * Repository-Aware Q&A: Hybrid Retrieval + Grounded LLM Response.
 * POST /api/v1/repositories/:repositoryId/chat
 */
export const queryRepositoryChat = asyncHandler(async (req, res) => {
    const { repositoryId } = req.params;
    const { question, query, branch, history = [] } = req.body;

    const searchQuery = (question || query || "").trim();
    if (!searchQuery) {
        throw new ApiError(400, "A natural-language question or query is required");
    }

    const project = await resolveProjectAndVerifyAccess(repositoryId, req.user._id);

    const targetBranch =
        branch || project.githubRepo?.defaultBranch || "main";
    const repoIdentifier = `${project.githubRepo.owner}/${project.githubRepo.name}`;

    // 1. Check indexing status & auto-schedule if needed
    let indexStatus = await getIndexingStatus(project._id, targetBranch);
    if (!indexStatus || indexStatus.status === "idle" || indexStatus.status === "not_indexed" || indexStatus.status === "failed") {
        runRepositoryIndexing(project._id, targetBranch, false).catch((err) => {
            console.error(`[AutoIndex] Background indexing failed on query for ${repoIdentifier}:`, err.message);
        });
        indexStatus = await getIndexingStatus(project._id, targetBranch);
    }

    const isIndexing = ["indexing", "queued", "partially_indexed"].includes(indexStatus?.status);
    const intent = classifyQueryIntent(searchQuery, history);

    // 2. Perform Hybrid Retrieval (Semantic + Keyword + Dependency Graph)
    const retrievedItems = await performHybridRetrieval(
        project._id,
        targetBranch,
        searchQuery,
        { topK: 10 }
    );

    // 3. Synthesize Grounded Evidence Answer using LLM / grounded generator
    const ragResponse = await generateRepositoryAnswer(
        repoIdentifier,
        targetBranch,
        searchQuery,
        retrievedItems,
        {
            manifest: indexStatus?.manifest,
            intent,
            isIndexing,
            indexingStatus: indexStatus,
            history
        }
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                ...ragResponse,
                repository: repoIdentifier,
                branch: targetBranch,
                retrievedChunksCount: retrievedItems.length,
                isIndexing,
                indexingStatus: indexStatus?.status,
                progress: indexStatus?.progress || 0
            },
            "Repository response generated successfully"
        )
    );
});

/**
 * Code retrieval search endpoint without LLM generation.
 * GET /api/v1/repositories/:repositoryId/search
 */
export const searchRepositoryCode = asyncHandler(async (req, res) => {
    const { repositoryId } = req.params;
    const { query, branch, limit = 10 } = req.query;

    if (!query || !query.trim()) {
        throw new ApiError(400, "Search query (?query=...) is required");
    }

    const project = await resolveProjectAndVerifyAccess(repositoryId, req.user._id);

    const targetBranch =
        branch || project.githubRepo?.defaultBranch || "main";

    const topK = Math.min(25, Math.max(1, parseInt(limit, 10) || 10));

    const results = await performHybridRetrieval(
        project._id,
        targetBranch,
        query.trim(),
        { topK }
    );

    const formatted = results.map((item) => ({
        filePath: item.chunk.filePath,
        fileName: item.chunk.fileName,
        language: item.chunk.language,
        symbolName: item.chunk.symbolName,
        symbolType: item.chunk.symbolType,
        startLine: item.chunk.startLine,
        endLine: item.chunk.endLine,
        content: item.chunk.content,
        calls: item.chunk.calls,
        imports: item.chunk.imports,
        score: item.score,
        semanticScore: item.semanticScore,
        keywordScore: item.keywordScore,
        graphScore: item.graphScore,
        isDependencyContext: item.isDependencyContext
    }));

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                total: formatted.length,
                branch: targetBranch,
                query: query.trim(),
                results: formatted
            },
            "Code search executed successfully"
        )
    );
});
