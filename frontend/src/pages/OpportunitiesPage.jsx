import React, { useState, useEffect } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
  Filter,
  RotateCcw,
  Check,
  X,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { opportunityApi } from "../api/opportunity.api";
import { projectApi } from "../api/project.api";
import { applicationApi } from "../api/application.api";
import { useAuth } from "../context/AuthContext";
import { Badge } from "../components/common/Badge";
import { Modal } from "../components/common/Modal";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ApplyModal } from "../components/matchmaking/ApplyModal";

export const OpportunitiesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id: routeOppId } = useParams();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'recommended' | 'my'
  const [recommended, setRecommended] = useState([]);
  const [allOpportunities, setAllOpportunities] = useState([]);
  const [myPostings, setMyPostings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Filters for "All Openings"
  const [levelFilter, setLevelFilter] = useState("all");
  const [commitmentFilter, setCommitmentFilter] = useState("all");
  const [skillFilter, setSkillFilter] = useState("");

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

  // Responses Modal State (for viewing join requests on an opportunity)
  const [isResponsesOpen, setIsResponsesOpen] = useState(false);
  const [selectedResponsesOpp, setSelectedResponsesOpp] = useState(null);
  const [responsesList, setResponsesList] = useState([]);
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [respondingId, setRespondingId] = useState(null);

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

  // Handle URL route params & search query (e.g. from notification redirection)
  useEffect(() => {
    const oppId = routeOppId || searchParams.get("opportunityId");
    const tabParam = searchParams.get("tab");
    if (tabParam === "my" || oppId) {
      setActiveTab("my");
    }
  }, [routeOppId, searchParams]);

  // Auto-open responses modal when an opportunityId is in the URL and myPostings is loaded
  useEffect(() => {
    const oppId = routeOppId || searchParams.get("opportunityId");
    if (oppId && myPostings.length > 0) {
      const target = myPostings.find(
        (o) => o._id === oppId || o._id?.toString() === oppId.toString()
      );
      if (target && (!isResponsesOpen || selectedResponsesOpp?._id !== target._id)) {
        handleOpenResponses(target);
      }
    }
  }, [routeOppId, searchParams, myPostings]);

  const handleOpenResponses = async (opp) => {
    setSelectedResponsesOpp(opp);
    setIsResponsesOpen(true);
    setResponsesLoading(true);
    try {
      const res = await applicationApi.getOpportunityApplications(opp._id);
      setResponsesList(res.data || []);
    } catch (err) {
      console.error(err);
      setResponsesList([]);
    } finally {
      setResponsesLoading(false);
    }
  };

  const handleRespondToApplication = async (applicationId, statusAction) => {
    try {
      setRespondingId(applicationId);
      await applicationApi.respondApplication(applicationId, statusAction);

      // Update responsesList locally
      setResponsesList((prev) =>
        prev.map((app) =>
          app._id === applicationId
            ? {
                ...app,
                status: statusAction === "accepted" ? "accepted" : "rejected",
              }
            : app
        )
      );

      // Update myPostings counts locally
      setMyPostings((prev) =>
        prev.map((opp) => {
          if (opp._id === selectedResponsesOpp?._id) {
            return {
              ...opp,
              pendingApplicationsCount: Math.max(
                0,
                (opp.pendingApplicationsCount || 1) - 1
              ),
            };
          }
          return opp;
        })
      );
    } catch (err) {
      alert(
        err.response?.data?.message ||
          err.message ||
          "Failed to respond to application"
      );
    } finally {
      setRespondingId(null);
    }
  };

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

  const filteredAllOpportunities = allOpportunities.filter((opp) => {
    // 1. Never show user's own postings in All Openings
    if (isMyOpportunity(opp)) return false;

    // 2. Filter by Experience Level
    if (levelFilter !== "all") {
      const oppLevel = (getExperienceLevel(opp) || "").toLowerCase();
      if (!oppLevel.includes(levelFilter.toLowerCase())) return false;
    }

    // 3. Filter by Commitment
    if (commitmentFilter !== "all") {
      const comm = opp.expectedCommitment;
      if (typeof comm === "string") {
        if (comm.toLowerCase() !== commitmentFilter.toLowerCase()) return false;
      } else if (typeof comm === "number") {
        if (commitmentFilter === "part_time" && (comm < 10 || comm > 25))
          return false;
        if (commitmentFilter === "full_time" && comm < 30) return false;
        if (commitmentFilter === "flexible" && comm > 15) return false;
      }
    }

    // 4. Filter by Skills
    if (skillFilter.trim()) {
      const qSkill = skillFilter.trim().toLowerCase();
      const oppSkills = getSkills(opp).map((s) => s.toLowerCase());
      if (!oppSkills.some((s) => s.includes(qSkill))) return false;
    }

    return true;
  });

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

      {/* Filters for All Openings Tab */}
      {activeTab === "all" && (
        <div className="mb-6 p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-md">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              <span>Filter Openings</span>
            </div>
            {(search ||
              levelFilter !== "all" ||
              commitmentFilter !== "all" ||
              skillFilter) && (
              <button
                onClick={() => {
                  setSearch("");
                  setLevelFilter("all");
                  setCommitmentFilter("all");
                  setSkillFilter("");
                }}
                className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-indigo-400 transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, description..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Level */}
            <div>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Experience Levels</option>
                <option value="junior">Junior / Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead / Architect</option>
              </select>
            </div>

            {/* Commitment */}
            <div>
              <select
                value={commitmentFilter}
                onChange={(e) => setCommitmentFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Commitments</option>
                <option value="part_time">Part-Time (10-20 hrs/wk)</option>
                <option value="full_time">Full-Time (30+ hrs/wk)</option>
                <option value="flexible">Flexible</option>
              </select>
            </div>

            {/* Skill */}
            <div>
              <input
                type="text"
                value={skillFilter}
                onChange={(e) => setSkillFilter(e.target.value)}
                placeholder="Filter by skill (e.g. React, Python)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
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

                  <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatCommitment(opp.expectedCommitment)}</span>
                      <span>•</span>
                      <span className="capitalize">{expLevel}</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => handleOpenResponses(opp)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/30 text-purple-300 text-xs font-semibold transition"
                        title="View applicants who applied to this opening"
                      >
                        <Users className="w-3.5 h-3.5 text-purple-400" />
                        <span>{opp.applicationsCount || 0} Responses</span>
                        {opp.pendingApplicationsCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
                            {opp.pendingApplicationsCount} pending
                          </span>
                        )}
                      </button>

                      <span className="text-[11px] text-slate-400">
                        Posted {new Date(opp.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : filteredAllOpportunities.length === 0 ? (
        <div className="py-16 text-center bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md mx-auto shadow-xl">
          <Briefcase className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-200">
            No openings found
          </h3>
          <p className="text-xs text-slate-400 mt-1 mb-6">
            {search ||
            levelFilter !== "all" ||
            commitmentFilter !== "all" ||
            skillFilter
              ? "No team openings match your current filter criteria."
              : "No team openings posted by other workspaces yet."}
          </p>
          {search ||
          levelFilter !== "all" ||
          commitmentFilter !== "all" ||
          skillFilter ? (
            <button
              onClick={() => {
                setSearch("");
                setLevelFilter("all");
                setCommitmentFilter("all");
                setSkillFilter("");
              }}
              className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
            >
              Reset Filters
            </button>
          ) : canPostOpportunity ? (
            <button
              onClick={handleOpenCreateModal}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
            >
              Post an Opportunity
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredAllOpportunities.map((opp) => {
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
                            <span className="text-[10px] text-slate-400">
                              (@{opp.creator.username})
                            </span>
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
                          const creatorId =
                            (opp.creator?._id || opp.creator)?.toString();
                          if (creatorId) navigate(`/messages?user=${creatorId}`);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition"
                        title={`Chat with ${
                          opp.creator?.fullName ||
                          opp.creator?.username ||
                          "Owner"
                        }`}
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

      {/* Opportunity Responses & Join Requests Modal */}
      <Modal
        isOpen={isResponsesOpen}
        onClose={() => setIsResponsesOpen(false)}
        title={
          selectedResponsesOpp
            ? `Join Requests: ${selectedResponsesOpp.title}`
            : "Opportunity Responses"
        }
      >
        <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
          {responsesLoading ? (
            <div className="py-16 flex justify-center">
              <LoadingSpinner size="md" />
            </div>
          ) : responsesList.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              <Users className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-slate-200 font-semibold text-sm">
                No join requests yet
              </p>
              <p className="mt-1 max-w-xs mx-auto">
                When developers apply to this opening, their join requests with
                profiles and messages will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {responsesList.map((app) => {
                const candidate = app.candidate || {};
                const createdDate = app.createdAt
                  ? new Date(app.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Recently";

                const isPending = app.status === "pending";
                const isAccepted = app.status === "accepted";
                const isRejected = app.status === "rejected";

                const statusBadgeVariant = isAccepted
                  ? "emerald"
                  : isRejected
                  ? "rose"
                  : isPending
                  ? "amber"
                  : "slate";

                return (
                  <div
                    key={app._id}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={
                            candidate.avatar ||
                            `https://api.dicebear.com/7.x/identicon/svg?seed=${
                              candidate.username || "user"
                            }`
                          }
                          alt={candidate.username}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-700 shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-semibold text-slate-100">
                              {candidate.fullName || candidate.username}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              @{candidate.username}
                            </span>
                          </div>
                          {candidate.headline && (
                            <p className="text-[11px] text-slate-400 line-clamp-1">
                              {candidate.headline}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            <span className="text-indigo-400 font-medium">
                              Role: {app.role || "Team Member"}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {createdDate}
                            </span>
                          </div>
                        </div>
                      </div>

                      <Badge
                        variant={statusBadgeVariant}
                        size="xs"
                        className="capitalize shrink-0"
                      >
                        {app.status}
                      </Badge>
                    </div>

                    {/* Candidate Skills */}
                    {Array.isArray(candidate.skills) &&
                      candidate.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {candidate.skills.slice(0, 6).map((sk) => (
                            <span
                              key={sk}
                              className="px-2 py-0.5 rounded-md text-[10px] bg-slate-900 border border-slate-800 text-slate-300"
                            >
                              {sk}
                            </span>
                          ))}
                        </div>
                      )}

                    {/* Application Message */}
                    {app.message && (
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs text-slate-300 italic">
                        "{app.message}"
                      </div>
                    )}

                    {/* Footer Actions */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/profile/${candidate.username}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                          <span>View Profile</span>
                        </Link>

                        <button
                          onClick={() => {
                            const cId = candidate._id || candidate.id;
                            if (cId) navigate(`/messages?user=${cId}`);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-indigo-300 hover:text-indigo-200 transition"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Chat</span>
                        </button>
                      </div>

                      {isPending && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              handleRespondToApplication(app._id, "rejected")
                            }
                            disabled={respondingId === app._id}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold transition disabled:opacity-50"
                          >
                            {respondingId === app._id ? (
                              <LoadingSpinner size="xs" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                            <span>Reject</span>
                          </button>

                          <button
                            onClick={() =>
                              handleRespondToApplication(app._id, "accepted")
                            }
                            disabled={respondingId === app._id}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-md shadow-emerald-600/30 disabled:opacity-50"
                          >
                            {respondingId === app._id ? (
                              <LoadingSpinner size="xs" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Accept</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-end pt-3 border-t border-slate-800">
            <button
              onClick={() => setIsResponsesOpen(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
