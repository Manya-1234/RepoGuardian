import { Router } from "express";
import {
    linkRepository,
    unlinkRepository,
    getRepoOverview,
    getRepoBranches,
    getRepoCommits,
    getRepoPullRequests,
    getRepoFileTree,
    getRepoFileContent
} from "../controllers/github.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Protect all GitHub routes with JWT verification
router.use(verifyJWT);

// Repository linking & management
router.route("/workspace/:projectId/link").post(linkRepository);
router.route("/workspace/:projectId/unlink").delete(unlinkRepository);

// Repository metadata & activity
router.route("/workspace/:projectId/overview").get(getRepoOverview);
router.route("/workspace/:projectId/branches").get(getRepoBranches);
router.route("/workspace/:projectId/commits").get(getRepoCommits);
router.route("/workspace/:projectId/pulls").get(getRepoPullRequests);

// Codebase tree & raw file content (powers Phase 7 Codebase Intelligence)
router.route("/workspace/:projectId/tree").get(getRepoFileTree);
router.route("/workspace/:projectId/file-content").get(getRepoFileContent);

export default router;
