import mongoose, { Schema } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const userSchema = new Schema(
    {
        username: {
            type: String,
            required: [true, "Username is required"],
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true
        },
        fullName: {
            type: String,
            required: [true, "Full name is required"],
            trim: true,
            index: true
        },
        avatar: {
            type: String,
            default: ""
        },
        password: {
            type: String,
            required: [true, "Password is required"]
        },
        refreshToken: {
            type: String,
            default: null
        },
        headline: {
            type: String,
            trim: true,
            default: ""
        },
        bio: {
            type: String,
            trim: true,
            default: ""
        },
        skills: {
            type: [String],
            default: [],
            index: true
        },
        experienceLevel: {
            type: String,
            enum: ["beginner", "intermediate", "advanced", "expert"],
            default: "beginner",
            index: true
        },
        interests: {
            type: [String],
            default: []
        },
        portfolioLinks: {
            github: { type: String, trim: true, default: "" },
            linkedin: { type: String, trim: true, default: "" },
            website: { type: String, trim: true, default: "" }
        },
        availability: {
            status: {
                type: String,
                enum: ["actively_looking", "open_to_offers", "not_available"],
                default: "actively_looking"
            },
            hoursPerWeek: {
                type: Number,
                default: 10
            }
        },
        location: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

// Hash password before saving to the database
userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;

    this.password = await bcrypt.hash(this.password, 10);
});

// Compare incoming plain-text password with stored hash
userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
};

// Generate short-lived JWT Access Token
userSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            username: this.username,
            fullName: this.fullName
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY
        }
    );
};

// Generate longer-lived JWT Refresh Token
userSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        {
            _id: this._id
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY
        }
    );
};

export const User = mongoose.model("User", userSchema);
