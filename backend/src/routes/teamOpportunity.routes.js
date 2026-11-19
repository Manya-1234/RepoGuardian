import { Router } from "express";
import {
    createOpportunity,
    getAllOpportunities,
    getOpportunityById,
    updateOpportunity,
    deleteOpportunity,
    getMyOpportunities,
    getRecommendedOpportunitiesForMe,
    getRecommendedDevelopersForOpportunity
} from "../controllers/teamOpportunity.controller.js";
import { verifyJWT, optionalVerifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Recommendation and listing routes
router.route("/my").get(verifyJWT, getMyOpportunities);
router
    .route("/recommended/for-me")
    .get(verifyJWT, getRecommendedOpportunitiesForMe);

// General opportunity CRUD
router
    .route("/")
    .post(verifyJWT, createOpportunity)
    .get(optionalVerifyJWT, getAllOpportunities);

router
    .route("/:opportunityId")
    .get(optionalVerifyJWT, getOpportunityById)
    .patch(verifyJWT, updateOpportunity)
    .delete(verifyJWT, deleteOpportunity);

router
    .route("/:opportunityId/recommended-developers")
    .get(verifyJWT, getRecommendedDevelopersForOpportunity);

export default router;
