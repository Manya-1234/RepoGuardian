import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Project } from "../models/project.model.js";
import { User } from "../models/user.model.js";

const createProject = asyncHandler(async (req, res) => {
    const { name, description, githubRepo } = req.body;

    if (!name || name.trim() === "") {
        throw new ApiError(400, "Project name is required");
    }

    const project = await Project.create({
        name: name.trim(),
        description: description?.trim() || "",
        owner: req.user._id,
        members: [
            {
                user: req.user._id,
                role: "admin"
            }
        ],
        githubRepo: {
            url: githubRepo?.url?.trim() || "",
            owner: githubRepo?.owner?.trim() || "",
            name: githubRepo?.name?.trim() || ""
        }
    });

    const populatedProject = await Project.findById(project._id)
        .populate("owner", "username fullName email avatar")
        .populate("members.user", "username fullName email avatar");

    return res
        .status(201)
        .json(
            new ApiResponse(201, populatedProject, "Project created successfully")
        );
});

const getUserProjects = asyncHandler(async (req, res) => {
    const projects = await Project.find({
        $or: [{ owner: req.user._id }, { "members.user": req.user._id }]
    })
        .populate("owner", "username fullName email avatar")
        .populate("members.user", "username fullName email avatar")
        .sort({ updatedAt: -1 });

    return res
        .status(200)
        .json(new ApiResponse(200, projects, "Projects fetched successfully"));
});

const getProjectById = asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    if (!mongoose.isValidObjectId(projectId)) {
        throw new ApiError(400, "Invalid project ID format");
    }

    const project = await Project.findById(projectId)
        .populate("owner", "username fullName email avatar")
        .populate("members.user", "username fullName email avatar");

    if (!project) {
        throw new ApiError(404, "Project not found");
    }

    const isAuthorized =
        project.owner._id.equals(req.user._id) ||
        project.members.some((m) => m.user._id.equals(req.user._id));

    if (!isAuthorized) {
        throw new ApiError(403, "You do not have permission to view this project");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, project, "Project fetched successfully"));
});

const updateProject = asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { name, description, status, githubRepo } = req.body;

    if (!mongoose.isValidObjectId(projectId)) {
        throw new ApiError(400, "Invalid project ID format");
    }

    const project = await Project.findById(projectId);

    if (!project) {
        throw new ApiError(404, "Project not found");
    }

    const isOwner = project.owner.equals(req.user._id);
    const isAdmin = project.members.some(
        (m) => m.user.equals(req.user._id) && m.role === "admin"
    );

    if (!isOwner && !isAdmin) {
        throw new ApiError(403, "Only project owners or admins can update project settings");
    }

    if (name && name.trim() !== "") {
        project.name = name.trim();
    }

    if (description !== undefined) {
        project.description = description.trim();
    }

    if (status && ["active", "archived", "completed"].includes(status)) {
        project.status = status;
    }

    if (githubRepo) {
        project.githubRepo = {
            url: githubRepo.url?.trim() || project.githubRepo?.url || "",
            owner: githubRepo.owner?.trim() || project.githubRepo?.owner || "",
            name: githubRepo.name?.trim() || project.githubRepo?.name || ""
        };
    }

    await project.save();

    const updatedProject = await Project.findById(projectId)
        .populate("owner", "username fullName email avatar")
        .populate("members.user", "username fullName email avatar");

    return res
        .status(200)
        .json(new ApiResponse(200, updatedProject, "Project updated successfully"));
});

const addProjectMember = asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { emailOrUsername, role = "member" } = req.body;

    if (!mongoose.isValidObjectId(projectId)) {
        throw new ApiError(400, "Invalid project ID format");
    }

    if (!emailOrUsername || emailOrUsername.trim() === "") {
        throw new ApiError(400, "Username or email of the member is required");
    }

    if (!["admin", "member", "viewer"].includes(role)) {
        throw new ApiError(400, "Role must be 'admin', 'member', or 'viewer'");
    }

    const project = await Project.findById(projectId);

    if (!project) {
        throw new ApiError(404, "Project not found");
    }

    const isOwner = project.owner.equals(req.user._id);
    const isAdmin = project.members.some(
        (m) => m.user.equals(req.user._id) && m.role === "admin"
    );

    if (!isOwner && !isAdmin) {
        throw new ApiError(403, "Only project owners or admins can add members");
    }

    const userToAdd = await User.findOne({
        $or: [
            { username: emailOrUsername.toLowerCase().trim() },
            { email: emailOrUsername.toLowerCase().trim() }
        ]
    });

    if (!userToAdd) {
        throw new ApiError(404, "User with this username or email not found");
    }

    const alreadyMember = project.members.some((m) =>
        m.user.equals(userToAdd._id)
    );

    if (alreadyMember) {
        throw new ApiError(409, "User is already a member of this project");
    }

    project.members.push({
        user: userToAdd._id,
        role,
        joinedAt: new Date()
    });

    await project.save();

    const updatedProject = await Project.findById(projectId)
        .populate("owner", "username fullName email avatar")
        .populate("members.user", "username fullName email avatar");

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedProject, "Member added successfully")
        );
});

const removeProjectMember = asyncHandler(async (req, res) => {
    const { projectId, userId } = req.params;

    if (
        !mongoose.isValidObjectId(projectId) ||
        !mongoose.isValidObjectId(userId)
    ) {
        throw new ApiError(400, "Invalid project ID or user ID format");
    }

    const project = await Project.findById(projectId);

    if (!project) {
        throw new ApiError(404, "Project not found");
    }

    if (project.owner.equals(userId)) {
        throw new ApiError(400, "Project owner cannot be removed from members");
    }

    const isSelf = req.user._id.equals(userId);
    const isOwner = project.owner.equals(req.user._id);
    const isAdmin = project.members.some(
        (m) => m.user.equals(req.user._id) && m.role === "admin"
    );

    if (!isSelf && !isOwner && !isAdmin) {
        throw new ApiError(
            403,
            "You do not have permission to remove this member"
        );
    }

    const memberExists = project.members.some((m) => m.user.equals(userId));

    if (!memberExists) {
        throw new ApiError(404, "Member not found in this project");
    }

    project.members = project.members.filter((m) => !m.user.equals(userId));
    await project.save();

    const updatedProject = await Project.findById(projectId)
        .populate("owner", "username fullName email avatar")
        .populate("members.user", "username fullName email avatar");

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedProject, "Member removed successfully")
        );
});

const deleteProject = asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    if (!mongoose.isValidObjectId(projectId)) {
        throw new ApiError(400, "Invalid project ID format");
    }

    const project = await Project.findById(projectId);

    if (!project) {
        throw new ApiError(404, "Project not found");
    }

    if (!project.owner.equals(req.user._id)) {
        throw new ApiError(403, "Only the project owner can delete this project");
    }

    await Project.findByIdAndDelete(projectId);

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Project deleted successfully"));
});

export {
    createProject,
    getUserProjects,
    getProjectById,
    updateProject,
    addProjectMember,
    removeProjectMember,
    deleteProject
};
