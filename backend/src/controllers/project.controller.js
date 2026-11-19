import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Project } from "../models/project.model.js";
import { User } from "../models/user.model.js";
import { WorkspaceInvitation } from "../models/workspaceInvitation.model.js";
import { Task } from "../models/task.model.js";
import { Conversation } from "../models/conversation.model.js";
import { Message } from "../models/message.model.js";
import { TeamOpportunity } from "../models/teamOpportunity.model.js";
import { createAndEmitNotification } from "../utils/notification.helper.js";
import { getIO } from "../socket/index.js";

const createProject = asyncHandler(async (req, res) => {
    const { name, description, githubRepo } = req.body;

    if (!name || name.trim() === "") {
        throw new ApiError(400, "Project name is required");
    }

    const project = await Project.create({
        name: name.trim(),
        description: description?.trim() || "",
        owner: req.user._id,
        members: [],
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
        .json(new ApiResponse(200, { projects }, "Projects fetched successfully"));
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
            name: (githubRepo.name || githubRepo.repo)?.trim() || project.githubRepo?.name || ""
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

const inviteWorkspaceMember = asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    let { emailOrUsername, username, email, role = "member", message = "" } = req.body;
    const targetUserIdentifier = emailOrUsername || username || email;

    if (!mongoose.isValidObjectId(projectId)) {
        throw new ApiError(400, "Invalid project ID format");
    }

    if (!targetUserIdentifier || targetUserIdentifier.trim() === "") {
        throw new ApiError(400, "Username or email of the friend/member is required");
    }

    if (role === "developer") role = "member";
    if (role === "lead" || role === "maintainer") role = "admin";

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
        throw new ApiError(403, "Only project owners or admins can invite members");
    }

    const userToInvite = await User.findOne({
        $or: [
            { username: targetUserIdentifier.toLowerCase().trim() },
            { email: targetUserIdentifier.toLowerCase().trim() }
        ]
    });

    if (!userToInvite) {
        throw new ApiError(404, "User with this username or email not found");
    }

    if (userToInvite._id.equals(req.user._id)) {
        throw new ApiError(400, "You cannot invite yourself to the workspace");
    }

    const alreadyMember = project.members.some((m) =>
        m.user.equals(userToInvite._id)
    );

    if (alreadyMember) {
        throw new ApiError(409, "User is already a member of this workspace");
    }

    // Check if an invitation is already pending
    const existingInvitation = await WorkspaceInvitation.findOne({
        workspace: projectId,
        invitee: userToInvite._id,
        status: "pending"
    });

    if (existingInvitation) {
        throw new ApiError(
            409,
            "An invitation has already been sent to this user and is pending their response"
        );
    }

    const invitation = await WorkspaceInvitation.create({
        workspace: projectId,
        inviter: req.user._id,
        invitee: userToInvite._id,
        role,
        message: message.trim(),
        status: "pending"
    });

    const populatedInvitation = await WorkspaceInvitation.findById(invitation._id)
        .populate("workspace", "name description githubRepo")
        .populate("inviter", "username fullName email avatar")
        .populate("invitee", "username fullName email avatar");

    await createAndEmitNotification({
        recipient: userToInvite._id,
        sender: req.user._id,
        type: "workspace_invitation",
        title: "Workspace Invitation",
        message: `${req.user.fullName} (@${req.user.username}) invited you to join workspace "${project.name}" as ${role}`,
        link: "/workspaces"
    });

    return res
        .status(201)
        .json(
            new ApiResponse(
                201,
                populatedInvitation,
                `Workspace invitation sent to ${userToInvite.username}. They can accept or decline.`
            )
        );
});

const addProjectMember = inviteWorkspaceMember;

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

    const targetMember = project.members.find((m) => m.user.equals(userId));

    if (!targetMember) {
        throw new ApiError(404, "Member not found in this project");
    }

    // Admins cannot remove other admins (only owner can)
    if (!isSelf && !isOwner && targetMember.role === "admin") {
        throw new ApiError(
            403,
            "Admins cannot remove other admins. Only the owner can remove admins."
        );
    }

    project.members = project.members.filter((m) => !m.user.equals(userId));
    await project.save();

    const updatedProject = await Project.findById(projectId)
        .populate("owner", "username fullName email avatar")
        .populate("members.user", "username fullName email avatar");

    try {
        const io = getIO();
        io.to(projectId.toString()).emit("workspace_updated", updatedProject);
        io.to(projectId.toString()).emit("member_removed", { projectId, userId, workspace: updatedProject });
    } catch {
        // Non-blocking
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedProject, "Member removed successfully")
        );
});

