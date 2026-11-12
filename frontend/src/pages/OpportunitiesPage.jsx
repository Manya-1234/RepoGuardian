import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Briefcase,
  Sparkles,
  Search,
  Plus,
  Users,
  Clock,
  Layers,
  FolderGit2,
  CheckCircle2,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import { opportunityApi } from "../api/opportunity.api";
import { projectApi } from "../api/project.api";
import { useAuth } from "../context/AuthContext";
import { Badge } from "../components/common/Badge";
import { Modal } from "../components/common/Modal";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ApplyModal } from "../components/matchmaking/ApplyModal";

export const OpportunitiesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'recommended' | 'my'
  const [recommended, setRecommended] = useState([]);
  const [allOpportunities, setAllOpportunities] = useState([]);
  const [myPostings, setMyPostings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Post Opportunity Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [myWorkspaces, setMyWorkspaces] = useState([]);
  const [createForm, setCreateForm] = useState({
    workspaceId: "",
    title: "",
    description: "",
    requiredSkills: "",
    expectedCommitment: "part_time",
    experienceLevel: "intermediate",
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  // Apply Modal State
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);

  const formatCommitment = (val) => {
    if (typeof val === "number") {
      return `${val} hrs/wk`;
    }
    if (typeof val === "string") {
      if (val === "part_time") return "15 hrs/wk (Part-Time)";
      if (val === "full_time") return "35 hrs/wk (Full-Time)";
      if (val === "flexible") return "Flexible";
      return val.replace(/_/g, " ");
    }
    return "10 hrs/wk";
  };

  const getSkills = (opp) => {
    if (Array.isArray(opp?.skillsRequired) && opp.skillsRequired.length > 0) {
      return opp.skillsRequired;
    }
    if (Array.isArray(opp?.requiredSkills) && opp.requiredSkills.length > 0) {
      return opp.requiredSkills;
    }
    return [];
  };

  const getExperienceLevel = (opp) => {
    if (opp?.experienceLevel) return opp.experienceLevel;
    if (opp?.openRoles?.[0]?.experienceLevel) {
      return opp.openRoles[0].experienceLevel;
    }
    return "All Levels";
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      if (activeTab === "recommended") {
        const res = await opportunityApi.getRecommendedForMe();
        const list = Array.isArray(res.data)
          ? res.data
          : res.data?.recommendations || res.data?.opportunities || [];
        setRecommended(list);
      } else if (activeTab === "my") {
        const res = await opportunityApi.getMyOpportunities();
        const list = Array.isArray(res.data)
          ? res.data
          : res.data?.opportunities || [];
        setMyPostings(list);
      } else {
        const res = await opportunityApi.getOpportunities({ search });
        const list = Array.isArray(res.data)
          ? res.data
          : res.data?.opportunities || [];
        setAllOpportunities(list);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkspaces = async () => {
    try {
      const res = await projectApi.getMyProjects();
      const workspaces = Array.isArray(res.data)
        ? res.data
        : res.data?.projects || [];
      setMyWorkspaces(workspaces);
      return workspaces;
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  useEffect(() => {
    fetchData();
  }, [activeTab, search]);

  const handleOpenCreateModal = async () => {
    setIsCreateOpen(true);
    setCreateError("");
    const workspaces = await fetchWorkspaces();
    const manageable = workspaces.filter(canManageWorkspace);
    if (manageable.length > 0) {
      setCreateForm((prev) => ({
        ...prev,
        workspaceId:
          prev.workspaceId && manageable.some((w) => w._id === prev.workspaceId)
            ? prev.workspaceId
            : manageable[0]._id,
      }));
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.workspaceId) {
      setCreateError("Please select a workspace");
      return;
    }
    const chosenWs = myWorkspaces.find((w) => w._id === createForm.workspaceId);
    if (!canManageWorkspace(chosenWs)) {
      setCreateError(
        "Only workspace owners or admins can post opportunities for this workspace"
      );
      return;
    }
    setCreateLoading(true);
    setCreateError("");

    try {
      const skillsArray = createForm.requiredSkills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await opportunityApi.createOpportunity({
        workspace: createForm.workspaceId,
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        skillsRequired: skillsArray,
        requiredSkills: skillsArray,
        expectedCommitment: createForm.expectedCommitment,
        experienceLevel: createForm.experienceLevel,
      });

      setIsCreateOpen(false);
      setCreateForm({
        workspaceId: "",
        title: "",
        description: "",
        requiredSkills: "",
        expectedCommitment: "part_time",
        experienceLevel: "intermediate",
      });

      // Switch to 'my' postings tab so the creator immediately sees what they created!
      setActiveTab("my");
      fetchData();
    } catch (err) {
      setCreateError(err.message || "Failed to create opportunity");
    } finally {
      setCreateLoading(false);
    }
  };

  const isMyOpportunity = (opp) => {
    if (opp?.isOwner) return true;
    const creatorId = (opp.creator?._id || opp.creator)?.toString();
    const currentUserId = (user?._id || user?.id)?.toString();
    return Boolean(creatorId && currentUserId && creatorId === currentUserId);
  };

  const isMemberOfWorkspace = (opp) => {
    if (opp?.isWorkspaceMember) return true;
    const wsId = (opp?.workspace?._id || opp?.workspace)?.toString();
    if (!wsId) return false;
    return myWorkspaces.some((ws) => (ws._id || ws.id)?.toString() === wsId);
  };

  const canManageWorkspace = (ws) => {
    const userIdStr = (user?._id || user?.id)?.toString();
    if (!userIdStr || !ws) return false;
    const ownerId = (ws.owner?._id || ws.owner)?.toString();
    if (ownerId && ownerId === userIdStr) return true;
    const memberRecord = (ws.members || []).find((m) => {
      const mId = (m.user?._id || m.user)?.toString();
      return mId && mId === userIdStr;
    });
    return memberRecord?.role === "admin";
  };

  const manageableWorkspaces = myWorkspaces.filter(canManageWorkspace);
  const canPostOpportunity = manageableWorkspaces.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400">
              <Briefcase className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-100">
              Team Opportunities & Openings
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Discover team openings with explainable compatibility scores or post roles for your workspace
          </p>
        </div>

        {canPostOpportunity && (
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm transition shadow-lg shadow-indigo-600/30"
          >
            <Plus className="w-4 h-4" />
            <span>Post Opportunity</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-6">
        <button
          onClick={() => setActiveTab("all")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === "all"
              ? "bg-slate-800 text-slate-200 border border-slate-700 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Briefcase className="w-4 h-4" />
          All Openings
        </button>

        <button
          onClick={() => setActiveTab("recommended")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === "recommended"
              ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sparkles className="w-4 h-4 text-indigo-400" />
          Recommended for You
        </button>

        <button
          onClick={() => setActiveTab("my")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === "my"
              ? "bg-purple-600/20 text-purple-400 border border-purple-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="w-4 h-4 text-purple-400" />
          My Postings
        </button>
      </div>

      {/* Search Bar for All Tab */}
      {activeTab === "all" && (
        <div className="mb-6 max-w-md relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search opportunities by title or description..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : activeTab === "recommended" ? (
        recommended.length === 0 ? (
          <div className="py-16 text-center bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md mx-auto shadow-xl">
            <Sparkles className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-200">
              No recommendations right now
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Add more skills to your developer profile to trigger automatic compatibility matching with open projects from other teams!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recommended.map((item) => {
              const opp = item.opportunity || item;
              const score = item.compatibilityScore ?? item.matchInfo?.matchScore ?? 0;
              const skills = getSkills(opp);
              const expLevel = getExperienceLevel(opp);
              const explanation =
                item.explanation ||
                (Array.isArray(item.matchInfo?.explanations)
                  ? item.matchInfo.explanations.join(" • ")
                  : "");

              return (
                <div
                  key={opp._id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-6 shadow-xl flex flex-col justify-between transition group"
                >
                  <div>
                    {/* Header with Match Score */}
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">
                          {opp.workspace?.name || "Workspace"}
                        </span>
                        <h3 className="text-base font-bold text-slate-100 group-hover:text-indigo-400 transition mt-0.5">
                          {opp.title}
                        </h3>
                        {opp.creator && (
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Posted by{" "}
                            <Link
                              to={`/profile/${opp.creator.username}`}
                              className="text-slate-300 hover:text-indigo-400 font-medium hover:underline inline-flex items-center gap-0.5"
                            >
                              {opp.creator.fullName || opp.creator.username}
                              <span className="text-[10px] text-slate-400">(@{opp.creator.username})</span>
                            </Link>
                          </p>
                        )}
                      </div>

                      {/* Compatibility Badge */}
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 text-xs font-bold shrink-0">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{score}% Match</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 line-clamp-3 mb-4 leading-relaxed">
                      {opp.description}
                    </p>

                    {/* Match Explanation pills */}
                    {explanation && (
                      <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 mb-4 text-xs space-y-1.5">
                        <p className="text-[11px] font-semibold text-indigo-300">
                          Why this matches your profile:
                        </p>
                        <p className="text-slate-400 text-[11px] leading-relaxed">
                          {explanation}
                        </p>
                      </div>
                    )}

                    {/* Required Skills */}
                    {skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {skills.map((skill) => (
                          <span
                            key={skill}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-slate-950 text-indigo-300 border border-slate-800"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 capitalize">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatCommitment(opp.expectedCommitment)}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {!isMyOpportunity(opp) && opp.creator && (
                        <button
                          onClick={() => {
                            const creatorId = (opp.creator?._id || opp.creator)?.toString();
                            if (creatorId) navigate(`/messages?user=${creatorId}`);
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition"
                          title={`Chat with ${opp.creator?.fullName || opp.creator?.username || "Owner"}`}
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Chat with Owner</span>
                        </button>
                      )}

                      {isMyOpportunity(opp) ? (
                        <Badge variant="indigo" size="xs">
                          Your Posting
                        </Badge>
                      ) : isMemberOfWorkspace(opp) ? (
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 text-xs font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Already a Member</span>
                          </span>
                          {opp.workspace?._id && (
                            <Link
                              to={`/workspaces/${opp.workspace._id}`}
                              className="px-3 py-1.5 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition"
                            >
                              Open Workspace
                            </Link>
                          )}
                        </div>
                      ) : opp.hasApplied ? (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/60 border border-amber-600/40 text-amber-300 text-xs font-semibold">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>Applied (Pending)</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => setSelectedOpportunity(opp)}
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-md shadow-indigo-600/30"
                        >
                          Apply to Join
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : activeTab === "my" ? (
        myPostings.length === 0 ? (
          <div className="py-16 text-center bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md mx-auto shadow-xl">
            <Layers className="w-10 h-10 text-purple-400 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-200">
              No postings yet
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-6">
              {canPostOpportunity
                ? "Post an opportunity for your workspace to recruit talented developers!"
                : "You are currently a team member in your joined workspaces. Workspace owners or admins can post team opportunities."}
            </p>
            {canPostOpportunity && (
              <button
                onClick={handleOpenCreateModal}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
              >
                Post an Opportunity
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {myPostings.map((opp) => {
              const skills = getSkills(opp);
              const expLevel = getExperienceLevel(opp);
              return (
                <div
                  key={opp._id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-6 shadow-xl flex flex-col justify-between transition group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">
                          {opp.workspace?.name || "Workspace"}
                        </span>
                        <h3 className="text-base font-bold text-slate-100 group-hover:text-purple-400 transition mt-0.5">
                          {opp.title}
                        </h3>
                      </div>
                      <Badge variant={opp.status === "open" ? "emerald" : "amber"} size="xs">
                        {opp.status?.toUpperCase() || "OPEN"}
                      </Badge>
                    </div>

                    <p className="text-xs text-slate-300 line-clamp-3 mb-4 leading-relaxed">
                      {opp.description}
                    </p>

                    {skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {skills.map((skill) => (
                          <span
                            key={skill}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-slate-950 text-purple-300 border border-slate-800"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatCommitment(opp.expectedCommitment)}</span>
                      <span>•</span>
                      <span className="capitalize">{expLevel}</span>
                    </div>

                    <span className="text-[11px] text-slate-400">
                      Posted {new Date(opp.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : allOpportunities.length === 0 ? (
        <div className="py-16 text-center bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md mx-auto shadow-xl">
          <Briefcase className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-200">
            No opportunities found
          </h3>
          <p className="text-xs text-slate-400 mt-1 mb-6">
            {search
              ? "Try adjusting your search criteria"
              : "Be the first to post a team opening!"}
          </p>
          {canPostOpportunity && (
            <button
              onClick={handleOpenCreateModal}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
            >
              Post an Opportunity
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {allOpportunities.map((opp) => {
            const skills = getSkills(opp);
            const expLevel = getExperienceLevel(opp);
            const mine = isMyOpportunity(opp);

            return (
              <div
                key={opp._id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-6 shadow-xl flex flex-col justify-between transition group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">
                        {opp.workspace?.name || "Workspace"}
                      </span>
                      <h3 className="text-base font-bold text-slate-100 group-hover:text-indigo-400 transition mt-0.5">
                        {opp.title}
                      </h3>
                      {opp.creator && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Posted by{" "}
                          <Link
                            to={`/profile/${opp.creator.username}`}
                            className="text-slate-300 hover:text-indigo-400 font-medium hover:underline inline-flex items-center gap-0.5"
                          >
                            {opp.creator.fullName || opp.creator.username}
                            <span className="text-[10px] text-slate-400">(@{opp.creator.username})</span>
                          </Link>
                        </p>
                      )}
                    </div>
                    <Badge variant="indigo" size="xs" className="capitalize">
                      {expLevel}
                    </Badge>
                  </div>

                  <p className="text-xs text-slate-300 line-clamp-3 mb-4 leading-relaxed">
                    {opp.description}
                  </p>

                  {skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {skills.map((skill) => (
                        <span
                          key={skill}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-slate-950 text-indigo-300 border border-slate-800"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatCommitment(opp.expectedCommitment)}</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {!mine && opp.creator && (
                      <button
                        onClick={() => {
                          const creatorId = (opp.creator?._id || opp.creator)?.toString();
                          if (creatorId) navigate(`/messages?user=${creatorId}`);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition"
                        title={`Chat with ${opp.creator?.fullName || opp.creator?.username || "Owner"}`}
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Chat with Owner</span>
                      </button>
                    )}

                    {mine ? (
                      <Badge variant="indigo" size="xs">
                        Your Posting
                      </Badge>
                    ) : isMemberOfWorkspace(opp) ? (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 text-xs font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Already a Member</span>
                        </span>
                        {opp.workspace?._id && (
                          <Link
                            to={`/workspaces/${opp.workspace._id}`}
                            className="px-3 py-1.5 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition"
                          >
                            Open Workspace
                          </Link>
                        )}
                      </div>
                    ) : opp.hasApplied ? (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/60 border border-amber-600/40 text-amber-300 text-xs font-semibold">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Applied (Pending)</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => setSelectedOpportunity(opp)}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-md shadow-indigo-600/30"
                      >
                        Apply to Join
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Post Opportunity Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Post a Team Opportunity"
      >
        {!canPostOpportunity ? (
          <div className="space-y-4 py-2">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-semibold">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Owner or Admin Permission Required</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                You are currently a team member in your joined workspaces. Only workspace owners or admins can post team opportunities and recruit developers.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Close
              </button>
              <Link
                to="/workspaces"
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-md shadow-indigo-600/30"
              >
                Create a Workspace
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {createError && (
              <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-xl">
                {createError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Select Workspace (Owned or Admin)
              </label>
              <select
                value={createForm.workspaceId}
                onChange={(e) =>
                  setCreateForm({ ...createForm, workspaceId: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                {manageableWorkspaces.map((ws) => (
                  <option key={ws._id} value={ws._id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Role Title
              </label>
              <input
                type="text"
                required
                value={createForm.title}
                onChange={(e) =>
                  setCreateForm({ ...createForm, title: e.target.value })
                }
                placeholder="e.g. Lead Frontend Developer (React)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Description & Expectations
              </label>
              <textarea
                rows={3}
                required
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm({ ...createForm, description: e.target.value })
                }
                placeholder="Detail the project goals and responsibilities for this role..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Required Skills (comma-separated)
              </label>
              <input
                type="text"
                required
                value={createForm.requiredSkills}
                onChange={(e) =>
                  setCreateForm({ ...createForm, requiredSkills: e.target.value })
                }
                placeholder="React, TailwindCSS, REST API"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Commitment
                </label>
                <select
                  value={createForm.expectedCommitment}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      expectedCommitment: e.target.value,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="part_time">Part-Time (10-20 hrs/wk)</option>
                  <option value="full_time">Full-Time (30+ hrs/wk)</option>
                  <option value="flexible">Flexible</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Experience
                </label>
                <select
                  value={createForm.experienceLevel}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      experienceLevel: e.target.value,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createLoading || manageableWorkspaces.length === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition disabled:opacity-50"
              >
                {createLoading ? <LoadingSpinner size="sm" /> : "Publish Opening"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Apply to Join Modal */}
      <ApplyModal
        isOpen={!!selectedOpportunity}
        onClose={() => setSelectedOpportunity(null)}
        opportunity={selectedOpportunity}
      />
    </div>
  );
};
