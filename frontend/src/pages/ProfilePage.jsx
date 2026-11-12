import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  User,
  Mail,
  MapPin,
  Briefcase,
  Calendar,
  Globe,
  Github,
  Linkedin,
  Edit3,
  MessageSquare,
  Plus,
  X,
  CheckCircle,
} from "lucide-react";
import { userApi } from "../api/user.api";
import { useAuth } from "../context/AuthContext";
import { Badge } from "../components/common/Badge";
import { Modal } from "../components/common/Modal";
import { LoadingSpinner } from "../components/common/LoadingSpinner";

// Helper to safely format availability labels
const getAvailabilityLabel = (avail) => {
  if (!avail) return "Available to Join";
  const status = typeof avail === "string" ? avail : avail.status;
  if (status === "actively_looking" || status === "available") return "Available to Join";
  if (status === "open_to_offers" || status === "busy") return "Open to Offers";
  if (status === "not_available") return "Not Available";
  return "Available to Join";
};

// Helper for availability badge color variant
const getAvailabilityVariant = (avail) => {
  if (!avail) return "emerald";
  const status = typeof avail === "string" ? avail : avail.status;
  if (status === "actively_looking" || status === "available") return "emerald";
  if (status === "open_to_offers" || status === "busy") return "amber";
  return "default";
};

