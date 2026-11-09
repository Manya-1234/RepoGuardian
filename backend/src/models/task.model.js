import mongoose, { Schema } from "mongoose";

const taskSchema = new Schema(
    {
        title: {
            type: String,
            required: [true, "Task title is required"],
            trim: true,
            index: true
        },
        description: {
            type: String,
            trim: true,
            default: ""
        },
        project: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: [true, "Project workspace reference is required"],
            index: true
        },
        assignedTo: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        status: {
            type: String,
            enum: ["todo", "in_progress", "in_review", "done"],
            default: "todo",
            index: true
        },
        priority: {
            type: String,
            enum: ["low", "medium", "high", "urgent"],
            default: "medium",
            index: true
        },
        dueDate: {
            type: Date,
            default: null
        },
        tags: [
            {
                type: String,
                trim: true
            }
        ],
        github: {
            branch: {
                type: String,
                trim: true,
                default: ""
            },
            prUrl: {
                type: String,
                trim: true,
                default: ""
            },
            issueNumber: {
                type: Number,
                default: null
            }
        }
    },
    {
        timestamps: true
    }
);

taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ project: 1, assignedTo: 1 });

export const Task = mongoose.model("Task", taskSchema);
