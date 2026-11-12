import mongoose, { Schema } from "mongoose";

const memberSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        role: {
            type: String,
            enum: ["admin", "member", "viewer"],
            default: "member"
        },
        joinedAt: {
            type: Date,
            default: Date.now
        }
    },
    { _id: false }
);

const projectSchema = new Schema(
    {
        name: {
            type: String,
            required: [true, "Project name is required"],
            trim: true,
            index: true
        },
        description: {
            type: String,
            trim: true,
            default: ""
        },
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        members: [memberSchema],
        githubRepo: {
            url: {
                type: String,
                trim: true,
                default: ""
            },
            owner: {
                type: String,
                trim: true,
                default: ""
            },
            name: {
                type: String,
                trim: true,
                default: ""
            },
            defaultBranch: {
                type: String,
                default: "main"
            },
            language: {
                type: String,
                default: ""
            },
            description: {
                type: String,
                default: ""
            },
            stars: {
                type: Number,
                default: 0
            },
            forks: {
                type: Number,
                default: 0
            },
            openIssues: {
                type: Number,
                default: 0
            },
            isLinked: {
                type: Boolean,
                default: false
            }
        },
        status: {
            type: String,
            enum: ["active", "archived", "completed"],
            default: "active"
        }
    },
    {
        timestamps: true
    }
);

export const Project = mongoose.model("Project", projectSchema);
