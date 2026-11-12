import { ApiError } from "./ApiError.js";

const GITHUB_API_BASE = "https://api.github.com";

/**
 * Builds request headers for the GitHub API, attaching
 * optional Personal Access Token (GITHUB_TOKEN) for 5000 req/hr rate limits.
 */
const getHeaders = () => {
    const headers = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "RepoGuardian-Application"
    };

    if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim() !== "") {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN.trim()}`;
    }

    return headers;
};

/**
 * Safely parses GitHub repository URL or "owner/repo" shorthand.
 * Example inputs:
 * - "https://github.com/facebook/react"
 * - "https://github.com/facebook/react.git"
 * - "facebook/react"
 */
export const parseGitHubUrl = (input) => {
    if (!input || typeof input !== "string") {
        throw new ApiError(400, "GitHub repository URL or identifier is required");
    }

    const cleanInput = input.trim().replace(/\.git$/, "");
    const match = cleanInput.match(
        /(?:https?:\/\/github\.com\/|^)([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/?$/
    );

    if (!match || !match[1] || !match[2]) {
        throw new ApiError(
            400,
            "Invalid GitHub repository URL format. Example: https://github.com/owner/repository"
        );
    }

    return {
        owner: match[1],
        repo: match[2]
    };
};

/**
 * Generic fetch wrapper for GitHub REST API with rate-limit and error handling.
 */
const githubFetch = async (endpoint) => {
    const url = `${GITHUB_API_BASE}${endpoint}`;
    try {
        const response = await fetch(url, {
            headers: getHeaders()
        });

        if (response.status === 404) {
            throw new ApiError(404, "Repository or resource not found on GitHub");
        }

        if (response.status === 403) {
            const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
            if (rateLimitRemaining === "0") {
                throw new ApiError(
                    429,
                    "GitHub API rate limit exceeded. Please configure GITHUB_TOKEN in your environment."
                );
            }
            throw new ApiError(403, "Access to this GitHub resource is forbidden");
        }

        if (!response.ok) {
            throw new ApiError(
                response.status,
                `GitHub API request failed: ${response.statusText}`
            );
        }

        return await response.json();
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(500, `Failed to communicate with GitHub: ${error.message}`);
    }
};

/**
 * Fetches verified repository overview from GitHub.
 */
export const fetchRepoDetails = async (owner, repo) => {
    const data = await githubFetch(`/repos/${owner}/${repo}`);

    return {
        url: data.html_url,
        owner: data.owner?.login || owner,
        name: data.name || repo,
        defaultBranch: data.default_branch || "main",
        language: data.language || "Unknown",
        description: data.description || "",
        stars: data.stargazers_count || 0,
        forks: data.forks_count || 0,
        openIssues: data.open_issues_count || 0,
        isPrivate: data.private || false,
        isLinked: true
    };
};

/**
 * Fetches repository branches.
 */
export const fetchBranches = async (owner, repo) => {
    const data = await githubFetch(`/repos/${owner}/${repo}/branches?per_page=30`);

    return (data || []).map((b) => ({
        name: b.name,
        commitSha: b.commit?.sha,
        isProtected: b.protected || false
    }));
};

/**
 * Fetches recent commit history for a branch.
 */
export const fetchCommits = async (owner, repo, branch = "main", limit = 15) => {
    const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 15));
    const endpoint = `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(
        branch
    )}&per_page=${safeLimit}`;

    const data = await githubFetch(endpoint);

    return (data || []).map((c) => ({
        sha: c.sha,
        shortSha: c.sha ? c.sha.substring(0, 7) : "",
        message: c.commit?.message || "No commit message",
        authorName: c.commit?.author?.name || "Unknown",
        authorUsername: c.author?.login || c.commit?.author?.name || "Unknown",
        authorAvatar: c.author?.avatar_url || "",
        date: c.commit?.author?.date,
        url: c.html_url
    }));
};

/**
 * Fetches pull requests (open, closed, or all).
 */
export const fetchPullRequests = async (owner, repo, state = "open") => {
    const safeState = ["open", "closed", "all"].includes(state) ? state : "open";
    const endpoint = `/repos/${owner}/${repo}/pulls?state=${safeState}&per_page=20`;

    const data = await githubFetch(endpoint);

    return (data || []).map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        authorUsername: pr.user?.login || "Unknown",
        authorAvatar: pr.user?.avatar_url || "",
        headBranch: pr.head?.ref || "",
        baseBranch: pr.base?.ref || "",
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergedAt: pr.merged_at || null,
        url: pr.html_url
    }));
};

/**
 * Fetches complete recursive Git tree (used by Codebase Intelligence in Phase 7).
 */
export const fetchGitTree = async (owner, repo, branch = "main") => {
    const endpoint = `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(
        branch
    )}?recursive=1`;

    const data = await githubFetch(endpoint);

    const items = (data.tree || []).map((item) => ({
        path: item.path,
        mode: item.mode,
        type: item.type === "blob" ? "file" : "directory",
        size: item.size || 0
    }));

    return {
        sha: data.sha,
        tree: items,
        totalFiles: items.filter((i) => i.type === "file").length
    };
};

/**
 * Fetches raw text content of a file from repository.
 */
export const fetchRawFileContent = async (owner, repo, filePath, branch = "main") => {
    const endpoint = `/repos/${owner}/${repo}/contents/${encodeURIComponent(
        filePath
    )}?ref=${encodeURIComponent(branch)}`;

    const data = await githubFetch(endpoint);

    if (data.type !== "file") {
        throw new ApiError(400, "Target path is not a file");
    }

    if (!data.content) {
        throw new ApiError(404, "File content is empty or unavailable");
    }

    const decodedContent = Buffer.from(data.content, "base64").toString("utf-8");

    return {
        name: data.name,
        path: data.path,
        size: data.size,
        content: decodedContent
    };
};
