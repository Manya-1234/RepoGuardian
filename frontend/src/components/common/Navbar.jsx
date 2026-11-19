import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Shield,
  Bell,
  MessageSquare,
  Users,
  Briefcase,
  LayoutGrid,
  User,
  LogOut,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";
import { NotificationDropdown } from "./NotificationDropdown";

export const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { unreadCount, liveAlert, dismissAlert } = useSocket();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const notifRef = useRef(null);
  const userMenuRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navLinks = [
    { name: "Workspaces", href: "/workspaces", icon: LayoutGrid },
    { name: "Opportunities", href: "/opportunities", icon: Briefcase },
    { name: "Developers", href: "/developers", icon: Users },
    { name: "Messages", href: "/messages", icon: MessageSquare },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition duration-200">
              <Shield className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
              RepoGuardian
            </span>
          </Link>

          {/* Desktop Nav Links */}
          {isAuthenticated && (
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.name}
                    to={link.href}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition ${
                      isActive
                        ? "bg-slate-800 text-indigo-400 border border-slate-700"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {link.name}
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Right Action Area */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                {/* Notification Bell */}
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={() => setShowNotifications((prev) => !prev)}
                    className="relative p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition"
                    aria-label="Notifications"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-indigo-600 text-[10px] font-bold text-white rounded-full flex items-center justify-center animate-pulse">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </button>

                  {showNotifications && (
                    <NotificationDropdown
                      onClose={() => setShowNotifications(false)}
                    />
                  )}
                </div>

                {/* User Dropdown */}
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setShowUserMenu((prev) => !prev)}
                    className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-900 border border-transparent hover:border-slate-800 transition"
                  >
                    <img
                      src={
                        user?.avatar ||
                        `https://api.dicebear.com/7.x/identicon/svg?seed=${user?.username || "user"}`
                      }
                      alt={user?.username}
                      className="w-8 h-8 rounded-lg object-cover border border-slate-700"
                    />
                    <span className="hidden sm:inline-block text-xs font-semibold text-slate-200 max-w-[120px] truncate">
                      {user?.fullName || user?.username}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-2 z-50 animate-fadeIn">
                      <div className="px-4 py-2 border-b border-slate-800">
                        <p className="text-xs font-bold text-slate-100 truncate">
                          {user?.fullName}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          @{user?.username}
                        </p>
                      </div>

                      <Link
                        to={`/profile/${user?.username}`}
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800/80 transition"
                      >
                        <User className="w-4 h-4 text-slate-400" />
                        My Profile & Skills
                      </Link>

                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 transition"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>

                {/* Mobile Menu Toggle */}
                <button
                  onClick={() => setMobileMenuOpen((prev) => !prev)}
                  className="md:hidden p-2 text-slate-400 hover:text-slate-200"
                >
                  {mobileMenuOpen ? (
                    <X className="w-6 h-6" />
                  ) : (
                    <Menu className="w-6 h-6" />
                  )}
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2.5">
                <Link
                  to="/login"
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-300 hover:text-white transition"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-lg shadow-indigo-600/30"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {isAuthenticated && mobileMenuOpen && (
          <div className="md:hidden px-4 pt-2 pb-4 space-y-1 bg-slate-950 border-b border-slate-800">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname.startsWith(link.href);
              return (
                <Link
                  key={link.name}
                  to={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                    isActive
                      ? "bg-slate-800 text-indigo-400"
                      : "text-slate-300 hover:bg-slate-900"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {link.name}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Floating Live Alert Toaster */}
      {liveAlert && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-slate-900 border border-indigo-500/50 p-4 rounded-2xl shadow-2xl animate-bounce-short flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-100">{liveAlert.title}</p>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {liveAlert.message}
            </p>
          </div>
          <button
            onClick={dismissAlert}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
};
