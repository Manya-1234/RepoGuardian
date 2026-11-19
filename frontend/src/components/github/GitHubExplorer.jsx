import React, { useState, useEffect } from "react";
import {
  Github,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Folder,
  FileCode,
  FileText,
  Star,
  GitFork,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import { githubApi } from "../../api/github.api";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { Badge } from "../common/Badge";

export const GitHubExplorer = ({
  workspace,
  isOwner = false,
  onWorkspaceUpdated,
  selectedFile = null,
  onOpenAI = null,
}) => {
  const [subTab, setSubTab] = useState("overview"); // 'overview' | 'tree' | 'commits' | 'pulls'
  const [repoDetails, setRepoDetails] = useState(null);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [commits, setCommits] = useState([]);
  const [pulls, setPulls] = useState([]);
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Code Viewer State
  const [activeFilePath, setActiveFilePath] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Connect Repo Input
  const [repoUrlInput, setRepoUrlInput] = useState("");
  const [connecting, setConnecting] = useState(false);

  const owner = workspace?.githubRepo?.owner;
  const repo = workspace?.githubRepo?.name || workspace?.githubRepo?.repo;
  const isLinked = !!(owner && repo);

  const handleConnectRepo = async (e) => {
    e.preventDefault();
    if (!repoUrlInput.trim()) return;
    setError("");
    setConnecting(true);

    try {
      const res = await githubApi.linkRepo(workspace._id, repoUrlInput.trim());
      // Backend returns populated updated workspace
      if (onWorkspaceUpdated) {
        onWorkspaceUpdated(res.data);
      }
    } catch (err) {
      setError(err.message || "Failed to link GitHub repository");
    } finally {
      setConnecting(false);
    }
  };

  // Fetch initial repo overview & branches
  useEffect(() => {
    if (!isLinked) return;

    const loadRepo = async () => {
      try {
        setLoading(true);
        setError("");
        const [overviewRes, branchesRes] = await Promise.all([
          githubApi.getRepoOverview(workspace._id),
          githubApi.getBranches(workspace._id),
        ]);

        setRepoDetails(overviewRes.data);
        const branchList = Array.isArray(branchesRes.data)
          ? branchesRes.data
          : branchesRes.data?.branches || [];
        setBranches(branchList);
        setSelectedBranch(overviewRes.data?.defaultBranch || "main");
      } catch (err) {
        setError(err.message || "Failed to load GitHub repository");
      } finally {
        setLoading(false);
      }
    };

    loadRepo();
  }, [workspace._id, isLinked]);

  // Fetch subtab content
  useEffect(() => {
    if (!isLinked) return;

    const loadSubTabData = async () => {
      try {
        if (subTab === "commits") {
          const res = await githubApi.getCommits(workspace._id, selectedBranch);
          setCommits(res.data?.commits || []);
        } else if (subTab === "pulls") {
          const res = await githubApi.getPulls(workspace._id, "all");
          setPulls(res.data?.pullRequests || []);
        } else if (subTab === "tree") {
          const res = await githubApi.getTree(workspace._id, selectedBranch);
          setTree(res.data?.tree || []);
        }
      } catch (err) {
        console.error("Error loading subtab data:", err);
      }
    };

    loadSubTabData();
  }, [subTab, selectedBranch, workspace._id, isLinked]);

  // Load raw file content when clicking a file in tree
  const handleOpenFile = async (path) => {
    try {
      setActiveFilePath(path);
      setFileLoading(true);
      const res = await githubApi.getFileContent(
        workspace._id,
        path,
        selectedBranch
      );
      setFileContent(res.data?.content || "");
    } catch (err) {
      setFileContent(`// Error loading file: ${err.message}`);
    } finally {
      setFileLoading(false);
    }
  };

  // Sync selectedFile if navigated from external source (e.g., RAG Assistant)
  useEffect(() => {
    if (selectedFile?.path && isLinked) {
      setSubTab("tree");
      handleOpenFile(selectedFile.path);
    }
  }, [selectedFile, isLinked]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isLinked) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-xl mx-auto text-center shadow-xl">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 mx-auto flex items-center justify-center mb-4">
          <Github className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-100">
          Connect GitHub Repository
        </h3>
        <p className="text-xs text-slate-400 mt-1 mb-6">
          Link a public repository (or private with your token) to explore commits, inspect branch files, and analyze codebase structure.
        </p>

        {isOwner ? (
          <form onSubmit={handleConnectRepo} className="space-y-3">
            {error && (
              <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-xl">
                {error}
              </div>
            )}
            <input
              type="text"
              required
              value={repoUrlInput}
              onChange={(e) => setRepoUrlInput(e.target.value)}
              placeholder="e.g. facebook/react or https://github.com/facebook/react"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={connecting}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {connecting ? <LoadingSpinner size="sm" /> : "Link Repository"}
            </button>
          </form>
        ) : (
          <p className="text-xs text-slate-500 italic">
            Only workspace owners or admins can link a GitHub repository.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Repo Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-indigo-400">
            <Github className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-100">
                {owner}/{repo}
              </h3>
              <a
                href={workspace?.githubRepo?.url || `https://github.com/${owner}/${repo}`}
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-white"
                title="View on GitHub"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            {repoDetails?.description && (
              <p className="text-xs text-slate-400 mt-1 max-w-xl line-clamp-1">
                {repoDetails.description}
              </p>
            )}
          </div>
        </div>

        {/* Branch Selector & Stats */}
        <div className="flex items-center gap-3 flex-wrap">
          {onOpenAI && (
            <button
              type="button"
              onClick={onOpenAI}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition cursor-pointer"
              title="Query this codebase with AI"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Ask Codebase AI</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
            <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              {branches.length === 0 ? (
                <option value={selectedBranch || "main"} className="bg-slate-900">
                  {selectedBranch || "main"}
                </option>
              ) : (
                branches.map((b) => (
                  <option key={b.name} value={b.name} className="bg-slate-900">
                    {b.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-amber-400" />
              <span>{repoDetails?.stars ?? workspace?.githubRepo?.stars ?? 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <GitFork className="w-3.5 h-3.5 text-sky-400" />
              <span>{repoDetails?.forks ?? workspace?.githubRepo?.forks ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Subtabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        {[
          { id: "overview", name: "Overview", icon: Github },
          { id: "tree", name: "Files & Code", icon: Folder },
          { id: "commits", name: "Commit History", icon: GitCommit },
          { id: "pulls", name: "Pull Requests", icon: GitPullRequest },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setSubTab(tab.id);
                setActiveFilePath(null);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                isActive
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.name}</span>
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-2xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : subTab === "overview" ? (
        /* Overview Panel */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                Repository Summary
              </h4>
              <p className="text-sm text-slate-300 leading-relaxed">
                {repoDetails?.description || workspace?.githubRepo?.description || "No repository description provided."}
              </p>
              {repoDetails?.language && (
                <div className="mt-4">
                  <Badge variant="indigo" size="xs">
                    {repoDetails.language}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4 text-xs">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Metadata
            </h4>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Default Branch</span>
              <span className="font-semibold text-slate-200">
                {repoDetails?.defaultBranch || selectedBranch || "main"}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Open Issues</span>
              <span className="font-semibold text-slate-200">
                {repoDetails?.openIssues ?? workspace?.githubRepo?.openIssues ?? 0}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Primary Language</span>
              <span className="font-semibold text-slate-200">
                {repoDetails?.language || workspace?.githubRepo?.language || "Various"}
              </span>
            </div>
          </div>
        </div>
      ) : subTab === "tree" ? (
        /* File Tree & Code Viewer */
        activeFilePath ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            {/* Code Viewer Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveFilePath(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                  title="Back to file list"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <FileCode className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-mono font-semibold text-slate-200">
                  {activeFilePath}
                </span>
              </div>

              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Code Content */}
            <div className="p-4 max-h-[600px] overflow-auto bg-slate-950 font-mono text-xs text-slate-300">
              {fileLoading ? (
                <div className="py-12 flex justify-center">
                  <LoadingSpinner size="md" />
                </div>
              ) : (
                <pre className="whitespace-pre overflow-x-auto leading-relaxed">
                  {fileContent}
                </pre>
              )}
            </div>
          </div>
        ) : (
          /* Tree File Explorer */
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
              Files in {selectedBranch}
            </h4>
            <div className="space-y-1 max-h-[500px] overflow-y-auto divide-y divide-slate-800/40">
              {tree.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No files found or unable to fetch repository tree.
                </div>
              ) : (
                tree.map((item) => (
                  <div
                    key={item.path}
                    onClick={() => item.type === "blob" && handleOpenFile(item.path)}
                    className={`py-2 px-3 rounded-xl flex items-center justify-between text-xs transition ${
                      item.type === "blob"
                        ? "cursor-pointer hover:bg-slate-800 text-slate-300 hover:text-white"
                        : "text-slate-400"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.type === "tree" ? (
                        <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
                      ) : (
                        <FileCode className="w-4 h-4 text-sky-400 shrink-0" />
                      )}
                      <span className="font-mono truncate">{item.path}</span>
                    </div>

                    {item.size && (
                      <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                        {(item.size / 1024).toFixed(1)} KB
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )
      ) : subTab === "commits" ? (
        /* Commits Feed */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
          {commits.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No recent commits found.
            </div>
          ) : (
            commits.map((c) => {
              const commitDate = c.date || c.author?.date;
              let formattedDate = "Recently";
              if (commitDate) {
                const parsed = new Date(commitDate);
                if (!isNaN(parsed.getTime())) {
                  formattedDate = parsed.toLocaleString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                }
              }
              const author =
                c.authorName || c.author?.name || c.authorUsername || "Unknown";
              const branchName = c.branch || selectedBranch || "main";

              return (
                <div
                  key={c.sha}
                  className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <GitCommit className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-slate-200 line-clamp-1">
                        {c.message}
                      </p>
                      <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-200">
                          {author}
                        </span>
                        <span>committed on</span>
                        <span className="text-slate-300 font-medium">
                          {formattedDate}
                        </span>
                        <span>in</span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-indigo-400">
                          <GitBranch className="w-3 h-3" />
                          {branchName}
                        </span>
                      </div>
                    </div>
                  </div>

                  <a
                    href={`https://github.com/${owner}/${repo}/commit/${c.sha}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] text-indigo-400 hover:text-indigo-300 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 shrink-0 hover:border-slate-700 transition"
                  >
                    {c.sha.substring(0, 7)}
                  </a>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Pull Requests List */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
          {pulls.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No pull requests found.
            </div>
          ) : (
            pulls.map((pr) => (
              <div
                key={pr.number}
                className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-start justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <GitPullRequest
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      pr.state === "open" ? "text-emerald-400" : "text-purple-400"
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-100">
                        #{pr.number} {pr.title}
                      </span>
                      <Badge
                        variant={pr.state === "open" ? "emerald" : "purple"}
                        size="xs"
                      >
                        {pr.state}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      by {pr.user?.login} • updated{" "}
                      {new Date(pr.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <a
                  href={pr.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition"
                  title="View PR on GitHub"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
