import mongoose, { Schema } from "mongoose";

const workspaceInvitationSchema = new Schema(
    {
        workspace: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: [true, "Workspace reference is required"],
            index: true
        },
        inviter: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Inviter reference is required"],
            index: true
        },
        invitee: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Invitee reference is required"],
            index: true
        },
        role: {
            type: String,
            enum: ["admin", "member", "viewer"],
            default: "member"
        },
        message: {
            type: String,
            trim: true,
            default: ""
        },
        status: {
            type: String,
            enum: ["pending", "accepted", "declined", "withdrawn"],
            default: "pending",
            index: true
        },
        respondedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

workspaceInvitationSchema.index(
    { workspace: 1, invitee: 1, status: 1 },
    { background: true }
);

export const WorkspaceInvitation = mongoose.model(
    "WorkspaceInvitation",
    workspaceInvitationSchema
);
