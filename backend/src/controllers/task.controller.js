import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Task } from "../models/task.model.js";
import { Project } from "../models/project.model.js";
import { createAndEmitNotification } from "../utils/notification.helper.js";
import { getIO } from "../socket/index.js";

const createTask = asyncHandler(async (req, res) => {
    const projectId =
        req.params.projectId ||
        req.body.workspace ||
        req.body.workspaceId ||
        req.body.projectId;

    const {
        title,
        description = "",
        assignedTo = null,
        priority = "medium",
        status = "todo",
        dueDate = null,
        tags = [],
        github = {}
    } = req.body;

    if (!projectId) {
        throw new ApiError(400, "Workspace ID is required");
    }

    if (!mongoose.isValidObjectId(projectId)) {
        throw new ApiError(400, "Invalid workspace ID format");
    }

    if (!title || !title.trim()) {
        throw new ApiError(400, "Task title is required");
    }

    const project = await Project.findById(projectId);
    if (!project) {
        throw new ApiError(404, "Workspace not found");
    }

    // Verify caller is owner or admin of this workspace
    const isOwner = project.owner.equals(req.user._id);
    const isAdmin = project.members.some(
        (m) =>
            (m.user?._id || m.user).toString() === req.user._id.toString() &&
            m.role === "admin"
    );

    if (!isOwner && !isAdmin) {
        throw new ApiError(
            403,
            "Access denied: Only workspace owners and admins can create tasks"
        );
    }

    // If assigning to someone, verify they are an accepted member or owner
    let validAssignee = null;
    if (assignedTo) {
        if (!mongoose.isValidObjectId(assignedTo)) {
            throw new ApiError(400, "Invalid assigned user ID format");
        }

        const isAssigneeInWorkspace =
            project.owner.equals(assignedTo) ||
            project.members.some((m) => m.user.equals(assignedTo));

        if (!isAssigneeInWorkspace) {
            throw new ApiError(
                400,
                "Assigned user must be an active member of this workspace"
            );
        }
        validAssignee = assignedTo;
    }

    const githubUrl = github?.url?.trim() || github?.prUrl?.trim() || "";

    const task = await Task.create({
        title: title.trim(),
        description: description.trim(),
        project: projectId,
        assignedTo: validAssignee,
        createdBy: req.user._id,
        priority: ["low", "medium", "high", "urgent"].includes(priority) ? priority : "medium",
        status: ["todo", "in_progress", "in_review", "done"].includes(status) ? status : "todo",
        dueDate: dueDate ? new Date(dueDate) : null,
        tags: Array.isArray(tags) ? tags.map((t) => t.trim()).filter(Boolean) : [],
        github: {
            branch: github?.branch?.trim() || "",
            prUrl: githubUrl,
            url: githubUrl,
            issueNumber: github?.issueNumber || null
        }
    });

    const populatedTask = await Task.findById(task._id)
        .populate("assignedTo", "username fullName avatar headline")
        .populate("createdBy", "username fullName avatar")
        .populate("project", "name description");

    // Notification: if assigned to another teammate, send notification
    if (validAssignee && !req.user._id.equals(validAssignee)) {
        await createAndEmitNotification({
            recipient: validAssignee,
            sender: req.user._id,
            type: "task_assigned",
            title: "New Task Assigned",
            message: `${req.user.fullName} assigned you a task: "${task.title}" in ${project.name}`,
            link: `/workspaces/${project._id}?tab=kanban`
        });
    }

    // Broadcast live over WebSockets
    try {
        const io = getIO();
        io.to(projectId.toString()).emit("task_created", populatedTask);
    } catch {
        // Non-blocking
    }

    return res
        .status(201)
        .json(new ApiResponse(201, populatedTask, "Task created successfully"));
});

