import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Notification } from "../models/notification.model.js";

const getMyNotifications = asyncHandler(async (req, res) => {
    const { isRead } = req.query;

    const query = { recipient: req.user._id };

    if (isRead !== undefined) {
        query.isRead = isRead === "true";
    }

    const notifications = await Notification.find(query)
        .populate("sender", "username fullName avatar headline")
        .sort({ createdAt: -1 })
        .limit(50);

    const unreadCount = await Notification.countDocuments({
        recipient: req.user._id,
        isRead: false
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                notifications,
                unreadCount
            },
            "Notifications fetched successfully"
        )
    );
});

const markNotificationAsRead = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;

    if (!mongoose.isValidObjectId(notificationId)) {
        throw new ApiError(400, "Invalid notification ID format");
    }

    const notification = await Notification.findById(notificationId);
    if (!notification) {
        throw new ApiError(404, "Notification not found");
    }

    if (!notification.recipient.equals(req.user._id)) {
        throw new ApiError(
            403,
            "Unauthorized: You cannot modify notifications for other users"
        );
    }

    notification.isRead = true;
    await notification.save();

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                notification,
                "Notification marked as read successfully"
            )
        );
});

const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
    await Notification.updateMany(
        { recipient: req.user._id, isRead: false },
        { $set: { isRead: true } }
    );

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "All notifications marked as read successfully"
            )
        );
});

export {
    getMyNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead
};
