import mongoose, { Schema } from "mongoose";

const openRoleSchema = new Schema(
    {
        roleTitle: {
            type: String,
            required: [true, "Role title is required"],
            trim: true
        },
        skillsRequired: {
            type: [String],
            default: []
        },
        experienceLevel: {
            type: String,
            enum: ["beginner", "intermediate", "advanced", "expert", "any"],
            default: "any"
        },
        openings: {
            type: Number,
            default: 1,
            min: 1
        }
    },
    { _id: true }
);

const teamOpportunitySchema = new Schema(
    {
        title: {
            type: String,
            required: [true, "Opportunity title is required"],
            trim: true,
            index: true
        },
        description: {
            type: String,
            required: [true, "Opportunity description is required"],
            trim: true
        },
        creator: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        workspace: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            default: null,
            index: true
        },
        openRoles: [openRoleSchema],
        skillsRequired: {
            type: [String],
            default: [],
            index: true
        },
        expectedCommitment: {
            type: Number,
            default: 10,
            min: 1
        },
        status: {
            type: String,
            enum: ["open", "filled", "closed"],
            default: "open",
            index: true
        }
    },
    {
        timestamps: true
    }
);

export const TeamOpportunity = mongoose.model(
    "TeamOpportunity",
    teamOpportunitySchema
);