const getWorkspaceTasks = asyncHandler(async (req, res) => {
    const projectId =
        req.params.projectId ||
        req.query.workspaceId ||
        req.query.projectId ||
        req.query.workspace;

    const { status, priority, assignedTo, search, tag, groupBy } = req.query;

    if (!projectId) {
        throw new ApiError(400, "Workspace ID is required");
    }

    if (!mongoose.isValidObjectId(projectId)) {
        throw new ApiError(400, "Invalid workspace ID format");
    }

    const project = await Project.findById(projectId);
    if (!project) {
        throw new ApiError(404, "Workspace not found");
    }

    // Membership check
    const isMember =
        project.owner.equals(req.user._id) ||
        project.members.some((m) => m.user.equals(req.user._id));

    if (!isMember) {
        throw new ApiError(
            403,
            "Access denied: You are not a member of this workspace"
        );
    }

    const query = { project: projectId };

    if (status && ["todo", "in_progress", "in_review", "done"].includes(status)) {
        query.status = status;
    }

    if (priority && ["low", "medium", "high", "urgent"].includes(priority)) {
        query.priority = priority;
    }

    if (assignedTo) {
        if (assignedTo === "unassigned") {
            query.assignedTo = null;
        } else if (mongoose.isValidObjectId(assignedTo)) {
            query.assignedTo = assignedTo;
        }
    }

    if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), "i");
        query.$or = [{ title: searchRegex }, { description: searchRegex }];
    }

    if (tag && tag.trim()) {
        query.tags = new RegExp(`^${tag.trim()}$`, "i");
    }

    const tasks = await Task.find(query)
        .populate("assignedTo", "username fullName avatar headline")
        .populate("createdBy", "username fullName avatar")
        .sort({ createdAt: -1 });

    // Group for Kanban boards if requested
    if (groupBy === "status") {
        const kanban = {
            todo: tasks.filter((t) => t.status === "todo"),
            in_progress: tasks.filter((t) => t.status === "in_progress"),
            in_review: tasks.filter((t) => t.status === "in_review"),
            done: tasks.filter((t) => t.status === "done")
        };
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    kanban,
                    "Kanban tasks fetched successfully"
                )
            );
    }

    return res
        .status(200)
        .json(new ApiResponse(200, tasks, "Tasks fetched successfully"));
});

const getTaskById = asyncHandler(async (req, res) => {
    const { taskId } = req.params;

    if (!mongoose.isValidObjectId(taskId)) {
        throw new ApiError(400, "Invalid task ID format");
    }

    const task = await Task.findById(taskId)
        .populate("assignedTo", "username fullName avatar headline skills")
        .populate("createdBy", "username fullName avatar")
        .populate("project", "name description owner members githubRepo");

    if (!task) {
        throw new ApiError(404, "Task not found");
    }

    // Access check: User must be member of the workspace
    const project = task.project;
    const isMember =
        project.owner.equals(req.user._id) ||
        project.members.some((m) => m.user.equals(req.user._id));

    if (!isMember) {
        throw new ApiError(
            403,
            "Access denied: You are not a member of this workspace"
        );
    }

    return res
        .status(200)
        .json(new ApiResponse(200, task, "Task details fetched successfully"));
});

