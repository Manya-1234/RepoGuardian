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
 * Automatically recovers from bad/expired tokens by retrying unauthenticated for public repositories.
 */
const githubFetch = async (endpoint, customHeaders = null) => {
    const url = `${GITHUB_API_BASE}${endpoint}`;
    try {
        const initialHeaders = customHeaders || getHeaders();
        let response = await fetch(url, {
            headers: initialHeaders
        });

        // If a provided token failed with 401 Unauthorized (e.g. invalid or revoked GITHUB_TOKEN),
        // retry once without Authorization header so public repositories never fail
        if (response.status === 401 && initialHeaders.Authorization) {
            const publicHeaders = {
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "RepoGuardian-Application"
            };
            response = await fetch(url, { headers: publicHeaders });
        }

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

    return (data || []).map((c) => {
        const authorName = c.commit?.author?.name || c.author?.login || "Unknown";
        const authorUsername = c.author?.login || c.commit?.author?.name || "Unknown";
        const authorAvatar = c.author?.avatar_url || "";
        const commitDate = c.commit?.author?.date || c.commit?.committer?.date || null;

        return {
            sha: c.sha,
            shortSha: c.sha ? c.sha.substring(0, 7) : "",
            message: c.commit?.message || "No commit message",
            authorName,
            authorUsername,
            authorAvatar,
            date: commitDate,
            branch,
            author: {
                name: authorName,
                login: authorUsername,
                avatar_url: authorAvatar,
                date: commitDate
            },
            url: c.html_url
        };
    });
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
 * Fetches complete recursive Git tree (used by Codebase Intelligence).
 */
export const fetchGitTree = async (owner, repo, branch = "main") => {
    const endpoint = `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(
        branch
    )}?recursive=1`;

    const data = await githubFetch(endpoint);

    const items = (data.tree || []).map((item) => ({
        path: item.path,
        mode: item.mode,
        sha: item.sha,
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
 * Tries raw.githubusercontent.com first (instantaneous, free, zero REST API rate-limits),
 * with fallback to Git Blob API by SHA and contents REST endpoint.
 */
export const fetchRawFileContent = async (owner, repo, filePath, branch = "main", fileSha = null) => {
    // 1. Try public raw GitHub content CDN first (fastest, unauthenticated, zero REST API rate limit)
    try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${filePath}`;
        const rawResponse = await fetch(rawUrl, {
            headers: { "User-Agent": "RepoGuardian-Application" }
        });

        if (rawResponse.ok) {
            const textContent = await rawResponse.text();
            return {
                name: filePath.split("/").pop(),
                path: filePath,
                size: Buffer.byteLength(textContent),
                content: textContent
            };
        }
    } catch {
        // Fall through to Git Blob / Contents API
    }

    // 2. Try Git Blob API directly if fileSha is provided
    if (fileSha) {
        try {
            const blobData = await githubFetch(`/repos/${owner}/${repo}/git/blobs/${fileSha}`);
            if (blobData && blobData.content) {
                const encoding = blobData.encoding || "base64";
                const decoded = Buffer.from(blobData.content, encoding).toString("utf-8");
                return {
                    name: filePath.split("/").pop(),
                    path: filePath,
                    size: blobData.size,
                    content: decoded
                };
            }
        } catch {
            // Fall back to contents API if blob retrieval is unavailable
        }
    }

    // 3. Safely encode path by individual segment, NOT by encoding slashes
    const safePath = filePath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

    const endpoint = `/repos/${owner}/${repo}/contents/${safePath}?ref=${encodeURIComponent(branch)}`;

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
