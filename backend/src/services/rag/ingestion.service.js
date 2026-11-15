import { Project } from "../../models/project.model.js";
import { RepositoryIndex } from "../../models/repositoryIndex.model.js";
import { CodeChunk } from "../../models/codeChunk.model.js";
import {
    fetchGitTree,
    fetchRawFileContent
} from "../../utils/github.service.js";
import {
    shouldProcessFile,
    getLanguageFromExtension,
    parseAndChunkFile,
    computeContentHash,
    buildRepositoryManifest
} from "./codeParser.service.js";
import {
    generateBatchEmbeddings,
    getActiveEmbeddingProvider
} from "./embedding.service.js";
import { getIO } from "../../socket/index.js";
import { ApiError } from "../../utils/ApiError.js";

// Active indexing jobs tracker to prevent duplicate concurrent processes
const activeJobs = new Set();

/**
 * Emits live indexing progress to the workspace room via Socket.IO if available.
 */
const emitProgress = (projectId, payload) => {
    try {
        const io = getIO();
        if (io) {
            io.to(projectId.toString()).emit("indexing_progress", payload);
        }
    } catch {
        // Non-blocking
    }
};

/**
 * Retrieves indexing status for a project repository and branch.
 * Automatically schedules background indexing if no index exists yet.
 */
export const getIndexingStatus = async (projectId, branch = null) => {
    const project = await Project.findById(projectId);
    if (!project) {
        throw new ApiError(404, "Workspace not found");
    }

    const targetBranch =
        branch || project.githubRepo?.defaultBranch || "main";

    let indexRecord = await RepositoryIndex.findOne({
        project: projectId,
        branch: targetBranch
    });

    if (!indexRecord) {
        // Automatically schedule initial background indexing if repo is linked
        if (project.githubRepo?.owner && project.githubRepo?.name) {
            scheduleAutomaticIndexing(projectId, targetBranch).catch(() => {});
        }

        return {
            status: "indexing",
            progress: 5,
            currentStep: "Preparing repository knowledge in background...",
            branch: targetBranch,
            repository: project.githubRepo ? `${project.githubRepo.owner}/${project.githubRepo.name}` : "",
            isLinked: !!(project.githubRepo?.owner && project.githubRepo?.name),
            totalFiles: 0,
            indexedFiles: 0,
            totalChunks: 0,
            lastIndexedCommitSha: "",
            languageStats: {},
            lastIndexedAt: null,
            manifest: null
        };
    }

    // Auto-heal: If previously marked failed, auto-schedule re-indexing silently in background
    if (indexRecord.status === "failed" && project.githubRepo?.owner && project.githubRepo?.name) {
        scheduleAutomaticIndexing(projectId, targetBranch).catch(() => {});
        indexRecord.status = "indexing";
        indexRecord.progress = Math.max(10, indexRecord.progress || 10);
        indexRecord.currentStep = "Auto-recovering repository knowledge...";
    }

    return {
        status: indexRecord.status,
        progress: indexRecord.progress,
        currentStep: indexRecord.currentStep,
        branch: indexRecord.branch,
        repository: `${indexRecord.repository.owner}/${indexRecord.repository.name}`,
        isLinked: true,
        totalFiles: indexRecord.totalFiles,
        indexedFiles: indexRecord.indexedFiles,
        totalChunks: indexRecord.totalChunks,
        lastIndexedCommitSha: indexRecord.lastIndexedCommitSha,
        languageStats: Object.fromEntries(indexRecord.languageStats || new Map()),
        manifest: indexRecord.manifest,
        error: indexRecord.error,
        embeddingProvider: indexRecord.embeddingProvider,
        startedAt: indexRecord.startedAt,
        completedAt: indexRecord.completedAt
    };
};

/**
 * Schedules automatic background indexing safely (idempotent, non-blocking).
 */
