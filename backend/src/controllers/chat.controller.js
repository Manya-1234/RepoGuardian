import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Conversation } from "../models/conversation.model.js";
import { Message } from "../models/message.model.js";
import { Project } from "../models/project.model.js";
import { User } from "../models/user.model.js";
import { getIO } from "../socket/index.js";
import { createAndEmitNotification } from "../utils/notification.helper.js";

const getOrCreateDirectConversation = asyncHandler(async (req, res) => {
    const { recipientId } = req.params;

    let targetUser = null;
    if (mongoose.isValidObjectId(recipientId)) {
        targetUser = await User.findById(recipientId);
    }
    if (!targetUser) {
        targetUser = await User.findOne({ username: recipientId.toLowerCase().trim() });
    }

    if (!targetUser) {
        throw new ApiError(404, "Recipient user not found");
    }

    if (req.user._id.equals(targetUser._id)) {
        throw new ApiError(400, "You cannot start a direct chat with yourself");
    }

    const actualRecipientId = targetUser._id;

    // Find existing direct conversation between these two users
    let conversation = await Conversation.findOne({
        type: "direct",
        participants: { $all: [req.user._id, actualRecipientId], $size: 2 }
    })
        .populate("participants", "username fullName email avatar headline")
        .populate({
            path: "lastMessage",
            populate: { path: "sender", select: "username fullName avatar" }
        });

    if (!conversation) {
        const newConv = await Conversation.create({
            type: "direct",
            participants: [req.user._id, actualRecipientId]
        });

        conversation = await Conversation.findById(newConv._id)
            .populate("participants", "username fullName email avatar headline");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                conversation,
                "Direct conversation retrieved successfully"
            )
        );
});

const getOrCreateWorkspaceConversation = asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    if (!mongoose.isValidObjectId(projectId)) {
        throw new ApiError(400, "Invalid workspace ID format");
    }

    const project = await Project.findById(projectId);
    if (!project) {
        throw new ApiError(404, "Workspace not found");
    }

    // Authorization: User must be owner or member
    const isMember =
        project.owner.equals(req.user._id) ||
        project.members.some((m) => m.user.equals(req.user._id));

    if (!isMember) {
        throw new ApiError(
            403,
            "Access denied: You are not a member of this workspace"
        );
    }

    let conversation = await Conversation.findOne({
        type: "workspace",
        workspace: projectId
    })
        .populate("workspace", "name description githubRepo status")
        .populate({
            path: "lastMessage",
            populate: { path: "sender", select: "username fullName avatar" }
        });

    if (!conversation) {
        const newConv = await Conversation.create({
            type: "workspace",
            workspace: projectId
        });

        conversation = await Conversation.findById(newConv._id)
            .populate("workspace", "name description githubRepo status");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                conversation,
                "Workspace conversation retrieved successfully"
            )
        );
});

const getUserConversations = asyncHandler(async (req, res) => {
    // 1. Direct conversations (only active chats where at least 1 message has been sent)
    const directConversations = await Conversation.find({
        type: "direct",
        participants: req.user._id,
        lastMessage: { $exists: true, $ne: null }
    })
        .populate("participants", "username fullName email avatar headline")
        .populate({
            path: "lastMessage",
            populate: { path: "sender", select: "username fullName avatar" }
        })
        .sort({ updatedAt: -1 });

    // 2. Workspaces where user is owner or member
    const userWorkspaces = await Project.find({
        $or: [{ owner: req.user._id }, { "members.user": req.user._id }]
    }).select("_id");

    const workspaceIds = userWorkspaces.map((w) => w._id);

    const workspaceConversations = await Conversation.find({
        type: "workspace",
        workspace: { $in: workspaceIds }
    })
        .populate("workspace", "name description githubRepo status")
        .populate({
            path: "lastMessage",
            populate: { path: "sender", select: "username fullName avatar" }
        })
        .sort({ updatedAt: -1 });

    // Combine and sort by last activity
    const allConversations = [...directConversations, ...workspaceConversations].sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { conversations: allConversations },
                "User conversations fetched successfully"
            )
        );
});

