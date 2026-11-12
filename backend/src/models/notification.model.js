import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema(
    {
        recipient: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Recipient is required"],
            index: true
        },
        sender: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Sender is required"]
        },
        type: {
            type: String,
            enum: [
                "join_request",
                "invitation",
                "request_accepted",
                "request_rejected",
                "workspace_invitation",
                "workspace_invitation_accepted",
                "workspace_invitation_declined",
                "new_message",
                "task_assigned",
                "task_reassigned",
                "task_status_changed"
            ],
            required: true
        },
        title: {
            type: String,
            required: true,
            trim: true
        },
        message: {
            type: String,
            required: true,
            trim: true
        },
        link: {
            type: String,
            default: ""
        },
        isRead: {
            type: Boolean,
            default: false,
            index: true
        }
    },
    {
        timestamps: true
    }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model(
    "Notification",
    notificationSchema
);