const updateTask = asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const { title, description, priority, status, dueDate, tags, github, assignedTo } = req.body;

    if (!mongoose.isValidObjectId(taskId)) {
        throw new ApiError(400, "Invalid task ID format");
    }

    const task = await Task.findById(taskId);
    if (!task) {
        throw new ApiError(404, "Task not found");
    }

    const project = await Project.findById(task.project);
    const isOwner = project.owner.equals(req.user._id);
    const isAdmin = project.members.some(
        (m) =>
            (m.user?._id || m.user).toString() === req.user._id.toString() &&
            m.role === "admin"
    );

    if (status && !isOwner && !isAdmin) {
        throw new ApiError(
            403,
            "Access denied: Only workspace owners and admins can move task status"
        );
    }

    const isMember = isOwner || project.members.some((m) => m.user.equals(req.user._id));

    if (!isMember) {
        throw new ApiError(
            403,
            "Access denied: You are not a member of this workspace"
        );
    }

    if (title && title.trim()) task.title = title.trim();
    if (description !== undefined) task.description = description.trim();
    if (priority && ["low", "medium", "high", "urgent"].includes(priority)) {
        task.priority = priority;
    }

    // Handle Assignee updates
    let assigneeNotificationNeeded = false;
    let newAssigneeId = null;

    if (assignedTo !== undefined) {
        if (!assignedTo || assignedTo === "" || assignedTo === "unassigned") {
            task.assignedTo = null;
        } else {
            if (!mongoose.isValidObjectId(assignedTo)) {
                throw new ApiError(400, "Invalid assigned user ID format");
            }
            const isAssigneeInWorkspace =
                project.owner.equals(assignedTo) ||
                project.members.some((m) => m.user.equals(assignedTo));

            if (!isAssigneeInWorkspace) {
                throw new ApiError(
                    400,
                    "Assigned user must be an active member of this workspace"
                );
            }

            const isDifferentAssignee =
                !task.assignedTo || !task.assignedTo.equals(assignedTo);

            task.assignedTo = assignedTo;

            if (isDifferentAssignee && !req.user._id.equals(assignedTo)) {
                assigneeNotificationNeeded = true;
                newAssigneeId = assignedTo;
            }
        }
    }

    const oldStatus = task.status;
    if (status && ["todo", "in_progress", "in_review", "done"].includes(status)) {
        task.status = status;
        if (
            (status === "in_review" || status === "done") &&
            !task.createdBy.equals(req.user._id) &&
            oldStatus !== status
        ) {
            await createAndEmitNotification({
                recipient: task.createdBy,
                sender: req.user._id,
                type: "task_status_changed",
                title: `Task Marked as ${status.replace("_", " ").toUpperCase()}`,
                message: `${req.user.fullName} moved task "${task.title}" to ${status.replace("_", " ")}`,
                link: `/workspaces/${project._id}?tab=kanban`
            });
        }
    }
    if (dueDate !== undefined) {
        task.dueDate = dueDate ? new Date(dueDate) : null;
    }
    if (Array.isArray(tags)) {
        task.tags = tags.map((t) => t.trim()).filter(Boolean);
    }
    if (github && typeof github === "object") {
        const branch = github.branch?.trim() || task.github?.branch || "";
        const prUrl = github.prUrl?.trim() || github.url?.trim() || task.github?.prUrl || "";
        const url = github.url?.trim() || github.prUrl?.trim() || task.github?.url || "";
        const issueNumber = github.issueNumber !== undefined ? github.issueNumber : task.github?.issueNumber;
        task.github = { branch, prUrl, url, issueNumber };
    }

    await task.save();

    // Notify newly assigned teammate
    if (assigneeNotificationNeeded && newAssigneeId) {
        await createAndEmitNotification({
            recipient: newAssigneeId,
            sender: req.user._id,
            type: "task_assigned",
            title: "Task Assigned to You",
            message: `${req.user.fullName} assigned you to task "${task.title}" in ${project.name}`,
            link: `/workspaces/${project._id}?tab=kanban`
        });
    }

    const updatedTask = await Task.findById(taskId)
        .populate("assignedTo", "username fullName avatar headline")
        .populate("createdBy", "username fullName avatar")
        .populate("project", "name description");

    try {
        const io = getIO();
        io.to(task.project.toString()).emit("task_updated", updatedTask);
        if (status && oldStatus !== status) {
            io.to(task.project.toString()).emit("task_status_updated", {
                taskId: task._id,
                oldStatus,
                newStatus: status,
                task: updatedTask
            });
        }
    } catch {
        // Non-blocking
    }

    return res
        .status(200)
        .json(new ApiResponse(200, updatedTask, "Task updated successfully"));
});

const updateTaskStatus = asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(taskId)) {
        throw new ApiError(400, "Invalid task ID format");
    }

    if (!["todo", "in_progress", "in_review", "done"].includes(status)) {
        throw new ApiError(
            400,
            "Invalid status. Must be 'todo', 'in_progress', 'in_review', or 'done'"
        );
    }

    const task = await Task.findById(taskId);
    if (!task) {
        throw new ApiError(404, "Task not found");
    }

    const project = await Project.findById(task.project);
    const isOwner = project.owner.equals(req.user._id);
    const isAdmin = project.members.some(
        (m) =>
            (m.user?._id || m.user).toString() === req.user._id.toString() &&
            m.role === "admin"
    );

    if (!isOwner && !isAdmin) {
        throw new ApiError(
            403,
            "Access denied: Only workspace owners and admins can move task status"
        );
    }

    const isMember = isOwner || project.members.some((m) => m.user.equals(req.user._id));

    if (!isMember) {
        throw new ApiError(
            403,
            "Access denied: You are not a member of this workspace"
        );
    }

    const oldStatus = task.status;
    task.status = status;
    await task.save();

    const updatedTask = await Task.findById(taskId)
        .populate("assignedTo", "username fullName avatar headline")
        .populate("createdBy", "username fullName avatar");

    // Notification: if task status is marked in_review or done, notify creator (if not the one who changed it)
    if (
        (status === "in_review" || status === "done") &&
        !task.createdBy.equals(req.user._id)
    ) {
        await createAndEmitNotification({
            recipient: task.createdBy,
            sender: req.user._id,
            type: "task_status_changed",
            title: `Task Marked as ${status.replace("_", " ").toUpperCase()}`,
            message: `${req.user.fullName} moved task "${task.title}" to ${status.replace("_", " ")}`,
            link: `/workspaces/${project._id}?tab=kanban`
        });
    }

    try {
        const io = getIO();
        io.to(task.project.toString()).emit("task_status_updated", {
            taskId: task._id,
            oldStatus,
            newStatus: status,
            task: updatedTask
        });
    } catch {
        // Non-blocking
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                updatedTask,
                `Task status updated to ${status} successfully`
            )
        );
});