export const ProfilePage = () => {
  const { username } = useParams();
  const { user: currentUser, updateUserState } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    headline: "",
    bio: "",
    skills: [],
    experienceLevel: "intermediate",
    availability: "actively_looking",
    location: "",
    portfolioLinks: { github: "", linkedin: "", website: "" },
  });
  const [newSkillInput, setNewSkillInput] = useState("");

  const isOwnProfile =
    !username ||
    username === currentUser?.username ||
    username === currentUser?._id;

  const populateFromUser = (data) => {
    if (!data) return;
    setProfile(data);
    const availStatus = typeof data.availability === "string"
      ? data.availability
      : data.availability?.status || "actively_looking";

    setEditForm({
      headline: data.headline || "",
      bio: data.bio || "",
      skills: Array.isArray(data.skills) ? data.skills : [],
      experienceLevel: data.experienceLevel || "intermediate",
      availability: availStatus,
      location: data.location || "",
      portfolioLinks: {
        github: data.portfolioLinks?.github || "",
        linkedin: data.portfolioLinks?.linkedin || "",
        website: data.portfolioLinks?.website || "",
      },
    });
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const targetUser = username || currentUser?.username || currentUser?._id;

      // If viewing own profile and currentUser is already in state, show it immediately
      if (isOwnProfile && currentUser) {
        populateFromUser(currentUser);
      }

      if (!targetUser) return;

      const res = await userApi.getProfile(targetUser);
      if (res?.data) {
        populateFromUser(res.data);
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
      // Fallback: If viewing own profile, ensure currentUser data is rendered
      if (isOwnProfile && currentUser) {
        populateFromUser(currentUser);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [username, currentUser?.username]);

  const handleAddSkill = (e) => {
    e.preventDefault();
    const trimmed = newSkillInput.trim();
    if (trimmed && !editForm.skills.includes(trimmed)) {
      setEditForm({ ...editForm, skills: [...editForm.skills, trimmed] });
      setNewSkillInput("");
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setEditForm({
      ...editForm,
      skills: editForm.skills.filter((s) => s !== skillToRemove),
    });
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...editForm,
        availability: {
          status: editForm.availability,
          hoursPerWeek: 10,
        },
      };

      const res = await userApi.updateProfile(payload);
      populateFromUser(res.data);
      updateUserState(res.data);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsEditOpen(false);
      }, 1000);
    } catch (err) {
      alert(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !profile) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-slate-400">
        Developer profile not found.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      {/* Top Banner / Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <img
              src={
                profile.avatar ||
                `https://api.dicebear.com/7.x/identicon/svg?seed=${profile.username || "dev"}`
              }
              alt={profile.username}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-indigo-500/40 shadow-xl"
            />
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
                  {profile.fullName || profile.username}
                </h1>
                <Badge variant={getAvailabilityVariant(profile.availability)}>
                  {getAvailabilityLabel(profile.availability)}
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-indigo-400 font-medium mt-0.5">
                @{profile.username}
              </p>
              {profile.headline && (
                <p className="text-sm text-slate-300 mt-2 font-medium">
                  {profile.headline}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isOwnProfile ? (
              <button
                onClick={() => setIsEditOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold transition shadow-lg shadow-indigo-600/30"
              >
                <Edit3 className="w-4 h-4" />
                Edit Profile
              </button>
            ) : (
              <button
                onClick={() =>
                  navigate(`/messages?user=${profile._id || profile.username}`)
                }
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold transition"
              >
                <MessageSquare className="w-4 h-4" />
                Send Message
              </button>
            )}
          </div>
        </div>

        {/* Info Pills */}
        <div className="flex flex-wrap items-center gap-4 mt-6 pt-6 border-t border-slate-800/80 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-slate-400" />
            <span className="capitalize">{profile.experienceLevel || "Intermediate"} Level</span>
          </div>
          {profile.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span>{profile.location}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>
              Joined {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "Recently"}
            </span>
          </div>
        </div>
      </div>

      {/* Profile Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {/* About & Skills */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-3">
              About
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
              {profile.bio || "No biography provided yet. Click 'Edit Profile' to introduce yourself!"}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4">
              Skills & Technologies
            </h3>
            <div className="flex flex-wrap gap-2">
              {profile.skills && profile.skills.length > 0 ? (
                profile.skills.map((skill) => (
                  <Badge key={skill} variant="indigo" size="md">
                    {skill}
                  </Badge>
                ))
              ) : (
                <p className="text-xs text-slate-400">No skills added yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Links & Socials Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4">
              Connect & Portfolios
            </h3>
            <div className="space-y-3">
              {profile.portfolioLinks?.github ? (
                <a
                  href={profile.portfolioLinks.github}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white transition"
                >
                  <Github className="w-4 h-4 text-slate-400" />
                  <span className="truncate">
                    {profile.portfolioLinks.github}
                  </span>
                </a>
              ) : null}

              {profile.portfolioLinks?.linkedin ? (
                <a
                  href={profile.portfolioLinks.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white transition"
                >
                  <Linkedin className="w-4 h-4 text-sky-400" />
                  <span className="truncate">
                    {profile.portfolioLinks.linkedin}
                  </span>
                </a>
              ) : null}

              {profile.portfolioLinks?.website ? (
                <a
                  href={profile.portfolioLinks.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white transition"
                >
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span className="truncate">
                    {profile.portfolioLinks.website}
                  </span>
                </a>
              ) : null}

              {!profile.portfolioLinks?.github &&
                !profile.portfolioLinks?.linkedin &&
                !profile.portfolioLinks?.website && (
                  <p className="text-xs text-slate-400">
                    No portfolio links shared yet.
                  </p>
                )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Developer Profile"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Headline
            </label>
            <input
              type="text"
              value={editForm.headline}
              onChange={(e) =>
                setEditForm({ ...editForm, headline: e.target.value })
              }
              placeholder="e.g. Full Stack Engineer | React, Node.js, Cloud"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Experience Level
              </label>
              <select
                value={editForm.experienceLevel}
                onChange={(e) =>
                  setEditForm({ ...editForm, experienceLevel: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="expert">Expert</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Availability Status
              </label>
              <select
                value={editForm.availability}
                onChange={(e) =>
                  setEditForm({ ...editForm, availability: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="actively_looking">Available to Join</option>
                <option value="open_to_offers">Open to Offers</option>
                <option value="not_available">Not Available</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Location
            </label>
            <input
              type="text"
              value={editForm.location}
              onChange={(e) =>
                setEditForm({ ...editForm, location: e.target.value })
              }
              placeholder="e.g. New Delhi, India or Remote"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Bio
            </label>
            <textarea
              rows={3}
              value={editForm.bio}
              onChange={(e) =>
                setEditForm({ ...editForm, bio: e.target.value })
              }
              placeholder="Share your interests, what you love building, and past projects..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Skills Tag Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Skills (Press Enter or click Add)
            </label>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSkill(e);
                  }
                }}
                placeholder="e.g. React, MongoDB, TypeScript, Docker"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
              >
                Add
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-slate-950 rounded-xl border border-slate-800">
              {editForm.skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-indigo-950/80 text-indigo-300 border border-indigo-800"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {editForm.skills.length === 0 && (
                <span className="text-xs text-slate-400">
                  No skills entered.
                </span>
              )}
            </div>
          </div>

          {/* Portfolio Links */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                GitHub URL
              </label>
              <input
                type="url"
                value={editForm.portfolioLinks.github}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    portfolioLinks: {
                      ...editForm.portfolioLinks,
                      github: e.target.value,
                    },
                  })
                }
                placeholder="https://github.com/..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                LinkedIn URL
              </label>
              <input
                type="url"
                value={editForm.portfolioLinks.linkedin}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    portfolioLinks: {
                      ...editForm.portfolioLinks,
                      linkedin: e.target.value,
                    },
                  })
                }
                placeholder="https://linkedin.com/in/..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Website
              </label>
              <input
                type="url"
                value={editForm.portfolioLinks.website}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    portfolioLinks: {
                      ...editForm.portfolioLinks,
                      website: e.target.value,
                    },
                  })
                }
                placeholder="https://myportfolio.dev"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition disabled:opacity-50"
            >
              {saving ? (
                <LoadingSpinner size="sm" />
              ) : saveSuccess ? (
                <>
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Saved!
                </>
              ) : (
                "Save Profile"
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
