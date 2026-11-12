import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production"
};

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new ApiError(404, "User not found to generate tokens");
        }

        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(
            500,
            error.message || "Failed to generate access and refresh tokens"
        );
    }
};

const registerUser = asyncHandler(async (req, res) => {
    const { fullName, email, username, password, avatar } = req.body;

    if (
        [fullName, email, username, password].some(
            (field) => !field || field.trim() === ""
        )
    ) {
        throw new ApiError(400, "All fields (fullName, email, username, password) are required");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new ApiError(400, "Invalid email address format");
    }

    const existedUser = await User.findOne({
        $or: [
            { username: username.toLowerCase().trim() },
            { email: email.toLowerCase().trim() }
        ]
    });

    if (existedUser) {
        throw new ApiError(409, "User with this username or email already exists");
    }

    const user = await User.create({
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        username: username.toLowerCase().trim(),
        password,
        avatar: avatar?.trim() || ""
    });

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user");
    }

    return res
        .status(201)
        .json(new ApiResponse(201, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
    const { username, email, password } = req.body;

    if (!username && !email) {
        throw new ApiError(400, "Username or email is required");
    }

    if (!password) {
        throw new ApiError(400, "Password is required");
    }

    const searchCriteria =
        username && email
            ? {
                  $or: [
                      { username: username.toLowerCase().trim() },
                      { email: email.toLowerCase().trim() }
                  ]
              }
            : username
            ? { username: username.toLowerCase().trim() }
            : { email: email.toLowerCase().trim() };

    const user = await User.findOne(searchCriteria);

    if (!user) {
        throw new ApiError(404, "User does not exist");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
        user._id
    );

    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    return res
        .status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .cookie("refreshToken", refreshToken, cookieOptions)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                    refreshToken
                },
                "User logged in successfully"
            )
        );
});

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: { refreshToken: 1 }
        },
        {
            new: true
        }
    );

    return res
        .status(200)
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", cookieOptions)
        .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken =
        req.cookies?.refreshToken || req.body?.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request: No refresh token provided");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        const user = await User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(401, "Invalid refresh token: User not found");
        }

        if (incomingRefreshToken !== user.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or has already been used");
        }

        const { accessToken, refreshToken: newRefreshToken } =
            await generateAccessAndRefreshTokens(user._id);

        return res
            .status(200)
            .cookie("accessToken", accessToken, cookieOptions)
            .cookie("refreshToken", newRefreshToken, cookieOptions)
            .json(
                new ApiResponse(
                    200,
                    {
                        accessToken,
                        refreshToken: newRefreshToken
                    },
                    "Access token refreshed successfully"
                )
            );
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token");
    }
});

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const updateUserProfile = asyncHandler(async (req, res) => {
    const {
        headline,
        bio,
        skills,
        experienceLevel,
        interests,
        portfolioLinks,
        availability,
        location,
        avatar,
        fullName
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    if (fullName && fullName.trim() !== "") {
        user.fullName = fullName.trim();
    }

    if (avatar !== undefined) {
        user.avatar = avatar.trim();
    }

    if (headline !== undefined) {
        user.headline = headline.trim();
    }

    if (bio !== undefined) {
        user.bio = bio.trim();
    }

    if (location !== undefined) {
        user.location = location.trim();
    }

    if (skills !== undefined) {
        if (Array.isArray(skills)) {
            user.skills = skills.map((s) => s.trim()).filter((s) => s.length > 0);
        } else if (typeof skills === "string") {
            user.skills = skills.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
        }
    }

    if (experienceLevel !== undefined) {
        if (!["beginner", "intermediate", "advanced", "expert"].includes(experienceLevel)) {
            throw new ApiError(400, "Invalid experience level. Must be beginner, intermediate, advanced, or expert");
        }
        user.experienceLevel = experienceLevel;
    }

    if (interests !== undefined) {
        if (Array.isArray(interests)) {
            user.interests = interests.map((i) => i.trim()).filter((i) => i.length > 0);
        } else if (typeof interests === "string") {
            user.interests = interests.split(",").map((i) => i.trim()).filter((i) => i.length > 0);
        }
    }

    if (portfolioLinks !== undefined && typeof portfolioLinks === "object") {
        user.portfolioLinks = {
            github: portfolioLinks.github !== undefined ? portfolioLinks.github.trim() : (user.portfolioLinks?.github || ""),
            linkedin: portfolioLinks.linkedin !== undefined ? portfolioLinks.linkedin.trim() : (user.portfolioLinks?.linkedin || ""),
            website: portfolioLinks.website !== undefined ? portfolioLinks.website.trim() : (user.portfolioLinks?.website || "")
        };
    }

    if (availability !== undefined) {
        if (typeof availability === "string") {
            const mappedStatus =
                availability === "available" ? "actively_looking" :
                availability === "busy" ? "open_to_offers" :
                availability === "not_available" ? "not_available" :
                ["actively_looking", "open_to_offers", "not_available"].includes(availability) ? availability : "actively_looking";
            user.availability = {
                status: mappedStatus,
                hoursPerWeek: user.availability?.hoursPerWeek || 10
            };
        } else if (typeof availability === "object" && availability !== null) {
            const validStatuses = ["actively_looking", "open_to_offers", "not_available"];
            let st = availability.status;
            if (st === "available") st = "actively_looking";
            if (st === "busy") st = "open_to_offers";
            user.availability = {
                status: (st && validStatuses.includes(st)) ? st : (user.availability?.status || "actively_looking"),
                hoursPerWeek: availability.hoursPerWeek !== undefined ? Number(availability.hoursPerWeek) : (user.availability?.hoursPerWeek || 10)
            };
        }
    }

    await user.save({ validateBeforeSave: false });

    const updatedUser = await User.findById(user._id).select("-password -refreshToken");

    return res
        .status(200)
        .json(new ApiResponse(200, updatedUser, "Developer profile updated successfully"));
});

const getDeveloperProfile = asyncHandler(async (req, res) => {
    const { userId, identifier } = req.params;
    const target = identifier || userId;

    if (!target) {
        throw new ApiError(400, "User identifier or ID is required");
    }

    let query = {};
    if (mongoose.isValidObjectId(target)) {
        query = {
            $or: [
                { _id: target },
                { username: target.toLowerCase().trim() }
            ]
        };
    } else {
        query = { username: target.toLowerCase().trim() };
    }

    const developer = await User.findOne(query).select("-password -refreshToken");

    if (!developer) {
        throw new ApiError(404, "Developer not found");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, developer, "Developer profile fetched successfully"));
});

