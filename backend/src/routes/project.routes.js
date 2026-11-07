import { Router } from "express";
import {
    createProject,
    getUserProjects,
    getProjectById,
    updateProject,
    inviteWorkspaceMember,
    addProjectMember,
    removeProjectMember,
    deleteProject,
    respondToWorkspaceInvitation,
    getMyWorkspaceInvitations,
    getWorkspacePendingInvitations
} from "../controllers/project.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Protect all project routes with JWT verification
router.use(verifyJWT);

// User's received workspace invitations (must be defined before /:projectId)
router.route("/invitations/my").get(getMyWorkspaceInvitations);
router
    .route("/invitations/:invitationId/respond")
    .patch(respondToWorkspaceInvitation);

// Project CRUD
router.route("/").post(createProject).get(getUserProjects);
router
    .route("/:projectId")
    .get(getProjectById)
    .patch(updateProject)
    .delete(deleteProject);

// Workspace Invitation & Member Management
router
    .route("/:projectId/invitations")
    .post(inviteWorkspaceMember)
    .get(getWorkspacePendingInvitations);

router.route("/:projectId/members").post(addProjectMember);
router.route("/:projectId/members/:userId").delete(removeProjectMember);

export default router;

