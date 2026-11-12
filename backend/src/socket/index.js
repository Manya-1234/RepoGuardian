import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { Conversation } from "../models/conversation.model.js";
import { Message } from "../models/message.model.js";
import { Project } from "../models/project.model.js";
import { createAndEmitNotification } from "../utils/notification.helper.js";

let io = null;

export const initSocket = (server) => {
    const allowedOrigins = [
        process.env.CORS_ORIGIN,
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ].filter(Boolean);

    io = new Server(server, {
        cors: {
            origin: (origin, callback) => {
                if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
                    return callback(null, true);
                }
                return callback(null, true);
            },
            credentials: true
        }
    });

    // Authentication Middleware for incoming Socket connections
    io.use(async (socket, next) => {
        try {
            let token = socket.handshake.auth?.token;

            if (!token && socket.handshake.headers?.authorization) {
                const authHeader = socket.handshake.headers.authorization;
                token = authHeader.startsWith("Bearer ")
                    ? authHeader.slice(7)
                    : authHeader;
            }

            if (!token && socket.handshake.headers?.cookie) {
                const rawCookies = socket.handshake.headers.cookie;
                const cookieMatch = rawCookies.match(/accessToken=([^;]+)/);
                if (cookieMatch) {
                    token = cookieMatch[1];
                }
            }

            if (!token) {
                return next(new Error("Authentication error: No token provided"));
            }

            const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
            const user = await User.findById(decoded?._id).select(
                "-password -refreshToken"
            );

            if (!user) {
                return next(new Error("Authentication error: User not found"));
            }

            socket.user = user;
            next();
        } catch (err) {
            return next(new Error("Authentication error: Invalid token"));
        }
    });

    io.on("connection", (socket) => {
        console.log(
            `Socket connected: ${socket.id} (User: ${socket.user.username})`
        );

        // Join individual user room for personal alerts and direct notifications
        socket.join(`user_${socket.user._id}`);

        // Join chat room (either direct 1-to-1 or shared workspace channel)
        socket.on("join_chat", async (conversationId) => {
            try {
                const conversation = await Conversation.findById(conversationId);
                if (!conversation) {
                    return socket.emit("chat_error", "Conversation not found");
                }

                // Verify access permissions
                if (conversation.type === "direct") {
                    const isParticipant = conversation.participants.some((p) =>
                        p.equals(socket.user._id)
                    );
                    if (!isParticipant) {
                        return socket.emit(
                            "chat_error",
                            "Unauthorized: You are not a participant in this direct chat"
                        );
                    }
                } else if (conversation.type === "workspace") {
                    const project = await Project.findById(conversation.workspace);
                    if (!project) {
                        return socket.emit("chat_error", "Workspace not found");
                    }
                    const isMember =
                        project.owner.equals(socket.user._id) ||
                        project.members.some((m) => m.user.equals(socket.user._id));
                    if (!isMember) {
                        return socket.emit(
                            "chat_error",
                            "Unauthorized: You are not a member of this workspace"
                        );
                    }
                }

                socket.join(conversationId);
                socket.emit("joined_chat", { conversationId });
            } catch (err) {
                socket.emit("chat_error", err.message);
            }
        });

        // Leave a chat room
        socket.on("leave_chat", (conversationId) => {
            socket.leave(conversationId);
        });

        // Live send_message event
        socket.on("send_message", async ({ conversationId, content }) => {
            try {
                if (!content || !content.trim()) return;

                const conversation = await Conversation.findById(conversationId);
                if (!conversation) {
                    return socket.emit("chat_error", "Conversation not found");
                }

                if (conversation.type === "direct") {
                    const isParticipant = conversation.participants.some((p) =>
                        p.equals(socket.user._id)
                    );
                    if (!isParticipant) {
                        return socket.emit(
                            "chat_error",
                            "Unauthorized: You are not a participant in this direct chat"
                        );
                    }
                } else if (conversation.type === "workspace") {
                    const project = await Project.findById(conversation.workspace);
                    if (!project) {
                        return socket.emit("chat_error", "Workspace not found");
                    }
                    const isMember =
                        project.owner.equals(socket.user._id) ||
                        project.members.some((m) => m.user.equals(socket.user._id));
                    if (!isMember) {
                        return socket.emit(
                            "chat_error",
                            "Unauthorized: You are not a member of this workspace"
                        );
                    }
                }

                // 1. Save to MongoDB
                const message = await Message.create({
                    conversation: conversationId,
                    sender: socket.user._id,
                    content: content.trim()
                });

                // 2. Update lastMessage on conversation
                conversation.lastMessage = message._id;
                await conversation.save();

                const populatedMessage = await Message.findById(message._id)
                    .populate("sender", "username fullName avatar headline");

                // 3. Broadcast to all sockets in the conversation room
                io.to(conversationId).emit("receive_message", populatedMessage);

                // 4. Trigger in-app notification for recipient(s)
                const snippet =
                    content.length > 60
                        ? `${content.substring(0, 57)}...`
                        : content;

                if (conversation.type === "direct") {
                    const recipientId = conversation.participants.find(
                        (p) => !p.equals(socket.user._id)
                    );
                    if (recipientId) {
                        await createAndEmitNotification({
                            recipient: recipientId,
                            sender: socket.user._id,
                            type: "new_message",
                            title: `New message from ${socket.user.fullName}`,
                            message: snippet,
                            link: `/messages?convo=${conversation._id}`
                        });
                    }
                } else if (conversation.type === "workspace") {
                    const project = await Project.findById(conversation.workspace);
                    if (project) {
                        const otherMemberIds = [
                            project.owner,
                            ...project.members.map((m) => m.user)
                        ].filter((id) => id && !id.equals(socket.user._id));

                        const uniqueMemberIds = [
                            ...new Set(otherMemberIds.map((id) => id.toString()))
                        ];

                        for (const memberId of uniqueMemberIds) {
                            await createAndEmitNotification({
                                recipient: memberId,
                                sender: socket.user._id,
                                type: "new_message",
                                title: `New message in ${project.name}`,
                                message: `${socket.user.fullName}: ${snippet}`,
                                link: `/workspaces/${project._id}`
                            });
                        }
                    }
                }
            } catch (err) {
                socket.emit("chat_error", err.message);
            }
        });

        // Typing indicators
        socket.on("typing", ({ conversationId }) => {
            socket.to(conversationId).emit("user_typing", {
                conversationId,
                user: {
                    _id: socket.user._id,
                    username: socket.user.username,
                    fullName: socket.user.fullName
                }
            });
        });

        socket.on("stop_typing", ({ conversationId }) => {
            socket.to(conversationId).emit("user_stop_typing", {
                conversationId,
                userId: socket.user._id
            });
        });

        socket.on("disconnect", () => {
            console.log(`Socket disconnected: ${socket.id}`);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error("Socket.IO has not been initialized!");
    }
    return io;
};
