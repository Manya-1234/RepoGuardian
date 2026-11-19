import { Router } from "express";
import {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    getCurrentUser,
    updateUserProfile,
    getDeveloperProfile,
    getAllDevelopers
} from "../controllers/user.controller.js";
import { verifyJWT, optionalVerifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Public routes
router.route("/register").post(registerUser);
router.route("/login").post(loginUser);
router.route("/refresh-token").post(refreshAccessToken);

// Developer Discovery routes
router.route("/developers").get(optionalVerifyJWT, getAllDevelopers);
router.route("/developers/:userId").get(optionalVerifyJWT, getDeveloperProfile);
router.route("/profile/:identifier").get(optionalVerifyJWT, getDeveloperProfile);

// Secured/protected routes
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/current-user").get(verifyJWT, getCurrentUser);
router.route("/profile").patch(verifyJWT, updateUserProfile);

export default router;

