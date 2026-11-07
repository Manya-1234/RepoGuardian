import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { TeamOpportunity } from "../models/teamOpportunity.model.js";
import { Project } from "../models/project.model.js";
import { User } from "../models/user.model.js";
import { calculateDeveloperMatch } from "../utils/matchmaking.js";

const createOpportunity = asyncHandler(async (req, res) => {
    const {
        title,
        description,
        workspace,
        openRoles = [],
        skillsRequired = [],
        expectedCommitment = 10
    } = req.body;

    if (!title || title.trim() === "") {
        throw new ApiError(400, "Opportunity title is required");
    }

    if (!description || description.trim() === "") {
        throw new ApiError(400, "Opportunity description is required");
    }

    let linkedWorkspace = null;
    if (workspace) {
        if (!mongoose.isValidObjectId(workspace)) {
            throw new ApiError(400, "Invalid workspace ID format");
        }

        const project = await Project.findById(workspace);
        if (!project) {
            throw new ApiError(404, "Linked workspace not found");
        }

        const isOwner = project.owner.equals(req.user._id);
        const isAdmin = project.members.some(
            (m) => m.user.equals(req.user._id) && m.role === "admin"
        );

        if (!isOwner && !isAdmin) {
            throw new ApiError(
                403,
                "Only workspace owners or admins can link an opportunity to this workspace"
            );
        }

        linkedWorkspace = project._id;
    }

    // Consolidate skills from all openRoles and top-level skillsRequired
    const allSkills = new Set();
    if (Array.isArray(skillsRequired)) {
        skillsRequired.forEach((s) => s && allSkills.add(s.trim()));
    }

    const formattedRoles = (Array.isArray(openRoles) ? openRoles : []).map(
        (role) => {
            const roleSkills = Array.isArray(role.skillsRequired)
                ? role.skillsRequired.map((s) => s.trim()).filter(Boolean)
                : [];
            roleSkills.forEach((s) => allSkills.add(s));

            return {
                roleTitle: role.roleTitle?.trim() || "Team Member",
                skillsRequired: roleSkills,
                experienceLevel: role.experienceLevel || "any",
                openings: Math.max(1, parseInt(role.openings, 10) || 1)
            };
        }
    );

    const opportunity = await TeamOpportunity.create({
        title: title.trim(),
        description: description.trim(),
        creator: req.user._id,
        workspace: linkedWorkspace,
        openRoles: formattedRoles,
        skillsRequired: Array.from(allSkills),
        expectedCommitment: Math.max(1, parseInt(expectedCommitment, 10) || 10),
        status: "open"
    });

    const populatedOpportunity = await TeamOpportunity.findById(opportunity._id)
        .populate("creator", "username fullName email avatar headline skills")
        .populate("workspace", "name description githubRepo");

    return res
        .status(201)
        .json(
            new ApiResponse(
                201,
                populatedOpportunity,
                "Team opportunity created successfully"
            )
        );
});

const getAllOpportunities = asyncHandler(async (req, res) => {
    const {
        search,
        skill,
        status = "open",
        page = 1,
        limit = 12
    } = req.query;

    const query = {};

    if (status && status !== "all") {
        query.status = status;
    }

    if (search && search.trim() !== "") {
        const searchRegex = new RegExp(search.trim(), "i");
        query.$or = [{ title: searchRegex }, { description: searchRegex }];
    }

    if (skill && skill.trim() !== "") {
        const skillsList = skill
            .split(",")
            .map((s) => new RegExp(`^${s.trim()}$`, "i"));
        query.skillsRequired = { $in: skillsList };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    const [opportunities, total] = await Promise.all([
        TeamOpportunity.find(query)
            .populate("creator", "username fullName email avatar headline")
            .populate("workspace", "name description")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        TeamOpportunity.countDocuments(query)
    ]);

    // If request has authenticated user, enrich each opportunity with user's match score
    const results = req.user
        ? opportunities.map((opp) => {
              const match = calculateDeveloperMatch(req.user, opp);
              return {
                  ...opp,
                  matchInfo: {
                      matchScore: match.matchScore,
                      breakdown: match.breakdown,
                      explanations: match.explanations
                  }
              };
          })
        : opportunities;

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                opportunities: results,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    totalPages: Math.ceil(total / limitNum)
                }
            },
            "Opportunities fetched successfully"
        )
    );
});

const getOpportunityById = asyncHandler(async (req, res) => {
    const { opportunityId } = req.params;

    if (!mongoose.isValidObjectId(opportunityId)) {
        throw new ApiError(400, "Invalid opportunity ID format");
    }

    const opportunity = await TeamOpportunity.findById(opportunityId)
        .populate(
            "creator",
            "username fullName email avatar headline skills experienceLevel availability portfolioLinks"
        )
        .populate("workspace", "name description githubRepo members");

    if (!opportunity) {
        throw new ApiError(404, "Opportunity not found");
    }

    const responseData = opportunity.toObject();

    // If caller is authenticated, include personalized match score
    if (req.user) {
        const match = calculateDeveloperMatch(req.user, opportunity);
        responseData.matchInfo = {
            matchScore: match.matchScore,
            breakdown: match.breakdown,
            explanations: match.explanations
        };
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                responseData,
                "Opportunity details fetched successfully"
            )
        );
});

