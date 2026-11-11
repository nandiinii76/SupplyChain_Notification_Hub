const path = require("path");
require("dotenv").config({
    path: path.join(__dirname, ".env")
});

const app = require("./src/app");
const pool = require("./src/config/database");
const { startDelayDetectionJob, stopDelayDetectionJob } = require("./src/jobs/delayDetectionJob");
const { startNotificationWorker, stopNotificationWorker } = require("./src/workers/notificationWorker");

// ======================================================
// SERVER CONFIGURATION
// ======================================================

const PORT = process.env.PORT || 5000;

// ======================================================
// START SERVER
// ======================================================

const startServer = async () => {

    try {

        // ==================================================
        // TEST DATABASE CONNECTION
        // ==================================================

        await pool.query("SELECT 1");

        console.log("PostgreSQL database connected");
        console.log("Database connection successful");

        // ==================================================
        // START BACKGROUND JOBS & WORKERS
        // ==================================================

        startDelayDetectionJob();
        startNotificationWorker();

        // ==================================================
        // START EXPRESS SERVER
        // ==================================================

        const server = app.listen(PORT, () => {

            console.log("========================================");
            console.log("Supply Chain Notification Hub");
            console.log("========================================");

            console.log(
                `Server running on http://localhost:${PORT}`
            );

            console.log(
                `Environment: ${process.env.NODE_ENV || "development"}`
            );

            console.log("========================================");

        });

        // ==================================================
        // SERVER ERROR
        // ==================================================

        server.on("error", (error) => {

            console.error(
                "Server error:",
                error.message
            );

            process.exit(1);

        });

    } catch (error) {

        console.error(
            "Database connection failed:"
        );

        console.error(
            error.message
        );

        process.exit(1);

    }

};

// ======================================================
// START APPLICATION
// ======================================================

startServer();

// ======================================================
// GRACEFUL SHUTDOWN
// ======================================================

const shutdown = async (signal) => {

    console.log(
        `${signal} received. Shutting down server...`
    );

    try {

        stopDelayDetectionJob();
        await stopNotificationWorker();

        await pool.end();

        console.log(
            "PostgreSQL connection pool closed"
        );

        process.exit(0);

    } catch (error) {

        console.error(
            "Error during shutdown:",
            error.message
        );

        process.exit(1);

    }

};

// ======================================================
// PROCESS SIGNALS
// ======================================================

process.on(
    "SIGINT",
    () => shutdown("SIGINT")
);

process.on(
    "SIGTERM",
    () => shutdown("SIGTERM")
);