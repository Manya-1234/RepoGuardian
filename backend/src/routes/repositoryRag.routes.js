import { Router } from "express";
import {
    triggerRepositoryIndexing,
    getRepositoryIndexingStatus,
    queryRepositoryChat,
    searchRepositoryCode
} from "../controllers/repositoryRag.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Protect all repository intelligence routes with JWT verification
router.use(verifyJWT);

// Repository indexing management
router.route("/:repositoryId/index").post(triggerRepositoryIndexing);
router.route("/:repositoryId/index/status").get(getRepositoryIndexingStatus);

// Natural-language repository Q&A
router.route("/:repositoryId/chat").post(queryRepositoryChat);

// Direct hybrid code & symbol search
router.route("/:repositoryId/search").get(searchRepositoryCode);

export default router;
