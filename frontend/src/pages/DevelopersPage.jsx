import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Users,
  Search,
  Filter,
  MessageSquare,
  ArrowUpRight,
  Briefcase,
  MapPin,
} from "lucide-react";
import { userApi } from "../api/user.api";
import { Badge } from "../components/common/Badge";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { useAuth } from "../context/AuthContext";

const getAvailabilityLabel = (avail) => {
  if (!avail) return "Available";
  const status = typeof avail === "string" ? avail : avail.status;
  if (status === "actively_looking" || status === "available") return "Available";
  if (status === "open_to_offers" || status === "busy") return "Open to Offers";
  if (status === "not_available") return "Not Available";
  return "Available";
};

const getAvailabilityVariant = (avail) => {
  if (!avail) return "emerald";
  const status = typeof avail === "string" ? avail : avail.status;
  if (status === "actively_looking" || status === "available") return "emerald";
  if (status === "open_to_offers" || status === "busy") return "amber";
  return "default";
};

export const DevelopersPage = () => {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  const [developers, setDevelopers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [availability, setAvailability] = useState("");

  const fetchDevelopers = async () => {
    try {
      setLoading(true);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (skillFilter.trim()) params.skills = skillFilter.trim();
      if (experienceLevel) params.experienceLevel = experienceLevel;
      if (availability) params.availability = availability;

      const res = await userApi.getAllDevelopers(params);
      setDevelopers(res.data?.developers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDevelopers();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, skillFilter, experienceLevel, availability]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-100">
              Developer Discovery
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Find and connect with software developers, engineers, and potential teammates
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-8 shadow-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, role..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <input
            type="text"
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value)}
            placeholder="Skills (e.g. React, Python)"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <select
            value={experienceLevel}
            onChange={(e) => setExperienceLevel(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Experience Levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div>
          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Availabilities</option>
            <option value="available">Available to Join</option>
            <option value="busy">Busy</option>
            <option value="not_available">Not Available</option>
          </select>
        </div>
      </div>

      {/* Developers Cards Grid */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : developers.length === 0 ? (
        <div className="py-20 text-center bg-slate-900 border border-slate-800 rounded-3xl">
          <Users className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-200">
            No developers found
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Try adjusting your search terms or skill filters
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {developers.map((dev) => {
            const isMe = dev._id === currentUser?._id;
            return (
              <div
                key={dev._id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 shadow-xl flex flex-col justify-between transition group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          dev.avatar ||
                          `https://api.dicebear.com/7.x/identicon/svg?seed=${dev.username}`
                        }
                        alt={dev.username}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-700 shadow-md"
                      />
                      <div>
                        <h3 className="text-sm font-bold text-slate-100 group-hover:text-indigo-400 transition">
                          {dev.fullName}
                        </h3>
                        <p className="text-xs text-slate-400">@{dev.username}</p>
                      </div>
                    </div>

                    <Badge
                      variant={getAvailabilityVariant(dev.availability)}
                      size="xs"
                    >
                      {getAvailabilityLabel(dev.availability)}
                    </Badge>
                  </div>

                  {dev.headline ? (
                    <p className="text-xs text-slate-300 line-clamp-2 mb-3">
                      {dev.headline}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 italic mb-3">
                      No headline specified
                    </p>
                  )}

                  {/* Skills badges */}
                  <div className="flex flex-wrap gap-1.5 mb-4 max-h-16 overflow-hidden">
                    {dev.skills && dev.skills.length > 0 ? (
                      dev.skills.slice(0, 5).map((skill) => (
                        <span
                          key={skill}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-slate-950 text-indigo-300 border border-slate-800"
                        >
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        No skills listed
                      </span>
                    )}
                    {dev.skills && dev.skills.length > 5 && (
                      <span className="px-1.5 py-0.5 text-[10px] text-slate-400">
                        +{dev.skills.length - 5} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer actions */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 capitalize">
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>{dev.experienceLevel}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      to={`/profile/${dev.username}`}
                      className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-1"
                    >
                      Profile
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>

                    {!isMe && (
                      <button
                        onClick={() => navigate(`/messages?user=${dev._id}`)}
                        className="p-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition"
                        title="Send Message"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
