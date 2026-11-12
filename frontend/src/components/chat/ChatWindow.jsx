import React, { useState, useEffect, useRef } from "react";
import { Send, MessageSquare } from "lucide-react";
import { chatApi } from "../../api/chat.api";
import { useSocket } from "../../context/SocketContext";
import { useAuth } from "../../context/AuthContext";
import { LoadingSpinner } from "../common/LoadingSpinner";

export const ChatWindow = ({ conversationId, title = "Chat", placeholder = "Type a message..." }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState([]);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Fetch message history
  useEffect(() => {
    if (!conversationId) return;

    const fetchHistory = async () => {
      try {
        setLoading(true);
        const res = await chatApi.getMessages(conversationId, { limit: 100 });
        setMessages(res.data?.messages || []);
        setTimeout(scrollToBottom, 100);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [conversationId]);

  // Socket join & live events
  useEffect(() => {
    if (!socket || !conversationId) return;

    // Join room
    socket.emit("join_chat", conversationId);

    const handleReceiveMessage = (msg) => {
      const msgConvoId = (msg.conversation?._id || msg.conversation)?.toString();
      if (msgConvoId === conversationId?.toString()) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === msg._id)) return prev;
          return [...prev, msg];
        });
        setTimeout(scrollToBottom, 50);
      }
    };

    const handleUserTyping = ({ user: typingUser }) => {
      const typingId = (typingUser?._id || typingUser)?.toString();
      if (typingId && typingId !== user?._id?.toString()) {
        setTypingUsers((prev) => {
          if (!prev.some((u) => (u._id || u)?.toString() === typingId)) {
            return [...prev, typingUser];
          }
          return prev;
        });
      }
    };

    const handleUserStopTyping = ({ userId }) => {
      setTypingUsers((prev) =>
        prev.filter((u) => (u._id || u)?.toString() !== userId?.toString())
      );
    };

    socket.on("receive_message", handleReceiveMessage);
    socket.on("user_typing", handleUserTyping);
    socket.on("user_stop_typing", handleUserStopTyping);

    return () => {
      socket.emit("leave_chat", conversationId);
      socket.off("receive_message", handleReceiveMessage);
      socket.off("user_typing", handleUserTyping);
      socket.off("user_stop_typing", handleUserStopTyping);
    };
  }, [socket, conversationId, user?._id]);

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);

    if (!socket || !conversationId) return;
    socket.emit("typing", { conversationId });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stop_typing", { conversationId });
    }, 1500);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    const content = newMessage.trim();
    if (!content || !socket || !conversationId) return;

    // Emit live message event
    socket.emit("send_message", {
      conversationId,
      content,
    });

    socket.emit("stop_typing", { conversationId });
    setNewMessage("");
  };

  return (
    <div className="flex flex-col h-[550px] bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-slate-100">{title}</h3>
        </div>
      </div>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <LoadingSpinner size="md" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
            <MessageSquare className="w-8 h-8 text-slate-600 mb-2" />
            <span>No messages yet. Say hello to start the conversation!</span>
          </div>
        ) : (
          messages.map((m) => {
            const isMe =
              (m.sender?._id || m.sender)?.toString() === user?._id?.toString();
            return (
              <div
                key={m._id}
                className={`flex items-start gap-2.5 ${
                  isMe ? "flex-row-reverse" : "flex-row"
                }`}
              >
                <img
                  src={
                    m.sender?.avatar ||
                    `https://api.dicebear.com/7.x/identicon/svg?seed=${m.sender?.username || "user"}`
                  }
                  alt={m.sender?.username}
                  className="w-7 h-7 rounded-xl object-cover border border-slate-700 shrink-0 mt-0.5"
                />

                <div
                  className={`max-w-[75%] rounded-2xl p-3 text-xs shadow-md ${
                    isMe
                      ? "bg-indigo-600 text-white rounded-tr-none"
                      : "bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-tl-none"
                  }`}
                >
                  {!isMe && (
                    <p className="text-[10px] font-bold text-indigo-300 mb-1">
                      {m.sender?.fullName || m.sender?.username}
                    </p>
                  )}
                  <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  <span
                    className={`block text-[9px] mt-1 text-right ${
                      isMe ? "text-indigo-200" : "text-slate-400"
                    }`}
                  >
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <div className="px-5 py-1 text-[11px] text-indigo-400 italic bg-slate-950/40">
          {typingUsers.map((u) => u.fullName || u.username).join(", ")} is
          typing...
        </div>
      )}

      {/* Input Bar */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
      >
        <input
          type="text"
          value={newMessage}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition"
        />
        <button
          type="submit"
          disabled={!newMessage.trim()}
          className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-30 disabled:hover:bg-indigo-600"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
