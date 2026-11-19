import { Router } from "express";
import {
    createTask,
    getWorkspaceTasks,
    getTaskById,
    updateTask,
    updateTaskStatus,
    reassignTask,
    deleteTask,
    getMyAssignedTasks
} from "../controllers/task.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Protect all task routes with JWT verification
router.use(verifyJWT);

// Cross-workspace: All tasks assigned to the current user
router.route("/my-tasks").get(getMyAssignedTasks);

// Workspace tasks CRUD
router
    .route("/")
    .post(createTask)
    .get(getWorkspaceTasks);

router
    .route("/workspace/:projectId")
    .post(createTask)
    .get(getWorkspaceTasks);

// Individual task operations
router
    .route("/:taskId")
    .get(getTaskById)
    .patch(updateTask)
    .delete(deleteTask);

// Quick status and assignee transitions (Kanban card movements)
router.route("/:taskId/status").patch(updateTaskStatus);
router.route("/:taskId/assignee").patch(reassignTask);

export default router;
