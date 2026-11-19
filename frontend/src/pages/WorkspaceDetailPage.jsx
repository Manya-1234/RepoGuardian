import React, { useState, useEffect } from "react";
import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  CheckCircle2,
  MessageSquare,
  Github,
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  Mail,
  Trash2,
  Sparkles,
} from "lucide-react";
import { projectApi } from "../api/project.api";
import { chatApi } from "../api/chat.api";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { KanbanBoard } from "../components/kanban/KanbanBoard";
import { ChatWindow } from "../components/chat/ChatWindow";
import { GitHubExplorer } from "../components/github/GitHubExplorer";
import { CodebaseAssistant } from "../components/rag/CodebaseAssistant";
import { Modal } from "../components/common/Modal";
import { Badge } from "../components/common/Badge";
import { LoadingSpinner } from "../components/common/LoadingSpinner";

export const WorkspaceDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: currentUser } = useAuth();
  const { socket } = useSocket();

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const tabFromQuery = searchParams.get("tab");
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(
    tabFromQuery && ["kanban", "chat", "github", "ai", "members"].includes(tabFromQuery)
      ? tabFromQuery
      : "kanban"
  );
  const [chatConversationId, setChatConversationId] = useState(null);
  const [selectedFileForExplorer, setSelectedFileForExplorer] = useState(null);

  // Synchronize activeTab with URL search params (e.g. when clicking notifications or links with ?tab=chat)
  useEffect(() => {
    if (
      tabFromQuery &&
      ["kanban", "chat", "github", "ai", "members"].includes(tabFromQuery) &&
      tabFromQuery !== activeTab
    ) {
      setActiveTab(tabFromQuery);
    }
  }, [tabFromQuery]);

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newTab === "kanban") {
          next.delete("tab");
        } else {
          next.set("tab", newTab);
        }
        return next;
      },
      { replace: true }
    );
  };

  // Invite Modal State
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const fetchWorkspace = async () => {
    try {
      setLoading(true);
      const res = await projectApi.getProjectById(id);
      setWorkspace(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchWorkspace();
    }
  }, [id]);

  // Real-time workspace synchronization
  useEffect(() => {
    if (!socket || !id) return;
    socket.emit("join_workspace", id);

    const handleWorkspaceUpdated = (updated) => {
      if (
        updated &&
        (updated._id === id || updated._id?.toString() === id.toString())
      ) {
        setWorkspace(updated);
      }
    };

    const handleMemberRemoved = ({ projectId, workspace: updatedWs }) => {
      if (projectId?.toString() === id.toString()) {
        if (updatedWs) setWorkspace(updatedWs);
        else fetchWorkspace();
      }
    };

    const handleMemberRoleUpdated = ({ projectId, workspace: updatedWs }) => {
      if (projectId?.toString() === id.toString()) {
        if (updatedWs) setWorkspace(updatedWs);
        else fetchWorkspace();
      }
    };

    const handleWorkspaceDeleted = ({ projectId }) => {
      if (projectId?.toString() === id.toString()) {
        alert("This workspace has been deleted by the owner.");
        navigate("/workspaces");
      }
    };

    socket.on("workspace_updated", handleWorkspaceUpdated);
    socket.on("member_removed", handleMemberRemoved);
    socket.on("member_role_updated", handleMemberRoleUpdated);
    socket.on("workspace_deleted", handleWorkspaceDeleted);

    return () => {
      socket.emit("leave_workspace", id);
      socket.off("workspace_updated", handleWorkspaceUpdated);
      socket.off("member_removed", handleMemberRemoved);
      socket.off("member_role_updated", handleMemberRoleUpdated);
      socket.off("workspace_deleted", handleWorkspaceDeleted);
    };
  }, [socket, id]);

  // Load workspace conversation for the Chat tab
  useEffect(() => {
    if (id && activeTab === "chat") {
      const loadChat = async () => {
        try {
          const res = await chatApi.getWorkspaceChat(id);
          setChatConversationId(res.data?._id);
        } catch (err) {
          console.error(err);
        }
      };
      loadChat();
    }
  }, [id, activeTab]);

  const isOwner =
    (workspace?.owner?._id || workspace?.owner)?.toString() === currentUser?._id?.toString();

  const isAdmin =
    isOwner ||
    (workspace?.members || []).some((m) => {
      const uId = (m.user?._id || m.user)?.toString();
      return uId === currentUser?._id?.toString() && m.role === "admin";
    });

  const canManageTasks = isOwner || isAdmin;

  const isMember =
    isOwner ||
    workspace?.members?.some((m) => {
      const uId = (m.user?._id || m.user)?.toString();
      return uId === currentUser?._id?.toString();
    });

  const ownerId = (workspace?.owner?._id || workspace?.owner)?.toString();
  const otherMembers = (workspace?.members || []).filter((m) => {
    const mId = (m.user?._id || m.user)?.toString();
    return mId && mId !== ownerId;
  });

  const allMembers = workspace
    ? [
        {
          user: workspace.owner,
          role: "owner",
          isOwner: true,
        },
        ...otherMembers.map((m) => ({
          user: m.user,
          role: (m.role || "member").toLowerCase(),
          isOwner: false,
        })),
      ]
    : [];

  const handleUpdateRole = async (userId, newRole) => {
    try {
      const res = await projectApi.updateMemberRole(id, userId, newRole);
      if (res.data) setWorkspace(res.data);
    } catch (err) {
      alert(err.response?.data?.message || err.message || "Failed to update role");
    }
  };

  const handleRemoveMember = async (userId, memberName) => {
    if (
      !window.confirm(
        `Are you sure you want to remove ${memberName || "this member"} from the workspace?`
      )
    ) {
      return;
    }
    try {
      const res = await projectApi.removeMember(id, userId);
      if (res.data) setWorkspace(res.data);
    } catch (err) {
      alert(err.response?.data?.message || err.message || "Failed to remove member");
    }
  };

  const handleSendInvite = async (e) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError("");

    try {
      await projectApi.inviteMember(id, {
        emailOrUsername: inviteUsername.trim(),
        username: inviteUsername.trim(),
        role: inviteRole,
      });

      setInviteSuccess(true);
      setTimeout(() => {
        setInviteSuccess(false);
        setIsInviteOpen(false);
        setInviteUsername("");
        fetchWorkspace();
      }, 1200);
    } catch (err) {
      setInviteError(err.message || "Failed to invite member");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleDeleteWorkspace = async () => {
    try {
      setDeleteLoading(true);
      setDeleteError("");
      await projectApi.deleteProject(id);
      setIsDeleteModalOpen(false);
      navigate("/workspaces");
    } catch (err) {
      setDeleteError(err.response?.data?.message || err.message || "Failed to delete workspace");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-slate-400">
        Workspace not found or unauthorized.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between">
        <Link
          to="/workspaces"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Workspaces</span>
        </Link>

        {isOwner && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsInviteOpen(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-md shadow-indigo-600/30"
            >
              <UserPlus className="w-4 h-4" />
              <span>Invite Member</span>
            </button>
            <button
              onClick={() => setIsDeleteModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-900/40 bg-rose-950/20 hover:bg-rose-950/50 text-rose-400 hover:text-rose-300 text-xs font-semibold transition"
              title="Delete workspace"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Workspace</span>
            </button>
          </div>
        )}
      </div>

      {/* Workspace Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
              {workspace.name}
            </h1>
            <Badge variant="indigo" size="xs">
              {allMembers.length} {allMembers.length === 1 ? "Member" : "Members"}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            {workspace.description || "No workspace description."}
          </p>
        </div>

        {workspace.githubRepo?.owner && (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
            <Github className="w-4 h-4 text-indigo-400" />
            <span className="font-mono">
              {workspace.githubRepo.owner}/{workspace.githubRepo.repo}
            </span>
          </div>
        )}
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
        {[
          { id: "kanban", name: "Kanban Tasks", icon: CheckCircle2 },
          { id: "chat", name: "Team Chat", icon: MessageSquare },
          { id: "github", name: "GitHub Explorer", icon: Github },
          { id: "ai", name: "Codebase Intelligence", icon: Sparkles },
          { id: "members", name: "Team Members", icon: Users },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
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

      {/* Tab Panels */}
      {activeTab === "kanban" && (
        <KanbanBoard
          workspaceId={workspace._id}
          members={allMembers}
          isMember={isMember}
          canManageTasks={canManageTasks}
        />
      )}

      {activeTab === "chat" && (
        <div className="max-w-4xl mx-auto">
          {chatConversationId ? (
            <ChatWindow
              conversationId={chatConversationId}
              title={`${workspace.name} Channel`}
              placeholder={`Send message to #${workspace.name.toLowerCase()}...`}
            />
          ) : (
            <div className="py-20 flex justify-center">
              <LoadingSpinner size="md" />
            </div>
          )}
        </div>
      )}

      {activeTab === "github" && (
        <GitHubExplorer
          workspace={workspace}
          isOwner={isOwner}
          selectedFile={selectedFileForExplorer}
          onOpenAI={() => handleTabChange("ai")}
          onWorkspaceUpdated={(updated) => setWorkspace(updated)}
        />
      )}

      {activeTab === "ai" && (
        <CodebaseAssistant
          workspace={workspace}
          onNavigateToFile={(filePath, startLine) => {
            setSelectedFileForExplorer({ path: filePath, line: startLine });
            handleTabChange("github");
          }}
        />
      )}

      {activeTab === "members" && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Workspace Members ({allMembers.length})
            </h3>
            {isOwner && (
              <button
                onClick={() => setIsInviteOpen(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" /> Invite Teammate
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-800/80">
            {allMembers.map((m, idx) => {
              const u = m.user || {};
              const uId = (u._id || u.id)?.toString();
              const isThisOwner = m.isOwner;
              const isThisAdmin = m.role === "admin";
              const canDemote = isOwner && !isThisOwner && isThisAdmin;
              const canPromote = isOwner && !isThisOwner && !isThisAdmin;
              const canRemove =
                (isOwner && !isThisOwner) ||
                (isAdmin && !isOwner && !isThisOwner && !isThisAdmin);

              const roleBadgeVariant = isThisOwner
                ? "purple"
                : isThisAdmin
                ? "amber"
                : "indigo";

              const roleLabel = isThisOwner
                ? "Owner"
                : isThisAdmin
                ? "Admin"
                : "Member";

              return (
                <div
                  key={uId || idx}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={
                        u.avatar ||
                        `https://api.dicebear.com/7.x/identicon/svg?seed=${u.username || "user"}`
                      }
                      alt={u.username}
                      className="w-10 h-10 rounded-xl object-cover border border-slate-700"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/profile/${u.username}`}
                          className="text-sm font-semibold text-slate-100 hover:text-indigo-400 transition"
                        >
                          {u.fullName || u.username}
                        </Link>
                        <Badge variant={roleBadgeVariant} size="xs">
                          {roleLabel}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400">@{u.username}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                    {/* Make Admin Button (Only Owner can promote) */}
                    {canPromote && (
                      <button
                        onClick={() => handleUpdateRole(uId, "admin")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold transition"
                        title="Promote member to Workspace Admin"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Make Admin</span>
                      </button>
                    )}

                    {/* Remove Admin Button (Only Owner can demote) */}
                    {canDemote && (
                      <button
                        onClick={() => handleUpdateRole(uId, "member")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition"
                        title="Demote admin to regular Member"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                        <span>Remove Admin</span>
                      </button>
                    )}

                    {/* Remove Member Button (Owner or Admin) */}
                    {canRemove && (
                      <button
                        onClick={() =>
                          handleRemoveMember(uId, u.fullName || u.username)
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition"
                        title="Remove user from workspace"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove Member</span>
                      </button>
                    )}

                    <Link
                      to={`/profile/${u.username}`}
                      className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 hover:text-white transition"
                    >
                      View Profile
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invite Teammate to Workspace"
      >
        <form onSubmit={handleSendInvite} className="space-y-4">
          {inviteError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-xl">
              {inviteError}
            </div>
          )}

          {inviteSuccess && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs rounded-xl">
              Invitation sent successfully!
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Username or Email
            </label>
            <input
              type="text"
              required
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              placeholder="e.g. johndoe"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Workspace Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="member">Member (Developer)</option>
              <option value="admin">Admin (Lead / Maintainer)</option>
              <option value="viewer">Viewer (Read-only)</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsInviteOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={inviteLoading}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition disabled:opacity-50"
            >
              {inviteLoading ? <LoadingSpinner size="sm" /> : "Send Invitation"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Workspace Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!deleteLoading) {
            setIsDeleteModalOpen(false);
            setDeleteError("");
          }
        }}
        title="Delete Workspace"
      >
        <div className="space-y-4">
          {deleteError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-xl">
              {deleteError}
            </div>
          )}

          <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-900/40 text-xs text-rose-300 space-y-2">
            <p className="font-semibold text-rose-200">
              Warning: This action is permanent and cannot be undone.
            </p>
            <p className="text-rose-300/80">
              Deleting workspace{" "}
              <strong className="text-white">"{workspace?.name}"</strong> will permanently delete all associated tasks, team chat messages, and member invitations.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={deleteLoading}
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeleteError("");
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleteLoading}
              onClick={handleDeleteWorkspace}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition disabled:opacity-50"
            >
              {deleteLoading ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Workspace</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
