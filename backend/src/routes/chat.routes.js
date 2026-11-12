import { Router } from "express";
import {
    getOrCreateDirectConversation,
    getOrCreateWorkspaceConversation,
    getUserConversations,
    getConversationMessages,
    sendMessageRest
} from "../controllers/chat.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Protect all chat routes with JWT verification
router.use(verifyJWT);

// Conversations listing
router.route("/conversations").get(getUserConversations);

// Initialize or get 1-to-1 direct chat (pre-team or teammate) - supports GET and POST
router
    .route("/direct/:recipientId")
    .get(getOrCreateDirectConversation)
    .post(getOrCreateDirectConversation);

// Initialize or get workspace team chat channel
router.route("/workspace/:projectId").get(getOrCreateWorkspaceConversation);

// Messages inside a conversation
router
    .route("/:conversationId/messages")
    .get(getConversationMessages)
    .post(sendMessageRest);

export default router;