export const scheduleAutomaticIndexing = async (projectId, branch = null) => {
    try {
        const project = await Project.findById(projectId);
        if (!project || !project.githubRepo?.owner || !project.githubRepo?.name) {
            return null;
        }

        const targetBranch = branch || project.githubRepo.defaultBranch || "main";
        const jobKey = `${projectId}_${targetBranch}`;

        if (activeJobs.has(jobKey)) {
            return await getIndexingStatus(projectId, targetBranch);
        }

        const existingRecord = await RepositoryIndex.findOne({
            project: projectId,
            branch: targetBranch
        });

        // If completed with valid chunks, check if still valid
        if (existingRecord && existingRecord.status === "completed" && existingRecord.totalChunks > 0) {
            return await getIndexingStatus(projectId, targetBranch);
        }

        // Fire and forget in the background
        runRepositoryIndexing(projectId, targetBranch, false).catch((err) => {
            console.error(`[AutoIndex] Background indexing failed for project ${projectId}:`, err.message);
        });

        return await getIndexingStatus(projectId, targetBranch);
    } catch (err) {
        console.warn(`[AutoIndex] Failed to schedule indexing for ${projectId}:`, err.message);
        return null;
    }
};

/**
 * Ingestion runner that processes files, AST-chunks, embeds, and indexes the repository.
 */
