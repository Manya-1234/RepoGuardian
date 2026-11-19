import mongoose, { Schema } from "mongoose";

const teamApplicationSchema = new Schema(
    {
        opportunity: {
            type: Schema.Types.ObjectId,
            ref: "TeamOpportunity",
            required: [true, "Opportunity reference is required"],
            index: true
        },
        candidate: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Candidate reference is required"],
            index: true
        },
        sender: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Sender reference is required"],
            index: true
        },
        type: {
            type: String,
            enum: ["join_request", "invitation"],
            required: [true, "Application type is required"]
        },
        role: {
            type: String,
            trim: true,
            default: "Team Member"
        },
        message: {
            type: String,
            trim: true,
            default: ""
        },
        status: {
            type: String,
            enum: ["pending", "accepted", "rejected", "withdrawn"],
            default: "pending",
            index: true
        },
        reviewedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        reviewedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Compound index to help query active applications for a candidate & opportunity
teamApplicationSchema.index(
    { opportunity: 1, candidate: 1, status: 1 },
    { background: true }
);

export const TeamApplication = mongoose.model(
    "TeamApplication",
    teamApplicationSchema
);
