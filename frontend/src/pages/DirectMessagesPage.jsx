import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageSquare, Users, User, Search } from "lucide-react";
import { chatApi } from "../api/chat.api";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { ChatWindow } from "../components/chat/ChatWindow";
import { LoadingSpinner } from "../components/common/LoadingSpinner";

export const DirectMessagesPage = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [searchParams, setSearchParams] = useSearchParams();
  const targetUserId = searchParams.get("user");
  const targetConvoId = searchParams.get("convo");

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const res = await chatApi.getConversations();
      let list = Array.isArray(res.data)
        ? res.data
        : res.data?.conversations || [];

      // 1. If targetConvoId is in query param, find and activate it
      if (targetConvoId) {
        const found = list.find(
          (c) => c._id?.toString() === targetConvoId.toString()
        );
        if (found) {
          setActiveConversation(found);
        }
      }

      // 2. If targetUserId is in query param, load/create direct conversation
      if (targetUserId) {
        try {
          const directRes = await chatApi.getDirectChat(targetUserId);
          const directConvo = directRes.data;
          if (directConvo) {
            setActiveConversation(directConvo);
            const exists = list.some(
              (c) => c._id?.toString() === directConvo._id?.toString()
            );
            if (!exists) {
              list = [directConvo, ...list];
            }
          }
        } catch (directErr) {
          console.error("Direct chat fetch error:", directErr);
        }
      } else if (!targetConvoId && list.length > 0 && !activeConversation) {
        // Default to first conversation
        setActiveConversation(list[0]);
      }

      setConversations(list);
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [targetUserId, targetConvoId]);

  // Live WebSocket update for sidebar when messages arrive
  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (msg) => {
      const msgConvoId = (msg.conversation?._id || msg.conversation)?.toString();

      setConversations((prev) => {
        const index = prev.findIndex(
          (c) => c._id?.toString() === msgConvoId
        );
        if (index !== -1) {
          const updatedConvo = {
            ...prev[index],
            lastMessage: msg,
            updatedAt: new Date().toISOString(),
          };
          const next = [...prev];
          next.splice(index, 1);
          return [updatedConvo, ...next];
        } else {
          // If a new conversation arrived that wasn't in list, refresh
          fetchConversations();
          return prev;
        }
      });
    };

    socket.on("receive_message", handleReceiveMessage);
    return () => {
      socket.off("receive_message", handleReceiveMessage);
    };
  }, [socket]);

  const getConversationDetails = (convo) => {
    if (!convo) return { title: "Chat", avatar: null, isWorkspace: false };

    if (convo.type === "workspace") {
      return {
        title: convo.workspace?.name || "Workspace Room",
        avatar: null,
        isWorkspace: true,
      };
    }

    // Direct chat: find other participant
    const currentUserId = user?._id?.toString();
    const otherUser = convo.participants?.find((p) => {
      const pId = (p?._id || p)?.toString();
      return pId && pId !== currentUserId;
    });

    return {
      title: otherUser?.fullName || otherUser?.username || "Direct Chat",
      avatar:
        otherUser?.avatar ||
        `https://api.dicebear.com/7.x/identicon/svg?seed=${otherUser?.username || "user"}`,
      isWorkspace: false,
    };
  };

  const handleSelectConversation = (convo) => {
    setActiveConversation(convo);
    // Clean up query param so clicking another conversation works cleanly
    setSearchParams({ convo: convo._id });
  };

  const filteredConversations = conversations.filter((c) => {
    // For direct chats: only show if at least 1 message has been sent
    // OR if it is currently the active conversation being drafted
    if (c.type === "direct") {
      const hasMessage = Boolean(c.lastMessage);
      const isCurrentlyActive =
        activeConversation &&
        c._id?.toString() === activeConversation._id?.toString();
      if (!hasMessage && !isCurrentlyActive) {
        return false;
      }
    }

    const details = getConversationDetails(c);
    return details.title.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Messages</h1>
        <p className="text-xs text-slate-400 mt-1">
          Direct 1-on-1 messaging and workspace team channels
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Sidebar: Conversations List */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col h-[600px]">
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 divide-y divide-slate-800/40">
            {loading ? (
              <div className="py-12 flex justify-center">
                <LoadingSpinner size="sm" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No active conversations yet.
              </div>
            ) : (
              filteredConversations.map((convo) => {
                const details = getConversationDetails(convo);
                const isSelected = activeConversation?._id === convo._id;

                return (
                  <div
                    key={convo._id}
                    onClick={() => handleSelectConversation(convo)}
                    className={`p-3 rounded-2xl cursor-pointer transition flex items-center gap-3 ${
                      isSelected
                        ? "bg-indigo-600/20 border border-indigo-500/40"
                        : "hover:bg-slate-800/60"
                    }`}
                  >
                    {details.isWorkspace ? (
                      <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
                        #
                      </div>
                    ) : (
                      <img
                        src={details.avatar}
                        alt={details.title}
                        className="w-9 h-9 rounded-xl object-cover border border-slate-700 shrink-0"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-200 truncate">
                          {details.title}
                        </p>
                        {convo.lastMessage && (
                          <span className="text-[10px] text-slate-400">
                            {new Date(
                              convo.lastMessage.createdAt
                            ).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {convo.lastMessage?.content ||
                          (details.isWorkspace
                            ? "Team channel"
                            : "Direct message")}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Area: Active Chat Window */}
        <div className="md:col-span-2">
          {activeConversation ? (
            <ChatWindow
              conversationId={activeConversation._id}
              title={getConversationDetails(activeConversation).title}
              placeholder={`Send message to ${getConversationDetails(activeConversation).title}...`}
            />
          ) : (
            <div className="h-[600px] bg-slate-900 border border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-400 text-xs p-6 shadow-xl">
              <MessageSquare className="w-12 h-12 text-slate-700 mb-3" />
              <span>Select a conversation from the left to start chatting</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
