import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Project } from "../models/project.model.js";
import {
    parseGitHubUrl,
    fetchRepoDetails,
    fetchBranches,
    fetchCommits,
    fetchPullRequests,
    fetchGitTree,
    fetchRawFileContent
} from "../utils/github.service.js";

/**
 * Helper to retrieve workspace and verify membership.
 */
const getWorkspaceAndVerifyMember = async (projectId, userId, requireAdmin = false) => {
    if (!mongoose.isValidObjectId(projectId)) {
        throw new ApiError(400, "Invalid workspace ID format");
    }

    const project = await Project.findById(projectId);
    if (!project) {
        throw new ApiError(404, "Workspace not found");
    }

    const isOwner = project.owner.equals(userId);
    const isAdmin = project.members.some(
        (m) => m.user.equals(userId) && m.role === "admin"
    );
    const isMember = isOwner || project.members.some((m) => m.user.equals(userId));

    if (requireAdmin && !isOwner && !isAdmin) {
        throw new ApiError(
            403,
            "Only workspace owners or admins can perform this action"
        );
    }

    if (!requireAdmin && !isMember) {
        throw new ApiError(
            403,
            "Access denied: You are not a member of this workspace"
        );
    }

    return project;
};

/**
 * Links a GitHub repository to a workspace.
 */
const linkRepository = asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { githubUrl, owner, name } = req.body;

    const project = await getWorkspaceAndVerifyMember(projectId, req.user._id, true);

    const input = githubUrl || (owner && name ? `${owner}/${name}` : "");
    if (!input) {
        throw new ApiError(400, "GitHub repository URL or owner/name is required");
    }

    const { owner: repoOwner, repo: repoName } = parseGitHubUrl(input);

    // Call GitHub to verify existence and fetch verified details
    const repoDetails = await fetchRepoDetails(repoOwner, repoName);

    project.githubRepo = repoDetails;
    await project.save();

    const updatedProject = await Project.findById(projectId)
        .populate("owner", "username fullName email avatar")
        .populate("members.user", "username fullName email avatar");

    return res.status(200).json(
        new ApiResponse(
            200,
            updatedProject,
            `Successfully linked GitHub repository ${repoOwner}/${repoName}`
        )
    );
});

/**
 * Unlinks the GitHub repository from a workspace.
 */
const unlinkRepository = asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    const project = await getWorkspaceAndVerifyMember(projectId, req.user._id, true);

    project.githubRepo = {
        url: "",
        owner: "",
        name: "",
        defaultBranch: "main",
        language: "",
        description: "",
        stars: 0,
        forks: 0,
        openIssues: 0,
        isLinked: false
    };

    await project.save();

    return res
        .status(200)
        .json(
            new ApiResponse(200, {}, "GitHub repository unlinked successfully")
        );
});

/**
 * Fetches current repository overview and stats.
 */
const getRepoOverview = asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    const project = await getWorkspaceAndVerifyMember(projectId, req.user._id, false);

    if (!project.githubRepo?.owner || !project.githubRepo?.name) {
        throw new ApiError(
            400,
            "No GitHub repository linked to this workspace yet"
        );
    }

    const details = await fetchRepoDetails(
        project.githubRepo.owner,
        project.githubRepo.name
    );

    // Refresh stored stats in DB
    project.githubRepo = details;
    await project.save();

    return res
        .status(200)
        .json(
            new ApiResponse(200, details, "Repository overview fetched successfully")
        );
});

/**
 * Fetches repository branches.
 */
const getRepoBranches = asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    const project = await getWorkspaceAndVerifyMember(projectId, req.user._id, false);

    if (!project.githubRepo?.owner || !project.githubRepo?.name) {
        throw new ApiError(400, "No GitHub repository linked to this workspace");
    }

    const branches = await fetchBranches(
        project.githubRepo.owner,
        project.githubRepo.name
    );

    return res
        .status(200)
        .json(
            new ApiResponse(200, branches, "Branches fetched successfully")
        );
});

/**
 * Fetches recent commits for a given branch.
 */
const getRepoCommits = asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { branch, limit = 15 } = req.query;

    const project = await getWorkspaceAndVerifyMember(projectId, req.user._id, false);

    if (!project.githubRepo?.owner || !project.githubRepo?.name) {
        throw new ApiError(400, "No GitHub repository linked to this workspace");
    }

    const targetBranch =
        branch || project.githubRepo.defaultBranch || "main";

    const commits = await fetchCommits(
        project.githubRepo.owner,
        project.githubRepo.name,
        targetBranch,
        limit
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                branch: targetBranch,
                total: commits.length,
                commits
            },
            "Commits fetched successfully"
        )
    );
});

/**
 * Fetches pull requests.
 */
const getRepoPullRequests = asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { state = "open" } = req.query;

    const project = await getWorkspaceAndVerifyMember(projectId, req.user._id, false);

    if (!project.githubRepo?.owner || !project.githubRepo?.name) {
        throw new ApiError(400, "No GitHub repository linked to this workspace");
    }

    const pullRequests = await fetchPullRequests(
        project.githubRepo.owner,
        project.githubRepo.name,
        state
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                state,
                total: pullRequests.length,
                pullRequests
            },
            "Pull requests fetched successfully"
        )
    );
});

/**
 * Fetches recursive Git tree (complete file/directory structure).
 */
const getRepoFileTree = asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { branch } = req.query;

    const project = await getWorkspaceAndVerifyMember(projectId, req.user._id, false);

    if (!project.githubRepo?.owner || !project.githubRepo?.name) {
        throw new ApiError(400, "No GitHub repository linked to this workspace");
    }

    const targetBranch =
        branch || project.githubRepo.defaultBranch || "main";

    const treeData = await fetchGitTree(
        project.githubRepo.owner,
        project.githubRepo.name,
        targetBranch
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                branch: targetBranch,
                sha: treeData.sha,
                totalFiles: treeData.totalFiles,
                tree: treeData.tree
            },
            "Git file tree fetched successfully"
        )
    );
});

/**
 * Fetches raw file content of a file in the repository.
 */
const getRepoFileContent = asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { path, branch } = req.query;

    if (!path || !path.trim()) {
        throw new ApiError(400, "File path query parameter (?path=src/index.js) is required");
    }

    const project = await getWorkspaceAndVerifyMember(projectId, req.user._id, false);

    if (!project.githubRepo?.owner || !project.githubRepo?.name) {
        throw new ApiError(400, "No GitHub repository linked to this workspace");
    }

    const targetBranch =
        branch || project.githubRepo.defaultBranch || "main";

    const fileData = await fetchRawFileContent(
        project.githubRepo.owner,
        project.githubRepo.name,
        path.trim(),
        targetBranch
    );

    return res
        .status(200)
        .json(
            new ApiResponse(200, fileData, "File content fetched successfully")
        );
});

export {
    linkRepository,
    unlinkRepository,
    getRepoOverview,
    getRepoBranches,
    getRepoCommits,
    getRepoPullRequests,
    getRepoFileTree,
    getRepoFileContent
};
