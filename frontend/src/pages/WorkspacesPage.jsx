import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  Plus,
  Github,
  Users,
  ArrowRight,
  Shield,
  FolderGit2,
  UserPlus,
  Check,
  X,
  Trash2,
} from "lucide-react";
import { projectApi } from "../api/project.api";
import { useAuth } from "../context/AuthContext";
import { Modal } from "../components/common/Modal";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { Badge } from "../components/common/Badge";

export const WorkspacesPage = () => {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletingWorkspace, setDeletingWorkspace] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    githubRepoUrl: "",
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const navigate = useNavigate();

  const getMemberCount = (ws) => {
    const ownerId = (ws.owner?._id || ws.owner)?.toString();
    const otherMembers = (ws.members || []).filter((m) => {
      const mId = (m.user?._id || m.user)?.toString();
      return mId && mId !== ownerId;
    });
    return otherMembers.length + 1;
  };

  const fetchWorkspacesAndInvites = async () => {
    try {
      setLoading(true);
      const [wsRes, invRes] = await Promise.allSettled([
        projectApi.getMyProjects(),
        projectApi.getMyInvitations(),
      ]);

      if (wsRes.status === "fulfilled") {
        const list = Array.isArray(wsRes.value.data)
          ? wsRes.value.data
          : wsRes.value.data?.projects || [];
        setWorkspaces(list);
      }

      if (invRes.status === "fulfilled") {
        const invites = Array.isArray(invRes.value.data)
          ? invRes.value.data
          : invRes.value.data?.invitations || [];
        setPendingInvitations(invites.filter((i) => i.status === "pending"));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspacesAndInvites();
  }, []);

  const handleRespondInvitation = async (invitationId, action) => {
    try {
      await projectApi.respondInvitation(invitationId, action);
      fetchWorkspacesAndInvites();
    } catch (err) {
      alert(err.message || "Failed to respond to invitation");
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!deletingWorkspace) return;
    try {
      setDeleteLoading(true);
      setDeleteError("");
      await projectApi.deleteProject(deletingWorkspace._id);
      setWorkspaces((prev) => prev.filter((w) => w._id !== deletingWorkspace._id));
      setDeletingWorkspace(null);
    } catch (err) {
      setDeleteError(err.response?.data?.message || err.message || "Failed to delete workspace");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError("");

    try {
      let githubRepo = null;
      if (createForm.githubRepoUrl.trim()) {
        const input = createForm.githubRepoUrl.trim().replace(/\/$/, "");
        let owner = "";
        let repo = "";
        if (input.includes("github.com/")) {
          const parts = input.split("github.com/")[1].split("/");
          owner = parts[0];
          repo = parts[1];
        } else if (input.includes("/")) {
          const parts = input.split("/");
          owner = parts[0];
          repo = parts[1];
        }
        if (owner && repo) {
          githubRepo = {
            url: `https://github.com/${owner}/${repo}`,
            owner,
            repo,
          };
        }
      }

      const res = await projectApi.createProject({
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        ...(githubRepo ? { githubRepo } : {}),
      });

      setIsCreateOpen(false);
      setCreateForm({ name: "", description: "", githubRepoUrl: "" });
      navigate(`/workspaces/${res.data._id}`);
    } catch (err) {
      setCreateError(err.message || "Failed to create workspace");
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-100">My Workspaces</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Collaborative environments with Kanban task boards, live chat, and repository tools
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm transition shadow-lg shadow-indigo-600/30"
        >
          <Plus className="w-4 h-4" />
          <span>New Workspace</span>
        </button>
      </div>

      {/* Pending Workspace Invitations */}
      {pendingInvitations.length > 0 && (
        <div className="mb-8 p-5 rounded-3xl bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-900 border border-indigo-500/30 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
              <UserPlus className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-100">
              Pending Workspace Invitations ({pendingInvitations.length})
            </h2>
          </div>

          <div className="space-y-3">
            {pendingInvitations.map((inv) => (
              <div
                key={inv._id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs uppercase">
                    {inv.workspace?.name?.substring(0, 2) || "WS"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-200">
                        {inv.workspace?.name || "Workspace"}
                      </span>
                      <Badge variant="indigo" className="text-[10px] capitalize">
                        {inv.role === "admin"
                          ? "Admin"
                          : inv.role === "viewer"
                          ? "Viewer"
                          : "Member"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Invited by{" "}
                      <span className="text-slate-300 font-medium">
                        {inv.inviter?.fullName || inv.inviter?.username || "A teammate"}
                      </span>{" "}
                      (@{inv.inviter?.username || "user"})
                    </p>
                    {inv.message && (
                      <p className="text-xs text-slate-300 italic mt-1">
                        "{inv.message}"
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleRespondInvitation(inv._id, "decline")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Decline</span>
                  </button>
                  <button
                    onClick={() => handleRespondInvitation(inv._id, "accept")}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Accept & Join</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workspace List */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : workspaces.length === 0 ? (
        <div className="py-20 text-center bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md mx-auto shadow-xl">
          <FolderGit2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-200">
            No workspaces yet
          </h3>
          <p className="text-xs text-slate-400 mt-1 mb-6">
            Create your first workspace to start managing tasks, linking GitHub repositories, and collaborating with your team.
          </p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
          >
            Create a Workspace
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workspaces.map((ws) => (
            <div
              key={ws._id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-6 shadow-xl flex flex-col justify-between transition group"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm">
                      {ws.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100 group-hover:text-indigo-400 transition leading-snug">
                        {ws.name}
                      </h3>
                      <span className="text-[10px] text-slate-400">
                        Created {new Date(ws.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-300 line-clamp-2 mb-4">
                  {ws.description || "No workspace description."}
                </p>

                {/* GitHub link pill if present */}
                {ws.githubRepo?.owner && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 mb-4">
                    <Github className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="font-mono">
                      {ws.githubRepo.owner}/{ws.githubRepo.repo}
                    </span>
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    {getMemberCount(ws)}{" "}
                    {getMemberCount(ws) === 1 ? "member" : "members"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {(ws.owner?._id || ws.owner)?.toString() ===
                    (user?._id || user?.id)?.toString() && (
                    <button
                      onClick={() => setDeletingWorkspace(ws)}
                      className="p-1.5 rounded-xl border border-rose-900/40 bg-rose-950/20 hover:bg-rose-950/60 text-rose-400 hover:text-rose-300 transition"
                      title="Delete workspace"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <Link
                    to={`/workspaces/${ws._id}`}
                    className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-xs font-semibold transition"
                  >
                    <span>Open</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Workspace Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Workspace"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-xl">
              {createError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Workspace Name
            </label>
            <input
              type="text"
              required
              value={createForm.name}
              onChange={(e) =>
                setCreateForm({ ...createForm, name: e.target.value })
              }
              placeholder="e.g. RepoGuardian Engine"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={createForm.description}
              onChange={(e) =>
                setCreateForm({ ...createForm, description: e.target.value })
              }
              placeholder="What are you building in this workspace?"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              GitHub Repository (Optional)
            </label>
            <input
              type="text"
              value={createForm.githubRepoUrl}
              onChange={(e) =>
                setCreateForm({ ...createForm, githubRepoUrl: e.target.value })
              }
              placeholder="e.g. facebook/react or full GitHub link"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
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
              disabled={createLoading}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition disabled:opacity-50"
            >
              {createLoading ? <LoadingSpinner size="sm" /> : "Create Workspace"}
            </button>
          </div>
        </form>
      </Modal>
      {/* Delete Workspace Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingWorkspace)}
        onClose={() => {
          if (!deleteLoading) {
            setDeletingWorkspace(null);
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
              <strong className="text-white">"{deletingWorkspace?.name}"</strong>{" "}
              will permanently remove all associated Kanban tasks, team chat messages, and member invitations.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={deleteLoading}
              onClick={() => {
                setDeletingWorkspace(null);
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