const updateOpportunity = asyncHandler(async (req, res) => {
    const { opportunityId } = req.params;
    const {
        title,
        description,
        openRoles,
        skillsRequired,
        expectedCommitment,
        status
    } = req.body;

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
            "Only the creator can edit this opportunity"
        );
    }

    if (title && title.trim() !== "") {
        opportunity.title = title.trim();
    }

    if (description && description.trim() !== "") {
        opportunity.description = description.trim();
    }

    if (status && ["open", "filled", "closed"].includes(status)) {
        opportunity.status = status;
    }

    if (expectedCommitment !== undefined) {
        opportunity.expectedCommitment = Math.max(
            1,
            parseInt(expectedCommitment, 10) || 10
        );
    }

    if (Array.isArray(openRoles)) {
        opportunity.openRoles = openRoles.map((r) => ({
            roleTitle: r.roleTitle?.trim() || "Team Member",
            skillsRequired: Array.isArray(r.skillsRequired)
                ? r.skillsRequired.map((s) => s.trim()).filter(Boolean)
                : [],
            experienceLevel: r.experienceLevel || "any",
            openings: Math.max(1, parseInt(r.openings, 10) || 1)
        }));
    }

    // Refresh consolidated skills list
    const allSkills = new Set();
    if (Array.isArray(skillsRequired)) {
        skillsRequired.forEach((s) => s && allSkills.add(s.trim()));
    }
    opportunity.openRoles.forEach((r) => {
        (r.skillsRequired || []).forEach((s) => allSkills.add(s));
    });

    if (allSkills.size > 0) {
        opportunity.skillsRequired = Array.from(allSkills);
    }

    await opportunity.save();

    const updated = await TeamOpportunity.findById(opportunityId)
        .populate("creator", "username fullName email avatar headline")
        .populate("workspace", "name description");

    return res
        .status(200)
        .json(
            new ApiResponse(200, updated, "Opportunity updated successfully")
        );
});

const deleteOpportunity = asyncHandler(async (req, res) => {
    const { opportunityId } = req.params;

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
            "Only the creator can delete this opportunity"
        );
    }

    await TeamOpportunity.findByIdAndDelete(opportunityId);

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Opportunity deleted successfully"));
});

const getMyOpportunities = asyncHandler(async (req, res) => {
    const opportunities = await TeamOpportunity.find({ creator: req.user._id })
        .populate("workspace", "name description githubRepo status")
        .sort({ updatedAt: -1 });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                opportunities,
                "Your opportunities fetched successfully"
            )
        );
});

const getRecommendedOpportunitiesForMe = asyncHandler(async (req, res) => {
    // Fetch all open opportunities not created by current user
    const opportunities = await TeamOpportunity.find({
        status: "open",
        creator: { $ne: req.user._id }
    })
        .populate("creator", "username fullName email avatar headline")
        .populate("workspace", "name description")
        .lean();

    // Calculate match scores for all open opportunities
    const rankedOpportunities = opportunities
        .map((opp) => {
            const match = calculateDeveloperMatch(req.user, opp);
            return {
                ...opp,
                matchInfo: {
                    matchScore: match.matchScore,
                    breakdown: match.breakdown,
                    explanations: match.explanations,
                    matchedSkills: match.matchedSkills,
                    missingSkills: match.missingSkills
                }
            };
        })
        .sort((a, b) => b.matchInfo.matchScore - a.matchInfo.matchScore);

    return res.status(200).json(
        new ApiResponse(
            200,
            rankedOpportunities,
            "Recommended opportunities fetched successfully"
        )
    );
});

const getRecommendedDevelopersForOpportunity = asyncHandler(async (req, res) => {
    const { opportunityId } = req.params;

    if (!mongoose.isValidObjectId(opportunityId)) {
        throw new ApiError(400, "Invalid opportunity ID format");
    }

    const opportunity = await TeamOpportunity.findById(opportunityId).populate(
        "workspace",
        "members"
    );

    if (!opportunity) {
        throw new ApiError(404, "Opportunity not found");
    }

    // Verify current user is opportunity creator
    if (!opportunity.creator.equals(req.user._id)) {
        throw new ApiError(
            403,
            "Only the opportunity creator can view candidate recommendations"
        );
    }

    // Exclude creator and existing workspace members from candidate recommendations
    const excludedUserIds = [opportunity.creator];
    if (opportunity.workspace?.members) {
        opportunity.workspace.members.forEach((m) => {
            if (m.user) excludedUserIds.push(m.user);
        });
    }

    const candidates = await User.find({
        _id: { $nin: excludedUserIds },
        "availability.status": { $ne: "not_available" }
    })
        .select("-password -refreshToken")
        .lean();

    const rankedCandidates = candidates
        .map((dev) => {
            const match = calculateDeveloperMatch(dev, opportunity);
            return {
                developer: dev,
                matchInfo: {
                    matchScore: match.matchScore,
                    breakdown: match.breakdown,
                    explanations: match.explanations,
                    matchedSkills: match.matchedSkills,
                    missingSkills: match.missingSkills
                }
            };
        })
        .sort((a, b) => b.matchInfo.matchScore - a.matchInfo.matchScore)
        .slice(0, 20); // Top 20 best candidate recommendations

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                opportunity: {
                    _id: opportunity._id,
                    title: opportunity.title,
                    skillsRequired: opportunity.skillsRequired
                },
                recommendations: rankedCandidates
            },
            "Recommended developers fetched successfully"
        )
    );
});

export {
    createOpportunity,
    getAllOpportunities,
    getOpportunityById,
    updateOpportunity,
    deleteOpportunity,
    getMyOpportunities,
    getRecommendedOpportunitiesForMe,
    getRecommendedDevelopersForOpportunity
};
