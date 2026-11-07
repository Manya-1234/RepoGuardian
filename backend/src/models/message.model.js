import mongoose, { Schema } from "mongoose";

const messageSchema = new Schema(
    {
        conversation: {
            type: Schema.Types.ObjectId,
            ref: "Conversation",
            required: [true, "Conversation ID is required"],
            index: true
        },
        sender: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Sender ID is required"],
            index: true
        },
        content: {
            type: String,
            required: [true, "Message content is required"],
            trim: true
        },
        readBy: [
            {
                type: Schema.Types.ObjectId,
                ref: "User"
            }
        ],
        attachments: [
            {
                type: String,
                trim: true
            }
        ]
    },
    {
        timestamps: true
    }
);

messageSchema.index({ conversation: 1, createdAt: 1 });

export const Message = mongoose.model("Message", messageSchema);
