import { Router } from "express";
import {
    createProject,
    getUserProjects,
    getProjectById,
    updateProject,
    addProjectMember,
    removeProjectMember,
    deleteProject
} from "../controllers/project.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Protect all project routes with JWT verification
router.use(verifyJWT);

// Project CRUD
router.route("/").post(createProject).get(getUserProjects);
router
    .route("/:projectId")
    .get(getProjectById)
    .patch(updateProject)
    .delete(deleteProject);

// Project Member Management
router.route("/:projectId/members").post(addProjectMember);
router.route("/:projectId/members/:userId").delete(removeProjectMember);

export default router;
