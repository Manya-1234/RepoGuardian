import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { TeamApplication } from "../models/teamApplication.model.js";
import { TeamOpportunity } from "../models/teamOpportunity.model.js";
import { Project } from "../models/project.model.js";
import { User } from "../models/user.model.js";
import { createAndEmitNotification } from "../utils/notification.helper.js";

const applyToOpportunity = asyncHandler(async (req, res) => {
    const opportunityId = req.params.opportunityId || req.body.opportunityId;
    const { role = "Team Member", message = "" } = req.body;

    if (!opportunityId || !mongoose.isValidObjectId(opportunityId)) {
        throw new ApiError(400, "Invalid opportunity ID format");
    }

    const opportunity = await TeamOpportunity.findById(opportunityId).populate(
        "workspace"
    );

    if (!opportunity) {
        throw new ApiError(404, "Team opportunity not found");
    }

    if (opportunity.status !== "open") {
        throw new ApiError(400, "This opportunity is no longer open for applications");
    }

    if (opportunity.creator.equals(req.user._id)) {
        throw new ApiError(400, "You cannot apply to your own opportunity");
    }

    // Check if user is already a member of the linked workspace
    if (opportunity.workspace) {
        const isMember = opportunity.workspace.members?.some((m) =>
            m.user.equals(req.user._id)
        );
        if (isMember) {
            throw new ApiError(400, "You are already a member of this workspace");
        }
    }

    // Check for existing pending application or invitation
    const existingApplication = await TeamApplication.findOne({
        opportunity: opportunity._id,
        candidate: req.user._id,
        status: "pending"
    });

    if (existingApplication) {
        throw new ApiError(
            409,
            existingApplication.type === "invitation"
                ? "You already have a pending invitation for this opportunity. Please accept or reject it."
                : "You have already applied to this opportunity and your request is pending review"
        );
    }

    const application = await TeamApplication.create({
        opportunity: opportunity._id,
        candidate: req.user._id,
        sender: req.user._id,
        type: "join_request",
        role: role.trim(),
        message: message.trim()
    });

    const populatedApplication = await TeamApplication.findById(application._id)
        .populate("opportunity", "title description status expectedCommitment")
        .populate("candidate", "username fullName email avatar headline skills")
        .populate("sender", "username fullName email avatar");

    await createAndEmitNotification({
        recipient: opportunity.creator,
        sender: req.user._id,
        type: "join_request",
        title: "New Join Request",
        message: `${req.user.fullName} (@${req.user.username}) applied for ${role} on "${opportunity.title}"`,
        link: `/opportunities?tab=my&opportunityId=${opportunity._id}`
    });

    return res
        .status(201)
        .json(
            new ApiResponse(
                201,
                populatedApplication,
                "Join request submitted successfully"
            )
        );
});

const inviteDeveloper = asyncHandler(async (req, res) => {
    const { opportunityId } = req.params;
    const { candidateId, role = "Team Member", message = "" } = req.body;

    if (!mongoose.isValidObjectId(opportunityId)) {
        throw new ApiError(400, "Invalid opportunity ID format");
    }

    if (!candidateId || !mongoose.isValidObjectId(candidateId)) {
        throw new ApiError(400, "A valid candidate ID is required");
    }

    const opportunity = await TeamOpportunity.findById(opportunityId).populate(
        "workspace"
    );

    if (!opportunity) {
        throw new ApiError(404, "Team opportunity not found");
    }

    if (!opportunity.creator.equals(req.user._id)) {
        throw new ApiError(
            403,
            "Only the opportunity creator can invite developers"
        );
    }

    if (opportunity.creator.equals(candidateId)) {
        throw new ApiError(400, "You cannot invite yourself to your opportunity");
    }

    const candidate = await User.findById(candidateId);
    if (!candidate) {
        throw new ApiError(404, "Candidate user not found");
    }

    // Check if candidate is already in workspace
    if (opportunity.workspace) {
        const isMember = opportunity.workspace.members?.some((m) =>
            m.user.equals(candidateId)
        );
        if (isMember) {
            throw new ApiError(400, "This developer is already a member of this workspace");
        }
    }

    // Check for existing pending request or invitation
    const existing = await TeamApplication.findOne({
        opportunity: opportunity._id,
        candidate: candidateId,
        status: "pending"
    });

    if (existing) {
        throw new ApiError(
            409,
            existing.type === "invitation"
                ? "An invitation has already been sent to this developer and is pending"
                : "This developer has already applied to this opportunity. You can accept their join request."
        );
    }

    const invitation = await TeamApplication.create({
        opportunity: opportunity._id,
        candidate: candidateId,
        sender: req.user._id,
        type: "invitation",
        role: role.trim(),
        message: message.trim()
    });

    const populatedInvitation = await TeamApplication.findById(invitation._id)
        .populate("opportunity", "title description status expectedCommitment")
        .populate("candidate", "username fullName email avatar headline skills")
        .populate("sender", "username fullName email avatar");

    await createAndEmitNotification({
        recipient: candidateId,
        sender: req.user._id,
        type: "invitation",
        title: "Team Invitation Received",
        message: `${req.user.fullName} (@${req.user.username}) invited you to join "${opportunity.title}" as ${role}`,
        link: `/opportunities?tab=my&opportunityId=${opportunity._id}`
    });

    return res
        .status(201)
        .json(
            new ApiResponse(
                201,
                populatedInvitation,
                "Invitation sent to developer successfully"
            )
        );
});

