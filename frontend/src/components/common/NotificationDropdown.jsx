import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCheck, Bell, MessageSquare, UserPlus, CheckCircle2 } from "lucide-react";
import { notificationApi } from "../../api/notification.api";
import { useSocket } from "../../context/SocketContext";
import { LoadingSpinner } from "./LoadingSpinner";

export const NotificationDropdown = ({ onClose }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const { setUnreadCount } = useSocket();
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await notificationApi.getNotifications({ limit: 15 });
      setNotifications(res.data?.notifications || []);
    } catch {
      // Quiet error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAsRead = async (id, link) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      if (link) {
        onClose();
        let targetLink = link;
        if (link.startsWith("/chat/workspace/")) {
          const wsId = link.replace("/chat/workspace/", "");
          targetLink = `/workspaces/${wsId}`;
        } else if (link.startsWith("/chat/")) {
          const convoId = link.replace("/chat/", "");
          targetLink = `/messages?convo=${convoId}`;
        } else if (link.startsWith("/projects/")) {
          const projId = link.replace("/projects/", "");
          targetLink = `/workspaces/${projId}`;
        }
        navigate(targetLink);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case "new_message":
        return <MessageSquare className="w-4 h-4 text-indigo-400" />;
      case "join_request":
      case "invitation":
        return <UserPlus className="w-4 h-4 text-emerald-400" />;
      case "task_assigned":
        return <CheckCircle2 className="w-4 h-4 text-amber-400" />;
      default:
        return <Bell className="w-4 h-4 text-sky-400" />;
    }
  };

  return (
    <div className="absolute right-0 mt-2 w-84 sm:w-96 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fadeIn">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-indigo-400" />
          <h4 className="text-sm font-semibold text-slate-200">Notifications</h4>
        </div>
        <button
          onClick={handleMarkAllRead}
          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition"
        >
          <CheckCheck className="w-3.5 h-3.5" /> Mark all read
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/60">
        {loading ? (
          <div className="py-8 flex justify-center">
            <LoadingSpinner size="sm" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No notifications yet
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n._id}
              onClick={() => handleMarkAsRead(n._id, n.link)}
              className={`p-3.5 hover:bg-slate-800/60 cursor-pointer transition flex items-start gap-3 ${
                !n.isRead ? "bg-indigo-950/20" : ""
              }`}
            >
              <div className="mt-0.5 p-2 rounded-xl bg-slate-800 border border-slate-700/60">
                {getIcon(n.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-200 truncate">
                    {n.title}
                  </p>
                  {!n.isRead && (
                    <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0"></span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                  {n.message}
                </p>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {new Date(n.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
