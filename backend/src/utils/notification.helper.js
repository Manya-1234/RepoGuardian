import { Notification } from "../models/notification.model.js";
import { getIO } from "../socket/index.js";

export const createAndEmitNotification = async ({
    recipient,
    sender,
    type,
    title,
    message,
    link = ""
}) => {
    try {
        const notification = await Notification.create({
            recipient,
            sender,
            type,
            title,
            message,
            link
        });

        const populated = await Notification.findById(notification._id)
            .populate("sender", "username fullName avatar headline");

        try {
            const io = getIO();
            io.to(`user_${recipient}`).emit("new_notification", populated);
        } catch {
            // Non-blocking: continue if socket is not attached in some contexts
        }

        return populated;
    } catch (err) {
        console.error("Error creating notification:", err.message);
    }
};
