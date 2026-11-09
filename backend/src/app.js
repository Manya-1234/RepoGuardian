import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "./middlewares/error.middleware.js";

// Routes import
import userRouter from "./routes/user.routes.js";
import projectRouter from "./routes/project.routes.js";
import teamOpportunityRouter from "./routes/teamOpportunity.routes.js";
import teamApplicationRouter from "./routes/teamApplication.routes.js";
import chatRouter from "./routes/chat.routes.js";
import notificationRouter from "./routes/notification.routes.js";
import taskRouter from "./routes/task.routes.js";

const app = express();

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}));

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// Routes declaration
app.use("/api/v1/users", userRouter);
app.use("/api/v1/projects", projectRouter);
app.use("/api/v1/opportunities", teamOpportunityRouter);
app.use("/api/v1/applications", teamApplicationRouter);
app.use("/api/v1/chat", chatRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/tasks", taskRouter);

// Global error handling middleware (must be after all routes)
app.use(errorMiddleware);

export { app };
