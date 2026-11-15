import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import http from "http";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import { initSocket } from "./socket/index.js";

// Resilient .env loader supporting both root and backend directory working directories
const envPath = fs.existsSync("./backend/.env")
    ? "./backend/.env"
    : fs.existsSync("./.env")
    ? "./.env"
    : path.resolve(process.cwd(), ".env");

dotenv.config({ path: envPath });

const server = http.createServer(app);

// Initialize Socket.IO with the HTTP server
initSocket(server);

connectDB()
    .then(() => {
        const PORT = process.env.PORT || 8000;
        server.listen(PORT, () => {
            console.log(`Server is running at PORT : ${PORT}`);
        });
    })
    .catch((err) => {
        console.log("MONGODB connection failed!!! ", err);
    });