const updateMemberRole = asyncHandler(async (req, res) => {
    const { projectId, userId } = req.params;
    const { role } = req.body;

    if (
        !mongoose.isValidObjectId(projectId) ||
        !mongoose.isValidObjectId(userId)
    ) {
        throw new ApiError(400, "Invalid project ID or user ID format");
    }

    if (!["admin", "member"].includes(role)) {
        throw new ApiError(400, "Role must be either 'admin' or 'member'");
    }

    const project = await Project.findById(projectId);

    if (!project) {
        throw new ApiError(404, "Project not found");
    }

    // Only owner can promote to admin or demote from admin
    const isOwner = project.owner.equals(req.user._id);
    if (!isOwner) {
        throw new ApiError(
            403,
            "Access denied: Only the workspace owner can change member roles"
        );
    }

    if (project.owner.equals(userId)) {
        throw new ApiError(400, "Cannot change the workspace owner's role");
    }

    const member = project.members.find((m) => m.user.equals(userId));
    if (!member) {
        throw new ApiError(404, "Member not found in this workspace");
    }

    member.role = role;
    await project.save();

    const updatedProject = await Project.findById(projectId)
        .populate("owner", "username fullName email avatar")
        .populate("members.user", "username fullName email avatar");

    // Send in-app notification to the promoted/demoted user
    const isNewAdmin = role === "admin";
    await createAndEmitNotification({
        recipient: userId,
        sender: req.user._id,
        type: "role_updated",
        title: isNewAdmin
            ? "Workspace Role Updated: Admin"
            : "Workspace Role Updated: Member",
        message: isNewAdmin
            ? `You are now an Admin in workspace "${project.name}". You can now manage members and Kanban tasks.`
            : `Your role in workspace "${project.name}" was changed to Member.`,
        link: `/workspaces/${project._id}?tab=members`
    });

    try {
        const io = getIO();
        io.to(projectId.toString()).emit("workspace_updated", updatedProject);
        io.to(projectId.toString()).emit("member_role_updated", {
            projectId,
            userId,
            newRole: role,
            workspace: updatedProject
        });
    } catch {
        // Non-blocking
    }

    return res.status(200).json(
        new ApiResponse(200, updatedProject, `Member role updated to ${role} successfully`)
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

    // Cascade deletions for associated workspace data
    await Task.deleteMany({ project: projectId });
    await WorkspaceInvitation.deleteMany({ workspace: projectId });

    const conversations = await Conversation.find({ workspace: projectId });
    for (const convo of conversations) {
        await Message.deleteMany({ conversation: convo._id });
        await Conversation.findByIdAndDelete(convo._id);
    }

    await TeamOpportunity.updateMany(
        { workspace: projectId },
        { $set: { workspace: null } }
    );

    await Project.findByIdAndDelete(projectId);

    try {
        const io = getIO();
        io.to(projectId.toString()).emit("workspace_deleted", { projectId });
    } catch {
        // Non-blocking
    }

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Workspace deleted successfully"));
});

const respondToWorkspaceInvitation = asyncHandler(async (req, res) => {
    const { invitationId } = req.params;
    let { action, response, status } = req.body;
    let resolvedAction = action || response || status;
    if (resolvedAction === "accepted") resolvedAction = "accept";
    if (resolvedAction === "declined") resolvedAction = "decline";

    if (!mongoose.isValidObjectId(invitationId)) {
        throw new ApiError(400, "Invalid invitation ID format");
    }

    if (!["accept", "decline", "withdraw"].includes(resolvedAction)) {
        throw new ApiError(
            400,
            "Invalid action. Must be 'accept', 'decline', or 'withdraw'"
        );
    }

    const invitation = await WorkspaceInvitation.findById(invitationId).populate(
        "workspace"
    );

    if (!invitation) {
        throw new ApiError(404, "Workspace invitation not found");
    }

    if (invitation.status !== "pending") {
        throw new ApiError(
            400,
            `Cannot respond to an invitation that is already ${invitation.status}`
        );
    }

    const isInvitee = invitation.invitee.equals(req.user._id);
    const isInviter = invitation.inviter.equals(req.user._id);

    if (resolvedAction === "accept" || resolvedAction === "decline") {
        if (!isInvitee) {
            throw new ApiError(
                403,
                "Only the invited user can accept or decline this workspace invitation"
            );
        }
    } else if (resolvedAction === "withdraw") {
        if (!isInviter) {
            throw new ApiError(
                403,
                "Only the inviter can withdraw this invitation"
            );
        }
    }

    const newStatus =
        resolvedAction === "accept"
            ? "accepted"
            : resolvedAction === "decline"
            ? "declined"
            : "withdrawn";

    invitation.status = newStatus;
    invitation.respondedAt = new Date();
    await invitation.save();

    // If accepted, add invitee to project members
    if (newStatus === "accepted") {
        const project = await Project.findById(invitation.workspace._id);
        if (project) {
            const alreadyMember = project.members.some((m) =>
                m.user.equals(invitation.invitee)
            );

            if (!alreadyMember) {
                project.members.push({
                    user: invitation.invitee,
                    role: invitation.role || "member",
                    joinedAt: new Date()
                });
                await project.save();
            }
        }
    }

    const updated = await WorkspaceInvitation.findById(invitation._id)
        .populate("workspace", "name description githubRepo")
        .populate("inviter", "username fullName email")
        .populate("invitee", "username fullName email");

    await createAndEmitNotification({
        recipient: invitation.inviter,
        sender: req.user._id,
        type: action === "accept" ? "workspace_invitation_accepted" : "workspace_invitation_declined",
        title: `Workspace Invitation ${newStatus}`,
        message: `${req.user.fullName} (@${req.user.username}) has ${newStatus} your invitation to join "${invitation.workspace.name}"`,
        link: `/workspaces/${invitation.workspace._id}`
    });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                updated,
                `Workspace invitation ${newStatus} successfully`
            )
        );
});