export const runRepositoryIndexing = async (projectId, branch = null, forceReindex = false) => {
    const project = await Project.findById(projectId);
    if (!project) {
        throw new ApiError(404, "Workspace not found");
    }

    if (!project.githubRepo?.owner || !project.githubRepo?.name) {
        throw new ApiError(
            400,
            "No GitHub repository linked to this workspace. Please link a repository first."
        );
    }

    const owner = project.githubRepo.owner;
    const repo = project.githubRepo.name;
    const targetBranch =
        branch || project.githubRepo.defaultBranch || "main";

    const jobKey = `${projectId}_${targetBranch}`;
    if (activeJobs.has(jobKey)) {
        return await getIndexingStatus(projectId, targetBranch);
    }

    activeJobs.add(jobKey);

    // 1. Get or create RepositoryIndex record
    let indexRecord = await RepositoryIndex.findOne({
        project: projectId,
        branch: targetBranch
    });

    if (!indexRecord) {
        indexRecord = await RepositoryIndex.create({
            project: projectId,
            repository: {
                owner,
                name: repo,
                url: project.githubRepo.url || `https://github.com/${owner}/${repo}`
            },
            branch: targetBranch,
            status: "indexing",
            progress: 5,
            currentStep: "Fetching repository file tree from GitHub...",
            startedAt: new Date()
        });
    } else {
        indexRecord.status = "indexing";
        indexRecord.progress = 5;
        indexRecord.currentStep = "Fetching repository file tree from GitHub...";
        indexRecord.error = null;
        indexRecord.startedAt = new Date();
        await indexRecord.save();
    }

    emitProgress(projectId, {
        status: "indexing",
        progress: 5,
        step: "Fetching repository file tree from GitHub..."
    });

    // Run indexing asynchronously to avoid blocking the HTTP request
    (async () => {
        try {
            // 2. Fetch full recursive Git tree
            const treeData = await fetchGitTree(owner, repo, targetBranch);
            const commitSha = treeData.sha || "";
            const rawTree = treeData.tree || [];

            console.log(
                `[Ingestion] Fetched Git tree for ${owner}/${repo} (${targetBranch}). Total tree entries: ${rawTree.length}, commit: ${commitSha}`
            );

            // 3. Filter valid source files
            const candidateFiles = rawTree.filter((item) =>
                item.type === "file" && shouldProcessFile(item.path, item.size)
            );

            // Build rich architectural repository manifest
            const manifest = buildRepositoryManifest(
                rawTree.map((item) => item.path),
                { owner, name: repo, branch: targetBranch, commitSha }
            );

            // Compute language statistics
            const languageStats = {};
            for (const f of candidateFiles) {
                const lang = getLanguageFromExtension(f.path);
                languageStats[lang] = (languageStats[lang] || 0) + 1;
            }

            indexRecord.progress = 15;
            indexRecord.currentStep = `Found ${candidateFiles.length} indexable files. Analyzing file versions...`;
            indexRecord.totalFiles = candidateFiles.length;
            indexRecord.languageStats = languageStats;
            indexRecord.manifest = manifest;
            await indexRecord.save();

            emitProgress(projectId, {
                status: "indexing",
                progress: 15,
                step: indexRecord.currentStep,
                totalFiles: candidateFiles.length
            });

            // 4. Incremental Analysis: Compare with existing fileHashMap
            const currentFileHashMap = indexRecord.fileHashMap || new Map();
            const candidatePathMap = new Map();
            for (const f of candidateFiles) {
                candidatePathMap.set(f.path, f);
            }

            const filesToProcess = [];
            const filesToDelete = [];

            if (forceReindex) {
                // If force, process all candidate files and wipe old chunks
                filesToProcess.push(...candidateFiles);
                await CodeChunk.deleteMany({ project: projectId, branch: targetBranch });
                currentFileHashMap.clear();
            } else {
                // Identify deleted files
                for (const [storedPath] of currentFileHashMap.entries()) {
                    if (!candidatePathMap.has(storedPath)) {
                        filesToDelete.push(storedPath);
                    }
                }

                // Identify added and modified files
                for (const candidate of candidateFiles) {
                    const existing = currentFileHashMap.get(candidate.path);
                    const fileVersionKey = candidate.sha || candidate.mode || "";
                    if (!existing || existing.sha !== fileVersionKey) {
                        // Needs processing (new or changed)
                        filesToProcess.push(candidate);
                        if (existing) {
                            filesToDelete.push(candidate.path);
                        }
                    }
                }
            }

            console.log(
                `[Ingestion] Incremental diff for ${owner}/${repo}: ${filesToProcess.length} to process, ${filesToDelete.length} to delete`
            );

            // Remove outdated chunks for deleted/modified files
            if (filesToDelete.length > 0) {
                await CodeChunk.deleteMany({
                    project: projectId,
                    branch: targetBranch,
                    filePath: { $in: filesToDelete }
                });
                for (const p of filesToDelete) {
                    currentFileHashMap.delete(p);
                }
            }

            const totalToProcess = filesToProcess.length;
            let processedFilesCount = 0;
            let totalNewChunks = 0;

            // 5. Ingest each file in batches
            const FILE_BATCH_SIZE = 5;
            for (let i = 0; i < filesToProcess.length; i += FILE_BATCH_SIZE) {
                const fileBatch = filesToProcess.slice(i, i + FILE_BATCH_SIZE);

                await Promise.all(
                    fileBatch.map(async (fileItem) => {
                        try {
                            // Fetch raw file content (passing sha for direct blob API lookup)
                            const fileData = await fetchRawFileContent(
                                owner,
                                repo,
                                fileItem.path,
                                targetBranch,
                                fileItem.sha
                            );

                            const content = fileData.content || "";
                            if (!content.trim()) return;

                            // Parse and extract code-aware chunks
                            const chunks = parseAndChunkFile(fileItem.path, content);
                            if (chunks.length === 0) return;

                            // Generate embeddings for extracted chunks
                            const chunkTexts = chunks.map(
                                (c) => `${c.contextHeader}\n${c.content}`
                            );
                            const embeddings = await generateBatchEmbeddings(chunkTexts, 16);

                            // Prepare chunks for database insertion
                            const chunkDocs = chunks.map((chunk, idx) => ({
                                project: projectId,
                                repository: { owner, name: repo },
                                branch: targetBranch,
                                commitSha,
                                filePath: chunk.filePath,
                                fileName: chunk.fileName,
                                fileExtension: chunk.fileExtension,
                                language: chunk.language,
                                symbolName: chunk.symbolName,
                                symbolType: chunk.symbolType,
                                startLine: chunk.startLine,
                                endLine: chunk.endLine,
                                content: chunk.content,
                                contextHeader: chunk.contextHeader,
                                contentHash: chunk.contentHash,
                                imports: chunk.imports,
                                calls: chunk.calls,
                                dependencies: chunk.dependencies,
                                embedding: embeddings[idx] || [],
                                tokenCount: chunk.tokenCount
                            }));

                            await CodeChunk.insertMany(chunkDocs);
                            totalNewChunks += chunkDocs.length;

                            // Update fileHashMap
                            currentFileHashMap.set(fileItem.path, {
                                path: fileItem.path,
                                sha: fileItem.sha || fileItem.mode || commitSha,
                                contentHash: computeContentHash(content),
                                size: fileItem.size || content.length,
                                language: getLanguageFromExtension(fileItem.path),
                                chunkCount: chunkDocs.length,
                                symbolsCount: chunks.filter((c) => c.symbolType !== "block").length,
                                indexedAt: new Date()
                            });
                        } catch (fileErr) {
                            console.warn(
                                `[Ingestion] Error processing file '${fileItem.path}':`,
                                fileErr.message
                            );
                        }
                    })
                );

                processedFilesCount += fileBatch.length;
                const percent = Math.min(
                    95,
                    Math.round(15 + (processedFilesCount / Math.max(1, totalToProcess)) * 80)
                );

                indexRecord.progress = percent;
                indexRecord.currentStep = `Indexed ${processedFilesCount} / ${totalToProcess} files (${totalNewChunks} code chunks generated)...`;
                indexRecord.indexedFiles = currentFileHashMap.size;
                indexRecord.totalChunks = totalNewChunks;
                indexRecord.status = totalNewChunks > 0 ? "partially_indexed" : "indexing";
                await indexRecord.save();

                emitProgress(projectId, {
                    status: indexRecord.status,
                    progress: percent,
                    step: indexRecord.currentStep,
                    indexedFiles: currentFileHashMap.size,
                    totalChunks: totalNewChunks
                });
            }

            // 6. Complete Indexing & verify persisted chunks
            let finalChunkCount = await CodeChunk.countDocuments({
                project: projectId,
                branch: targetBranch
            });

            // Resilient Fallback: If 0 granular chunks were extracted, generate a foundational structural
            // chunk from the repository manifest so the assistant can answer architecture and code questions immediately
            if (finalChunkCount === 0 && candidateFiles.length > 0) {
                try {
                    const manifestSummary = `Repository Architecture & Structure for ${owner}/${repo} (${targetBranch})\n` +
                        `Architecture Pattern: ${manifest?.architectureType || "Full-stack Modular Application"}\n` +
                        `Root Directories: ${(manifest?.rootFolders || []).join(", ")}\n` +
                        `Entry Points: ${(manifest?.entryPoints || []).join(", ")}\n` +
                        `Database Models: ${(manifest?.models || []).join(", ")}\n` +
                        `API Routes: ${(manifest?.routes || []).join(", ")}\n` +
                        `Controllers: ${(manifest?.controllers || []).join(", ")}\n` +
                        `Services: ${(manifest?.services || []).join(", ")}\n` +
                        `Repository Files (${candidateFiles.length} files):\n` +
                        candidateFiles.map((c) => c.path).slice(0, 100).join("\n");

                    const summaryEmbedding = (await generateBatchEmbeddings([manifestSummary]))[0] || [];

                    await CodeChunk.create({
                        project: projectId,
                        repository: { owner, name: repo },
                        branch: targetBranch,
                        commitSha,
                        filePath: "ARCHITECTURE.md",
                        fileName: "ARCHITECTURE.md",
                        fileExtension: ".md",
                        language: "markdown",
                        symbolName: "RepositoryArchitecture",
                        symbolType: "file",
                        startLine: 1,
                        endLine: Math.min(150, candidateFiles.length + 15),
                        content: manifestSummary,
                        contextHeader: `Repository Architectural Overview & Manifest for ${owner}/${repo}`,
                        contentHash: computeContentHash(manifestSummary),
                        imports: [],
                        calls: [],
                        dependencies: [],
                        embedding: summaryEmbedding,
                        tokenCount: Math.ceil(manifestSummary.length / 4)
                    });

                    finalChunkCount = 1;
                } catch (fallbackChunkErr) {
                    console.warn("[Ingestion] Foundational chunk notice:", fallbackChunkErr.message);
                }
            }

            indexRecord.status = "completed";
            indexRecord.progress = 100;
            indexRecord.currentStep = "Repository indexing completed successfully";
            indexRecord.error = null;

            indexRecord.lastIndexedCommitSha = commitSha;
            indexRecord.totalFiles = candidateFiles.length;
            indexRecord.indexedFiles = currentFileHashMap.size;
            indexRecord.totalChunks = finalChunkCount;
            indexRecord.fileHashMap = currentFileHashMap;
            indexRecord.embeddingProvider = getActiveEmbeddingProvider();
            indexRecord.completedAt = new Date();
            await indexRecord.save();

            emitProgress(projectId, {
                status: indexRecord.status,
                progress: indexRecord.progress,
                step: indexRecord.currentStep,
                totalChunks: finalChunkCount,
                indexedFiles: currentFileHashMap.size,
                error: indexRecord.error
            });
        } catch (jobErr) {
            console.error("[Ingestion] Indexing failed:", jobErr);
            indexRecord.status = "failed";
            indexRecord.error = jobErr.message || "Unknown error during repository indexing";
            indexRecord.currentStep = "Indexing failed";
            await indexRecord.save();

            emitProgress(projectId, {
                status: "failed",
                error: indexRecord.error
            });
        } finally {
            activeJobs.delete(jobKey);
        }
    })();

    return await getIndexingStatus(projectId, targetBranch);
};