const getAllDevelopers = asyncHandler(async (req, res) => {
    const { search, skill, experienceLevel, availability, page = 1, limit = 12 } = req.query;

    const query = {};

    // Exclude current user from results if authenticated
    if (req.user?._id) {
        query._id = { $ne: req.user._id };
    }

    // Keyword search across fullName, username, headline, and skills
    if (search && search.trim() !== "") {
        const searchRegex = new RegExp(search.trim(), "i");
        query.$or = [
            { fullName: searchRegex },
            { username: searchRegex },
            { headline: searchRegex },
            { skills: searchRegex }
        ];
    }

    // Filter by skill
    if (skill && skill.trim() !== "") {
        const skillsList = skill.split(",").map((s) => new RegExp(`^${s.trim()}$`, "i"));
        query.skills = { $in: skillsList };
    }

    // Filter by experience level
    if (experienceLevel && experienceLevel.trim() !== "") {
        query.experienceLevel = experienceLevel.trim();
    }

    // Filter by availability status
    if (availability && availability.trim() !== "") {
        query["availability.status"] = availability.trim();
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    const [developers, total] = await Promise.all([
        User.find(query)
            .select("-password -refreshToken")
            .sort({ "availability.status": 1, updatedAt: -1 })
            .skip(skip)
            .limit(limitNum),
        User.countDocuments(query)
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                developers,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    totalPages: Math.ceil(total / limitNum)
                }
            },
            "Developers fetched successfully"
        )
    );
});

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    getCurrentUser,
    updateUserProfile,
    getDeveloperProfile,
    getAllDevelopers
};