const getMyWorkspaceInvitations = asyncHandler(async (req, res) => {
    const { status = "pending" } = req.query;

    const query = { invitee: req.user._id };
    if (status && status !== "all") {
        query.status = status;
    }

    const invitations = await WorkspaceInvitation.find(query)
        .populate("workspace", "name description githubRepo status")
        .populate("inviter", "username fullName email avatar headline")
        .sort({ createdAt: -1 });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                invitations,
                "Your workspace invitations fetched successfully"
            )
        );
});

const getWorkspacePendingInvitations = asyncHandler(async (req, res) => {
    const { projectId } = req.params;

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
        throw new ApiError(
            403,
            "Only project owners or admins can view invitations"
        );
    }

    const invitations = await WorkspaceInvitation.find({
        workspace: projectId,
        status: "pending"
    })
        .populate("invitee", "username fullName email avatar headline")
        .populate("inviter", "username fullName email avatar")
        .sort({ createdAt: -1 });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                invitations,
                "Workspace pending invitations fetched successfully"
            )
        );
});

export {
    createProject,
    getUserProjects,
    getProjectById,
    updateProject,
    inviteWorkspaceMember,
    addProjectMember,
    removeProjectMember,
    updateMemberRole,
    deleteProject,
    respondToWorkspaceInvitation,
    getMyWorkspaceInvitations,
    getWorkspacePendingInvitations
};

