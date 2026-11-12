const EXP_LEVEL_MAP = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
    expert: 4
};

/**
 * Calculates a deterministic, explainable compatibility score (0-100)
 * between a developer and a team opportunity.
 *
 * Weight breakdown:
 * - Skill match: 50%
 * - Experience level: 25%
 * - Availability & commitment: 15%
 * - Interest & domain alignment: 10%
 */
export const calculateDeveloperMatch = (developer, opportunity) => {
    const explanations = [];
    const devSkills = (developer.skills || []).map((s) => s.toLowerCase().trim());
    const oppSkills = (opportunity.skillsRequired || []).map((s) =>
        s.toLowerCase().trim()
    );

    // 1. Skill Match Score (Weight: 50%)
    let skillScore = 100;
    const matchedSkills = [];
    const missingSkills = [];

    if (oppSkills.length > 0) {
        oppSkills.forEach((reqSkill) => {
            if (devSkills.includes(reqSkill)) {
                matchedSkills.push(reqSkill);
            } else {
                missingSkills.push(reqSkill);
            }
        });

        skillScore = Math.round((matchedSkills.length / oppSkills.length) * 100);

        if (matchedSkills.length > 0) {
            explanations.push(
                `Matched ${matchedSkills.length} of ${oppSkills.length} required skills: ${matchedSkills.join(", ")} (${skillScore}% skill match)`
            );
        }

        if (missingSkills.length > 0) {
            explanations.push(`Missing required skills: ${missingSkills.join(", ")}`);
        }
    } else {
        explanations.push("No specific required skills listed for this opportunity");
    }

    // 2. Experience Compatibility Score (Weight: 25%)
    let expScore = 100;
    const devExp = developer.experienceLevel || "beginner";
    const devExpVal = EXP_LEVEL_MAP[devExp] || 1;

    // Check roles to determine target experience required
    const roleReqs = (opportunity.openRoles || [])
        .map((r) => r.experienceLevel)
        .filter((lvl) => lvl && lvl !== "any");

    if (roleReqs.length > 0) {
        // Average the target requirements across open roles
        const reqValues = roleReqs.map((lvl) => EXP_LEVEL_MAP[lvl] || 1);
        const targetExpVal = Math.min(...reqValues);

        const diff = devExpVal - targetExpVal;
        if (diff >= 0) {
            expScore = 100;
            explanations.push(
                `Experience level (${devExp}) meets or exceeds the required level`
            );
        } else if (diff === -1) {
            expScore = 60;
            explanations.push(
                `Experience level (${devExp}) is slightly below the preferred level`
            );
        } else {
            expScore = 25;
            explanations.push(
                `Experience level (${devExp}) is below the required senior level`
            );
        }
    } else {
        explanations.push("Open to all experience levels");
    }

    // 3. Availability & Commitment Score (Weight: 15%)
    const availStatus = developer.availability?.status || "actively_looking";
    const devHours = developer.availability?.hoursPerWeek || 10;
    const oppHours = opportunity.expectedCommitment || 10;

    let statusScore = 100;
    if (availStatus === "open_to_offers") statusScore = 70;
    else if (availStatus === "not_available") statusScore = 10;

    const hoursRatio = Math.min(1, devHours / oppHours);
    const hoursScore = Math.round(hoursRatio * 100);

    const availScore = Math.round(statusScore * 0.5 + hoursScore * 0.5);

    if (devHours >= oppHours) {
        explanations.push(
            `Availability (${devHours} hrs/week) meets expected commitment (${oppHours} hrs/week)`
        );
    } else {
        explanations.push(
            `Available for ${devHours} hrs/week (Opportunity expects ~${oppHours} hrs/week)`
        );
    }

    // 4. Interest & Domain Alignment (Weight: 10%)
    let interestScore = 50;
    const devInterests = (developer.interests || []).map((i) =>
        i.toLowerCase().trim()
    );
    const oppText = `${opportunity.title || ""} ${opportunity.description || ""}`.toLowerCase();

    const matchedInterests = devInterests.filter(
        (interest) => interest.length > 2 && oppText.includes(interest)
    );

    if (matchedInterests.length > 0) {
        interestScore = 100;
        explanations.push(
            `Shared domain interest in: ${matchedInterests.join(", ")}`
        );
    } else if (devInterests.length > 0) {
        interestScore = 60;
    }

    // Weighted Total Score
    const totalScore = Math.round(
        skillScore * 0.5 +
        expScore * 0.25 +
        availScore * 0.15 +
        interestScore * 0.1
    );

    return {
        matchScore: Math.min(100, Math.max(0, totalScore)),
        breakdown: {
            skillScore,
            expScore,
            availScore,
            interestScore
        },
        matchedSkills,
        missingSkills,
        explanations
    };
};