const reassignTask = asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const { assignedTo } = req.body;

    if (!mongoose.isValidObjectId(taskId)) {
        throw new ApiError(400, "Invalid task ID format");
    }

    const task = await Task.findById(taskId);
    if (!task) {
        throw new ApiError(404, "Task not found");
    }

    const project = await Project.findById(task.project);
    const isOwner = project.owner.equals(req.user._id);
    const isAdmin = project.members.some(
        (m) =>
            (m.user?._id || m.user).toString() === req.user._id.toString() &&
            m.role === "admin"
    );

    if (!isOwner && !isAdmin) {
        throw new ApiError(
            403,
            "Access denied: Only workspace owners and admins can reassign tasks"
        );
    }

    const isMember = isOwner || project.members.some((m) => m.user.equals(req.user._id));

    if (!isMember) {
        throw new ApiError(
            403,
            "Access denied: You are not a member of this workspace"
        );
    }

    let newAssignee = null;
    if (assignedTo) {
        if (!mongoose.isValidObjectId(assignedTo)) {
            throw new ApiError(400, "Invalid assigned user ID format");
        }

        const isAssigneeInWorkspace =
            project.owner.equals(assignedTo) ||
            project.members.some((m) => m.user.equals(assignedTo));

        if (!isAssigneeInWorkspace) {
            throw new ApiError(
                400,
                "Assigned user must be an active member of this workspace"
            );
        }
        newAssignee = assignedTo;
    }

    task.assignedTo = newAssignee;
    await task.save();

    const updatedTask = await Task.findById(taskId)
        .populate("assignedTo", "username fullName avatar headline")
        .populate("createdBy", "username fullName avatar");

    if (newAssignee && !req.user._id.equals(newAssignee)) {
        await createAndEmitNotification({
            recipient: newAssignee,
            sender: req.user._id,
            type: "task_reassigned",
            title: "Task Reassigned to You",
            message: `${req.user.fullName} reassigned task "${task.title}" to you in ${project.name}`,
            link: `/workspaces/${project._id}?tab=kanban`
        });
    }

    try {
        const io = getIO();
        io.to(task.project.toString()).emit("task_updated", updatedTask);
    } catch {
        // Non-blocking
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedTask, "Task reassigned successfully")
        );
});

const deleteTask = asyncHandler(async (req, res) => {
    const { taskId } = req.params;

    if (!mongoose.isValidObjectId(taskId)) {
        throw new ApiError(400, "Invalid task ID format");
    }

    const task = await Task.findById(taskId);
    if (!task) {
        throw new ApiError(404, "Task not found");
    }

    const project = await Project.findById(task.project);
    if (!project) {
        throw new ApiError(404, "Workspace not found");
    }

    const isOwner = project.owner.equals(req.user._id);
    const isAdmin = project.members.some(
        (m) => m.user.equals(req.user._id) && m.role === "admin"
    );
    const isCreator = task.createdBy.equals(req.user._id);

    if (!isOwner && !isAdmin && !isCreator) {
        throw new ApiError(
            403,
            "Only the task creator or workspace admins can delete this task"
        );
    }

    await Task.findByIdAndDelete(taskId);

    try {
        const io = getIO();
        io.to(task.project.toString()).emit("task_deleted", { taskId });
    } catch {
        // Non-blocking
    }

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Task deleted successfully"));
});

const getMyAssignedTasks = asyncHandler(async (req, res) => {
    const { status, priority } = req.query;

    const query = { assignedTo: req.user._id };

    if (status && ["todo", "in_progress", "in_review", "done"].includes(status)) {
        query.status = status;
    }

    if (priority && ["low", "medium", "high", "urgent"].includes(priority)) {
        query.priority = priority;
    }

    const tasks = await Task.find(query)
        .populate("project", "name description githubRepo status")
        .populate("createdBy", "username fullName avatar")
        .sort({ dueDate: 1, updatedAt: -1 });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                tasks,
                "Your assigned tasks fetched successfully"
            )
        );
});

export {
    createTask,
    getWorkspaceTasks,
    getTaskById,
    updateTask,
    updateTaskStatus,
    reassignTask,
    deleteTask,
    getMyAssignedTasks
};