const respondToApplication = asyncHandler(async (req, res) => {
    const { applicationId } = req.params;
    let { action, status, response } = req.body;
    let resolvedAction = action || status || response;
    if (resolvedAction === "accepted") resolvedAction = "accept";
    if (resolvedAction === "declined" || resolvedAction === "rejected") resolvedAction = "reject";

    if (!mongoose.isValidObjectId(applicationId)) {
        throw new ApiError(400, "Invalid application ID format");
    }

    if (!["accept", "reject", "withdraw"].includes(resolvedAction)) {
        throw new ApiError(
            400,
            "Invalid action. Must be 'accept', 'reject', or 'withdraw'"
        );
    }

    // Ensure downstream logic uses resolved action
    action = resolvedAction;

    const application = await TeamApplication.findById(applicationId).populate(
        "opportunity"
    );

    if (!application) {
        throw new ApiError(404, "Application or invitation not found");
    }

    if (application.status !== "pending") {
        throw new ApiError(
            400,
            `Cannot perform action on an application that is already ${application.status}`
        );
    }

    const opportunity = application.opportunity;
    const isCreator = opportunity.creator.equals(req.user._id);
    const isCandidate = application.candidate.equals(req.user._id);

    // Permission checks based on application type and action
    if (action === "accept" || action === "reject") {
        if (application.type === "join_request" && !isCreator) {
            throw new ApiError(
                403,
                "Only the opportunity creator can accept or reject a join request"
            );
        }
        if (application.type === "invitation" && !isCandidate) {
            throw new ApiError(
                403,
                "Only the invited developer can accept or reject this invitation"
            );
        }
    } else if (action === "withdraw") {
        const isSender = application.sender.equals(req.user._id);
        if (!isSender) {
            throw new ApiError(
                403,
                "Only the sender of the request can withdraw it"
            );
        }
    }

    const newStatus =
        action === "accept"
            ? "accepted"
            : action === "reject"
            ? "rejected"
            : "withdrawn";

    application.status = newStatus;
    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();
    await application.save();

    // AUTO-JOIN HOOK: If accepted, automatically add candidate to workspace
    if (newStatus === "accepted" && opportunity.workspace) {
        const workspace = await Project.findById(opportunity.workspace);
        if (workspace) {
            const alreadyInWorkspace = workspace.members.some((m) =>
                m.user.equals(application.candidate)
            );

            if (!alreadyInWorkspace) {
                workspace.members.push({
                    user: application.candidate,
                    role: "member",
                    joinedAt: new Date()
                });
                await workspace.save();
            }
        }
    }

    const updated = await TeamApplication.findById(application._id)
        .populate("opportunity", "title description workspace status")
        .populate("candidate", "username fullName email avatar headline")
        .populate("sender", "username fullName email avatar")
        .populate("reviewedBy", "username fullName email");

    const notifyRecipient = isCreator ? application.candidate : opportunity.creator;
    const isCandidateBeingNotified = isCreator;
    const targetLink = isCandidateBeingNotified
        ? `/opportunities?tab=applied`
        : `/opportunities?tab=my&opportunityId=${opportunity._id}`;

    await createAndEmitNotification({
        recipient: notifyRecipient,
        sender: req.user._id,
        type: action === "accept" ? "request_accepted" : "request_rejected",
        title: isCandidateBeingNotified
            ? `Application ${action === "accept" ? "Accepted!" : "Not Selected"}`
            : `Invitation ${action === "accept" ? "Accepted" : "Declined"}`,
        message: isCandidateBeingNotified
            ? `Your application for "${application.role || "Team Member"}" on "${opportunity.title}" has been ${newStatus}.`
            : `${req.user.fullName} has ${newStatus} the invitation for "${opportunity.title}"`,
        link: targetLink
    });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                updated,
                `Application ${newStatus} successfully`
            )
        );
});

const getMyApplications = asyncHandler(async (req, res) => {
    const { type, status } = req.query;

    const query = {
        $or: [{ candidate: req.user._id }, { sender: req.user._id }]
    };

    if (type && ["join_request", "invitation"].includes(type)) {
        query.type = type;
    }

    if (
        status &&
        ["pending", "accepted", "rejected", "withdrawn"].includes(status)
    ) {
        query.status = status;
    }

    const applications = await TeamApplication.find(query)
        .populate({
            path: "opportunity",
            select: "title description skillsRequired expectedCommitment status workspace creator",
            populate: [
                { path: "creator", select: "username fullName email avatar headline" },
                { path: "workspace", select: "name description" }
            ]
        })
        .populate("candidate", "username fullName email avatar headline skills")
        .populate("sender", "username fullName email avatar headline")
        .sort({ updatedAt: -1 });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                applications,
                "Applications fetched successfully"
            )
        );
});

const getOpportunityApplications = asyncHandler(async (req, res) => {
    const { opportunityId } = req.params;
    const { status } = req.query;

    if (!mongoose.isValidObjectId(opportunityId)) {
        throw new ApiError(400, "Invalid opportunity ID format");
    }

    const opportunity = await TeamOpportunity.findById(opportunityId);
    if (!opportunity) {
        throw new ApiError(404, "Opportunity not found");
    }

    if (!opportunity.creator.equals(req.user._id)) {
        throw new ApiError(
            403,
            "Only the opportunity creator can view its applications"
        );
    }

    const query = { opportunity: opportunityId };
    if (
        status &&
        ["pending", "accepted", "rejected", "withdrawn"].includes(status)
    ) {
        query.status = status;
    }

    const applications = await TeamApplication.find(query)
        .populate("candidate", "username fullName email avatar headline skills experienceLevel availability portfolioLinks")
        .populate("sender", "username fullName email avatar")
        .sort({ createdAt: -1 });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                applications,
                "Opportunity applications fetched successfully"
            )
        );
});

export {
    applyToOpportunity,
    inviteDeveloper,
    respondToApplication,
    getMyApplications,
    getOpportunityApplications
};