const getConversationMessages = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    if (!mongoose.isValidObjectId(conversationId)) {
        throw new ApiError(400, "Invalid conversation ID format");
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
        throw new ApiError(404, "Conversation not found");
    }

    // Verify access
    if (conversation.type === "direct") {
        const isParticipant = conversation.participants.some((p) =>
            p.equals(req.user._id)
        );
        if (!isParticipant) {
            throw new ApiError(
                403,
                "Unauthorized: You are not a participant in this direct chat"
            );
        }
    } else if (conversation.type === "workspace") {
        const project = await Project.findById(conversation.workspace);
        if (!project) {
            throw new ApiError(404, "Workspace not found");
        }
        const isMember =
            project.owner.equals(req.user._id) ||
            project.members.some((m) => m.user.equals(req.user._id));
        if (!isMember) {
            throw new ApiError(
                403,
                "Unauthorized: You are not a member of this workspace"
            );
        }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [messages, total] = await Promise.all([
        Message.find({ conversation: conversationId })
            .populate("sender", "username fullName email avatar headline")
            .sort({ createdAt: 1 })
            .skip(skip)
            .limit(limitNum),
        Message.countDocuments({ conversation: conversationId })
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                conversation,
                messages,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    totalPages: Math.ceil(total / limitNum)
                }
            },
            "Messages retrieved successfully"
        )
    );
});

const sendMessageRest = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { content } = req.body;

    if (!mongoose.isValidObjectId(conversationId)) {
        throw new ApiError(400, "Invalid conversation ID format");
    }

    if (!content || !content.trim()) {
        throw new ApiError(400, "Message content cannot be empty");
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
        throw new ApiError(404, "Conversation not found");
    }

    // Access check
    if (conversation.type === "direct") {
        const isParticipant = conversation.participants.some((p) =>
            p.equals(req.user._id)
        );
        if (!isParticipant) {
            throw new ApiError(
                403,
                "Unauthorized: You are not a participant in this direct chat"
            );
        }
    } else if (conversation.type === "workspace") {
        const project = await Project.findById(conversation.workspace);
        if (!project) {
            throw new ApiError(404, "Workspace not found");
        }
        const isMember =
            project.owner.equals(req.user._id) ||
            project.members.some((m) => m.user.equals(req.user._id));
        if (!isMember) {
            throw new ApiError(
                403,
                "Unauthorized: You are not a member of this workspace"
            );
        }
    }

    const message = await Message.create({
        conversation: conversationId,
        sender: req.user._id,
        content: content.trim()
    });

    conversation.lastMessage = message._id;
    await conversation.save();

    const populatedMessage = await Message.findById(message._id)
        .populate("sender", "username fullName email avatar headline");

    // Broadcast live over WebSockets if io is available
    try {
        const io = getIO();
        const room = conversationId.toString();
        io.to(room).emit("receive_message", populatedMessage);

        if (conversation.type === "direct") {
            for (const participantId of conversation.participants) {
                io.to(`user_${participantId.toString()}`).emit(
                    "receive_message",
                    populatedMessage
                );
            }
        } else if (conversation.type === "workspace" && conversation.workspace) {
            io.to(conversation.workspace.toString()).emit(
                "receive_message",
                populatedMessage
            );
        }
    } catch {
        // Non-blocking
    }

    // Trigger in-app notification for recipient(s)
    const snippet =
        content.length > 60
            ? `${content.substring(0, 57)}...`
            : content;

    if (conversation.type === "direct") {
        const recipientId = conversation.participants.find(
            (p) => !p.equals(req.user._id)
        );
        if (recipientId) {
            await createAndEmitNotification({
                recipient: recipientId,
                sender: req.user._id,
                type: "new_message",
                title: `New message from ${req.user.fullName}`,
                message: snippet,
                link: `/chat/${conversation._id}`
            });
        }
    } else if (conversation.type === "workspace") {
        const project = await Project.findById(conversation.workspace);
        if (project) {
            const otherMemberIds = [
                project.owner,
                ...project.members.map((m) => m.user)
            ].filter((id) => id && !id.equals(req.user._id));

            const uniqueMemberIds = [
                ...new Set(otherMemberIds.map((id) => id.toString()))
            ];

            for (const memberId of uniqueMemberIds) {
                await createAndEmitNotification({
                    recipient: memberId,
                    sender: req.user._id,
                    type: "new_message",
                    title: `New message in ${project.name}`,
                    message: `${req.user.fullName}: ${snippet}`,
                    link: `/workspaces/${project._id}?tab=chat`
                });
            }
        }
    }

    return res
        .status(201)
        .json(
            new ApiResponse(201, populatedMessage, "Message sent successfully")
        );
});

export {
    getOrCreateDirectConversation,
    getOrCreateWorkspaceConversation,
    getUserConversations,
    getConversationMessages,
    sendMessageRest
};
