import dotenv from "dotenv";
import http from "http";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import { initSocket } from "./socket/index.js";

dotenv.config({
    path: "./.env"
});

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
