import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Send,
  GitBranch,
  Github,
  Database,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ExternalLink,
  RotateCw,
  Trash2,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  Clock,
  Code2,
  Copy,
  Check,
} from "lucide-react";
import { ragApi } from "../../api/rag.api";
import { githubApi } from "../../api/github.api";
import { useSocket } from "../../context/SocketContext";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { Badge } from "../common/Badge";

/**
 * Rich, human-friendly Markdown renderer for conversational AI answers.
 * Transforms headers, bold text, bullet lists, numbered steps, inline code,
 * code blocks, and blockquotes into clean, polished UI elements.
 */
const FormattedAnswer = ({ content, onNavigateToFile }) => {
  if (!content) return null;

  const lines = content.split("\n");
  const renderedElements = [];
  let inCodeBlock = false;
  let codeBlockLines = [];
  let codeBlockLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle code blocks (```lang ... ```)
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        const codeText = codeBlockLines.join("\n");
        renderedElements.push(
          <div
            key={`code-${i}`}
            className="my-3 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden font-mono text-[11px]"
          >
            {codeBlockLang && (
              <div className="px-3 py-1 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex justify-between items-center">
                <span>{codeBlockLang}</span>
              </div>
            )}
            <pre className="p-3 overflow-x-auto text-indigo-200 leading-relaxed whitespace-pre">
              <code>{codeText}</code>
            </pre>
          </div>
        );
        codeBlockLines = [];
        codeBlockLang = "";
        inCodeBlock = false;
      } else {
        // Start code block
        inCodeBlock = true;
        codeBlockLang = line.trim().replace(/^```/, "").trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    const trimmed = line.trim();

    // Horizontal Rule
    if (trimmed === "---" || trimmed === "***") {
      renderedElements.push(
        <hr key={`hr-${i}`} className="border-slate-800 my-3" />
      );
      continue;
    }

    // Headings
    if (trimmed.startsWith("### ")) {
      renderedElements.push(
        <h3
          key={`h3-${i}`}
          className="text-xs font-bold text-indigo-300 mt-3.5 mb-1.5 flex items-center gap-1.5"
        >
          {renderInlineMarkdown(trimmed.replace(/^###\s+/, ""), onNavigateToFile)}
        </h3>
      );
      continue;
    }
    if (trimmed.startsWith("#### ")) {
      renderedElements.push(
        <h4
          key={`h4-${i}`}
          className="text-[11px] font-bold text-slate-200 mt-2.5 mb-1 tracking-wide uppercase"
        >
          {renderInlineMarkdown(trimmed.replace(/^####\s+/, ""), onNavigateToFile)}
        </h4>
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      renderedElements.push(
        <h2
          key={`h2-${i}`}
          className="text-sm font-bold text-slate-100 mt-4 mb-2 flex items-center gap-2"
        >
          {renderInlineMarkdown(trimmed.replace(/^##\s+/, ""), onNavigateToFile)}
        </h2>
      );
      continue;
    }

    // Blockquotes (> Notice / Note)
    if (trimmed.startsWith("> ")) {
      renderedElements.push(
        <div
          key={`quote-${i}`}
          className="my-2 p-2.5 rounded-xl bg-indigo-950/40 border-l-2 border-indigo-500 text-[11px] text-indigo-200/90 leading-relaxed italic"
        >
          {renderInlineMarkdown(trimmed.replace(/^>\s*/, ""), onNavigateToFile)}
        </div>
      );
      continue;
    }

    // Bullet points (- or *)
    if (/^[-*]\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^[-*]\s+/, "");
      renderedElements.push(
        <div
          key={`li-${i}`}
          className="flex items-start gap-2 my-1 text-slate-300 text-xs leading-relaxed"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
          <div className="flex-1">
            {renderInlineMarkdown(itemText, onNavigateToFile)}
          </div>
        </div>
      );
      continue;
    }

    // Numbered steps (1. 2. 3.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (match) {
        const stepNum = match[1];
        const stepText = match[2];
        renderedElements.push(
          <div
            key={`step-${i}`}
            className="flex items-start gap-2.5 my-1.5 text-slate-300 text-xs leading-relaxed"
          >
            <span className="w-4 h-4 rounded-md bg-indigo-900/60 text-indigo-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-indigo-700/50">
              {stepNum}
            </span>
            <div className="flex-1">
              {renderInlineMarkdown(stepText, onNavigateToFile)}
            </div>
          </div>
        );
        continue;
      }
    }

    // Empty lines
    if (!trimmed) {
      renderedElements.push(<div key={`sp-${i}`} className="h-2" />);
      continue;
    }

    // Standard paragraph
    renderedElements.push(
      <p
        key={`p-${i}`}
        className="my-1.5 text-slate-300 text-xs leading-relaxed"
      >
        {renderInlineMarkdown(line, onNavigateToFile)}
      </p>
    );
  }

  return <div className="space-y-0.5 font-sans">{renderedElements}</div>;
};

/**
 * Parses bold, inline code, and clickable markdown links
 */
const renderInlineMarkdown = (text, onNavigateToFile) => {
  if (!text) return null;

  // Split tokens by code `...`, bold **...**, and markdown links [...](...)
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // Inline code: `code`
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={idx}
          className="font-mono text-indigo-300 bg-slate-900 px-1.5 py-0.5 rounded text-[11px] border border-slate-800"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold text: **bold**
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Markdown link: [text](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const linkText = linkMatch[1];
      const linkUrl = linkMatch[2];

      const isFileLink =
        linkUrl.startsWith("file:///") || linkUrl.includes("/") || linkUrl.includes(".js") || linkUrl.includes(".jsx") || linkUrl.includes(".ts") || linkUrl.includes(".tsx");

      if (isFileLink && onNavigateToFile) {
        const cleanPath = linkUrl
          .replace(/^file:\/\/\//, "")
          .split("#")[0];

        return (
          <button
            key={idx}
            onClick={() => onNavigateToFile(cleanPath)}
            className="inline-flex items-center gap-1 font-mono text-[11px] text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition cursor-pointer"
            title={`Inspect ${cleanPath} in GitHub Explorer`}
          >
            <span>{linkText}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
          </button>
        );
      }

      return (
        <a
          key={idx}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition"
        >
          {linkText}
        </a>
      );
    }

    return part;
  });
};

export const CodebaseAssistant = ({ workspace, onNavigateToFile }) => {
  const { socket } = useSocket();
  const repoOwner = workspace?.githubRepo?.owner;
  const repoName = workspace?.githubRepo?.name;
  const isLinked = !!(repoOwner && repoName);

  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(
    workspace?.githubRepo?.defaultBranch || "main"
  );

  const [indexingStatus, setIndexingStatus] = useState(null);

  const [messages, setMessages] = useState([]);
  const [inputQuestion, setInputQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [expandedEvidence, setExpandedEvidence] = useState(new Set());

  const toggleEvidence = (msgId) => {
    setExpandedEvidence((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const chatEndRef = useRef(null);

  // Suggested starter questions
  const suggestedQuestions = [
    "Explain the overall architecture and folder structure of this repository",
    "Where is authentication implemented and how does login work?",
    "Which files define the database models, schemas, and entities?",
    "Find all API routes and explain how endpoints are handled",
    "How are errors, exceptions, and middlewares handled?",
    "What third-party packages, libraries, or external services are used?",
  ];

  // 1. Fetch available branches
  useEffect(() => {
    if (!workspace?._id || !isLinked) return;

    const fetchBranches = async () => {
      try {
        const res = await githubApi.getBranches(workspace._id);
        const branchList = Array.isArray(res.data) ? res.data : [];
        setBranches(branchList);
        if (
          branchList.length > 0 &&
          !branchList.some((b) => b.name === selectedBranch)
        ) {
          setSelectedBranch(branchList[0].name);
        }
      } catch (err) {
        console.warn("Failed to load branches:", err);
      }
    };

    fetchBranches();
  }, [workspace?._id, isLinked]);

  // 2. Fetch indexing status for selected branch & auto-poll while indexing
  const fetchStatus = async () => {
    if (!workspace?._id || !isLinked) return;
    try {
      const res = await ragApi.getIndexingStatus(workspace._id, selectedBranch);
      setIndexingStatus(res.data);
    } catch (err) {
      console.warn("Failed to load indexing status:", err);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [workspace?._id, selectedBranch, isLinked]);

  // Automatic background refresh while indexing is in progress (no manual button needed)
  useEffect(() => {
    if (!workspace?._id || !isLinked) return;
    if (
      indexingStatus?.status === "indexing" ||
      indexingStatus?.status === "queued" ||
      indexingStatus?.status === "partially_indexed"
    ) {
      const timer = setInterval(() => {
        fetchStatus();
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [workspace?._id, selectedBranch, isLinked, indexingStatus?.status]);

  // 3. Listen for live indexing progress events over Socket.IO
  useEffect(() => {
    if (!socket || !workspace?._id) return;

    const handleProgress = (data) => {
      setIndexingStatus((prev) => ({
        ...prev,
        status: data.status,
        progress: data.progress ?? prev?.progress,
        currentStep: data.step ?? prev?.currentStep,
        indexedFiles: data.indexedFiles ?? prev?.indexedFiles,
        totalChunks: data.totalChunks ?? prev?.totalChunks,
        error: data.error ?? null,
      }));
    };

    socket.on("indexing_progress", handleProgress);
    return () => {
      socket.off("indexing_progress", handleProgress);
    };
  }, [socket, workspace?._id]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAsking]);

  // Handle submitting user question
  const handleAsk = async (questionText = null) => {
    const q = (questionText || inputQuestion).trim();
    if (!q || isAsking) return;

    const userMsg = {
      id: Date.now().toString(),
      sender: "user",
      text: q,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuestion("");
    setIsAsking(true);
    setError("");

    try {
      // Pass previous conversation turns for follow-up question continuity
      const conversationHistory = messages.slice(-6).map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.text,
      }));

      const res = await ragApi.askRepository(workspace._id, {
        question: q,
        branch: selectedBranch,
        history: conversationHistory,
      });

      const aiMsg = {
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        text: res.data?.answer || "No response generated.",
        sources: res.data?.sources || [],
        relatedFiles: res.data?.relatedFiles || [],
        confidence: res.data?.confidence || "medium",
        chunksCount: res.data?.retrievedChunksCount || 0,
        isIndexing: res.data?.isIndexing || false,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMsg]);
      if (res.data?.isIndexing) {
        fetchStatus();
      }
    } catch (err) {
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        isError: true,
        text: `Error: ${err.message || "Failed to retrieve answer from repository"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsAsking(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setError("");
  };

  if (!isLinked) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-xl mx-auto text-center shadow-xl">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 mx-auto flex items-center justify-center mb-4">
          <Sparkles className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-100">
          Connect GitHub Repository First
        </h3>
        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
          RepoGuardian Codebase Intelligence requires a connected GitHub
          repository to inspect files, extract AST symbol graphs, and perform
          grounded question answering. Please link a repository in the GitHub
          Explorer tab.
        </p>
      </div>
    );
  }

  const isIndexing =
    indexingStatus?.status === "indexing" || indexingStatus?.status === "queued";
  const isPartial = indexingStatus?.status === "partially_indexed";
  const isIndexed =
    indexingStatus?.status === "completed" &&
    (indexingStatus?.totalChunks > 0 || indexingStatus?.totalFiles === 0);
  const isFailed = indexingStatus?.status === "failed";

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/25">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100">
                Codebase Intelligence & RAG
              </h2>
              <Badge variant="purple" size="xs">
                Repository-Aware
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Ask natural-language questions grounded in the actual source code,
              AST symbols, and dependency relationships of{" "}
              <span className="font-mono text-indigo-300">
                {repoOwner}/{repoName}
              </span>
              .
            </p>
          </div>
        </div>

        {/* Branch Selector */}
        <div className="flex items-center gap-2 self-start md:self-center">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
            <GitBranch className="w-3.5 h-3.5 text-indigo-400" /> Branch:
          </span>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            disabled={isIndexing}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          >
            {branches.length > 0 ? (
              branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))
            ) : (
              <option value={selectedBranch}>{selectedBranch}</option>
            )}
          </select>
        </div>
      </div>

      {/* Compact Automatic Repository Status Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl ${
                isIndexed
                  ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                  : isIndexing || isPartial
                  ? "bg-indigo-950/60 text-indigo-400 border border-indigo-800/40 animate-pulse"
                  : isFailed
                  ? "bg-rose-950/60 text-rose-400 border border-rose-800/40"
                  : "bg-slate-950 text-slate-400 border border-slate-800"
              }`}
            >
              <Database className="w-4 h-4" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-200">
                  {repoOwner}/{repoName}
                </span>
                <span className="text-[11px] font-mono text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/40">
                  {selectedBranch}
                </span>
                <Badge
                  variant={
                    isIndexed
                      ? "emerald"
                      : isIndexing || isPartial || isFailed
                      ? "indigo"
                      : "slate"
                  }
                  size="xs"
                >
                  {isIndexed
                    ? "KNOWLEDGE READY"
                    : isIndexing
                    ? `INDEXING (${indexingStatus?.progress || 10}%)`
                    : isPartial
                    ? "PARTIAL KNOWLEDGE"
                    : isFailed
                    ? "UPDATING KNOWLEDGE"
                    : "PREPARING"}
                </Badge>
                {indexingStatus?.totalChunks > 0 && (
                  <span className="text-[11px] text-slate-400 font-mono">
                    ({indexingStatus.totalChunks} chunks across{" "}
                    {indexingStatus.indexedFiles} files)
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-400 mt-0.5">
                {isIndexing
                  ? indexingStatus?.currentStep ||
                    "Preparing repository knowledge in the background..."
                  : isPartial
                  ? "Partial code indexed — questions can be answered from available files while remaining files process."
                  : isIndexed
                  ? `Repository knowledge is ready. (Commit: ${indexingStatus?.lastIndexedCommitSha?.substring(0, 7) || "latest"})`
                  : isFailed
                  ? "Updating repository knowledge in the background..."
                  : "Analyzing repository structure in background..."}
              </p>
            </div>
          </div>

          {/* Automatic Non-Clickable Live Status Indicator */}
          <div className="flex items-center gap-1.5 self-end sm:self-center">
            {isIndexing || isPartial || isFailed ? (
              <span className="flex items-center gap-1.5 text-indigo-400 bg-indigo-950/40 border border-indigo-800/40 px-2.5 py-1 rounded-xl text-[11px]">
                <RotateCw className="w-3 h-3 animate-spin text-indigo-400" />
                <span>Auto-Indexing...</span>
              </span>
            ) : isIndexed ? (
              <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-xl text-[11px]">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Synchronized</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-slate-400 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-xl text-[11px]">
                <ShieldCheck className="w-3 h-3 text-indigo-400" />
                <span>Connected</span>
              </span>
            )}
          </div>
        </div>

        {/* Subtle Non-Blocking Progress Bar */}
        {(isIndexing || isPartial) && (
          <div className="mt-3 w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${indexingStatus?.progress || 10}%` }}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="p-3.5 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Q&A Interface */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col min-h-[580px]">
        {/* Chat Header Bar */}
        <div className="px-6 py-3.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold text-slate-200">
              Repository Intelligence Conversation
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              ({selectedBranch})
            </span>
          </div>

          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-400 transition"
              title="Clear conversation history"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Messages Feed */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5 max-h-[520px]">
          {messages.length === 0 ? (
            <div className="py-10 text-center max-w-xl mx-auto space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 text-indigo-400 mx-auto flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Ask Anything About Your Codebase
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Every answer is strictly grounded in retrieved code chunks,
                  AST symbols, and dependency relationships from this repository.
                </p>
              </div>

              {/* Starter Questions Grid */}
              <div className="pt-2 text-left space-y-2">
                <p className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider text-center">
                  Suggested Questions
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {suggestedQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAsk(q)}
                      className="text-left p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-950/80 text-xs text-slate-300 hover:text-white transition flex items-center justify-between group cursor-pointer"
                    >
                      <span>{q}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${
                  msg.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.sender === "assistant" && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-md">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`rounded-2xl p-4 text-xs space-y-3 leading-relaxed shadow-lg ${
                    msg.sender === "user"
                      ? "max-w-xl bg-indigo-600 text-white rounded-tr-none"
                      : msg.isError
                      ? "max-w-3xl bg-rose-950/50 border border-rose-800 text-rose-300"
                      : "max-w-3xl w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-none"
                  }`}
                >
                  {/* Top Bar for Assistant Messages: Title, Confidence, Copy */}
                  {msg.sender === "assistant" && !msg.isError && (
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200 text-[11px] flex items-center gap-1.5">
                          <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                          Codebase Intelligence
                        </span>
                        {msg.confidence && (
                          <Badge
                            variant={
                              msg.confidence === "high"
                                ? "emerald"
                                : msg.confidence === "medium"
                                ? "indigo"
                                : "amber"
                            }
                            size="xs"
                          >
                            {msg.confidence.toUpperCase()} CONFIDENCE
                          </Badge>
                        )}
                      </div>

                      <button
                        onClick={() => handleCopy(msg.text, msg.id)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] text-slate-300 hover:text-white transition cursor-pointer"
                        title="Copy answer to clipboard"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-slate-400" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Primary Message Content (Human-Centric Formatted Explanation) */}
                  {msg.sender === "assistant" && !msg.isError ? (
                    <FormattedAnswer
                      content={msg.text}
                      onNavigateToFile={onNavigateToFile}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap font-sans text-xs">
                      {msg.text}
                    </div>
                  )}

                  {/* Secondary Content: Collapsible Supporting Evidence Section */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="pt-3 border-t border-slate-800/80 space-y-2">
                      <button
                        onClick={() => toggleEvidence(msg.id)}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-900 hover:bg-slate-900/90 border border-slate-800/90 text-xs transition cursor-pointer group"
                      >
                        <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5 group-hover:text-indigo-300 transition">
                          <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                          Supporting Evidence ({msg.sources.length} verified source{msg.sources.length > 1 ? "s" : ""})
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 group-hover:text-slate-200 transition">
                          <span>{expandedEvidence.has(msg.id) ? "Hide Details" : "View Sources"}</span>
                          {expandedEvidence.has(msg.id) ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </span>
                      </button>

                      {expandedEvidence.has(msg.id) && (
                        <div className="grid grid-cols-1 gap-2 pt-1">
                          {msg.sources.map((src, sIdx) => (
                            <div
                              key={sIdx}
                              className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 transition flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono text-slate-100 font-semibold truncate text-[11px]">
                                    {src.filePath}
                                  </span>
                                  <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/40">
                                    L{src.startLine}-L{src.endLine}
                                  </span>
                                  {src.symbolName && (
                                    <Badge variant="purple" size="xs">
                                      {src.symbolType || "symbol"}: {src.symbolName}
                                    </Badge>
                                  )}
                                </div>
                                {src.relevance && (
                                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                                    {src.relevance}
                                  </p>
                                )}
                              </div>

                              {onNavigateToFile && (
                                <button
                                  onClick={() => onNavigateToFile(src.filePath)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] font-semibold text-slate-300 hover:text-white transition flex items-center gap-1 shrink-0 cursor-pointer"
                                  title="Inspect file in GitHub Explorer"
                                >
                                  <span>Inspect</span>
                                  <ExternalLink className="w-3 h-3 text-slate-400" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Related Files Tags */}
                  {msg.relatedFiles && msg.relatedFiles.length > 0 && (
                    <div className="pt-2 flex items-center gap-1.5 flex-wrap border-t border-slate-800/50">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                        Related:
                      </span>
                      {msg.relatedFiles.map((rf, rfIdx) => (
                        <button
                          key={rfIdx}
                          onClick={() =>
                            onNavigateToFile && onNavigateToFile(rf)
                          }
                          className="font-mono text-[10px] text-slate-400 hover:text-indigo-300 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800 hover:border-indigo-500/40 cursor-pointer transition"
                          title={`Inspect ${rf}`}
                        >
                          {rf}
                        </button>
                      ))}
                    </div>
                  )}

                  <span className="text-[9px] text-slate-500 block text-right pt-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))
          )}

          {isAsking && (
            <div className="flex gap-3 justify-start items-center">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 animate-pulse">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center gap-2.5">
                <LoadingSpinner size="sm" />
                <span>
                  Searching repository AST, symbols & assembling evidence...
                </span>
              </div>
            </div>
          )}

          {/* Contextual Follow-Up Suggestions */}
          {messages.length > 0 && !isAsking && (
            <div className="pt-2 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Follow-up Questions:
              </span>
              {[
                "Explain the backend in simple terms",
                "How does the frontend communicate with the backend?",
                "Explain the complete login flow step by step",
                "What happens when a user creates a new project?",
              ].map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAsk(suggestion)}
                  className="px-2.5 py-1 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/50 text-[11px] text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1"
                >
                  <span>{suggestion}</span>
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                </button>
              ))}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="flex items-center gap-3"
          >
            <input
              type="text"
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              placeholder={`Ask anything about ${repoOwner}/${repoName} (${selectedBranch}) e.g. architecture, models, login flow...`}
              disabled={isAsking}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={isAsking || !inputQuestion.trim()}
              className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-md shadow-indigo-600/30 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isAsking ? <LoadingSpinner size="sm" /> : <Send className="w-4 h-4" />}
              <span>Ask AI</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
