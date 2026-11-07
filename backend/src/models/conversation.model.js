import mongoose, { Schema } from "mongoose";

const conversationSchema = new Schema(
    {
        type: {
            type: String,
            enum: ["direct", "workspace"],
            required: [true, "Conversation type is required"]
        },
        // For direct 1-to-1 conversations (both pre-team and between teammates)
        participants: [
            {
                type: Schema.Types.ObjectId,
                ref: "User"
            }
        ],
        // For shared workspace team room (accessible to all members of that project)
        workspace: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            default: null,
            index: true
        },
        lastMessage: {
            type: Schema.Types.ObjectId,
            ref: "Message",
            default: null
        }
    },
    {
        timestamps: true
    }
);

conversationSchema.index({ type: 1, workspace: 1 });
conversationSchema.index({ type: 1, participants: 1 });

export const Conversation = mongoose.model("Conversation", conversationSchema);
