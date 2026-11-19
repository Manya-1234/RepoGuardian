import React from "react";
import { Link } from "react-router-dom";
import {
  Shield,
  GitBranch,
  Users,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Code2,
  Zap,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export const LandingPage = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="relative overflow-hidden">
      {/* Background radial gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-indigo-600/20 via-indigo-900/5 to-transparent blur-3xl pointer-events-none" />

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-950/70 border border-indigo-700/60 text-indigo-300 text-xs font-semibold mb-6 shadow-inner animate-pulse">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Next-Gen Developer Workspace & Collaboration</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-100 max-w-4xl mx-auto leading-tight">
          Smarter Collaboration for{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-sky-300 to-indigo-200 bg-clip-text text-transparent">
            Modern Developer Teams
          </span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Find matched teammates, coordinate work with live Kanban boards, chat in real time, and explore connected GitHub repositories in one unified workspace.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to={isAuthenticated ? "/workspaces" : "/register"}
            className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2.5"
          >
            <span>{isAuthenticated ? "Go to Workspaces" : "Get Started Free"}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            to="/developers"
            className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-sm transition flex items-center justify-center gap-2"
          >
            <Users className="w-4 h-4 text-slate-400" />
            <span>Discover Developers</span>
          </Link>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 text-left">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-indigo-500/50 transition">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mb-4">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-100">
              Explainable Matchmaking
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Find the right teammates based on mathematical skill overlap, commitment availability, and domain experience with clear match percentages.
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-indigo-500/50 transition">
            <div className="w-10 h-10 rounded-xl bg-sky-600/20 text-sky-400 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-100">
              Real-Time Kanban Tasks
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Assign tasks, link GitHub pull requests, set priorities, and see live status transitions instantly across all team members via WebSockets.
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-indigo-500/50 transition">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center mb-4">
              <GitBranch className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-100">
              GitHub Repo Intelligence
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Connect public and private GitHub repositories. Browse git trees, inspect commits, view active pull requests, and read source files right inside the workspace.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
