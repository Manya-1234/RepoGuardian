import { Router } from "express";
import {
    applyToOpportunity,
    inviteDeveloper,
    respondToApplication,
    getMyApplications,
    getOpportunityApplications
} from "../controllers/teamApplication.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Protect all application routes with JWT verification
router.use(verifyJWT);

// User's own applications and invitations
router.route("/my").get(getMyApplications);
router.route("/my-applications").get(getMyApplications);

// Apply to an opportunity (join request) or invite a developer
router.route("/").post(applyToOpportunity);
router.route("/opportunities/:opportunityId/apply").post(applyToOpportunity);
router.route("/opportunities/:opportunityId/invite").post(inviteDeveloper);

// Creator viewing applications for a specific opportunity
router
    .route("/opportunities/:opportunityId")
    .get(getOpportunityApplications);
router
    .route("/opportunity/:opportunityId")
    .get(getOpportunityApplications);

// Accept, reject, or withdraw an application/invitation
router.route("/:applicationId/respond").patch(respondToApplication);

export default router;
