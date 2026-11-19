import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";

export const verifyJWT = asyncHandler(async (req, _, next) => {
    try {
        const authHeader = req.header("Authorization");
        const headerToken = authHeader?.startsWith("Bearer ")
            ? authHeader.substring(7).trim()
            : authHeader?.trim();

        const token = req.cookies?.accessToken || headerToken;

        if (!token) {
            throw new ApiError(401, "Unauthorized request: No token provided");
        }

        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        const user = await User.findById(decodedToken?._id).select(
            "-password -refreshToken"
        );

        if (!user) {
            throw new ApiError(401, "Invalid Access Token: User does not exist");
        }

        req.user = user;
        next();
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid Access Token");
    }
});

export const optionalVerifyJWT = asyncHandler(async (req, _, next) => {
    try {
        const authHeader = req.header("Authorization");
        const headerToken = authHeader?.startsWith("Bearer ")
            ? authHeader.substring(7).trim()
            : authHeader?.trim();

        const token = req.cookies?.accessToken || headerToken;

        if (!token) {
            return next();
        }

        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await User.findById(decodedToken?._id).select(
            "-password -refreshToken"
        );

        if (user) {
            req.user = user;
        }

        next();
    } catch {
        // If token is invalid or expired, continue as unauthenticated guest
        next();
    }
});

