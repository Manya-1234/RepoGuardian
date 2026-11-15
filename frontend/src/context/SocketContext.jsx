import React, { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";
import { notificationApi } from "../api/notification.api";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [liveAlert, setLiveAlert] = useState(null);

  // Fetch initial unread notifications count
  const fetchUnreadCount = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await notificationApi.getUnreadCount();
      setUnreadCount(res.data?.unreadCount || 0);
    } catch {
      // Quiet fail if offline
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchUnreadCount();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const token = localStorage.getItem("accessToken");
    // Connect to backend via proxy or window.location.origin
    const socketInstance = io({
      path: "/socket.io",
      auth: { token },
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socketInstance.on("connect", () => {
      // console.log("Socket connected:", socketInstance.id);
    });

    socketInstance.on("connect_error", (err) => {
      console.warn("Socket connect error:", err.message);
    });

    socketInstance.on("new_notification", (notification) => {
      setUnreadCount((prev) => prev + 1);
      setLiveAlert(notification);

      // Auto dismiss live alert toast after 5 seconds
      setTimeout(() => {
        setLiveAlert(null);
      }, 5000);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [isAuthenticated, user?._id]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        unreadCount,
        setUnreadCount,
        fetchUnreadCount,
        liveAlert,
        dismissAlert: () => setLiveAlert(null),
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};
