const express = require("express");
const cors = require("cors");

// ======================================================
// ROUTES
// ======================================================

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const shipmentRoutes = require("./routes/shipmentRoutes");
const customerRoutes = require("./routes/customerRoutes");
const carrierRoutes = require("./routes/carrierRoutes");
const eventRoutes = require("./routes/eventRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const notificationPreferenceRoutes =
    require("./routes/notificationPreferenceRoutes");
const userRoutes = require("./routes/userRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const jobRoutes = require("./routes/jobRoutes");
const filterRoutes = require("./routes/filterRoutes");
const trackingRoutes = require("./routes/trackingRoutes");


// ======================================================
// CREATE EXPRESS APP
// ======================================================

const app = express();


// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors());

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);


// ======================================================
// ROOT ROUTE
// ======================================================

app.get("/", (req, res) => {

    res.status(200).json({
        success: true,
        message: "Supply Chain Notification Hub API",
        status: "running",
        version: "1.0.0",
        timestamp: new Date().toISOString()
    });

});


// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/api/health", (req, res) => {

    res.status(200).json({
        success: true,
        status: "UP",
        service: "Supply Chain Notification Hub",
        timestamp: new Date().toISOString()
    });

});


// ======================================================
// AUTHENTICATION ROUTES
// ======================================================
//
// POST /api/auth/register
// POST /api/auth/login
// GET  /api/auth/me
//
// ======================================================

app.use(
    "/api/auth",
    authRoutes
);


// ======================================================
// SHIPMENT ROUTES
// ======================================================
//
// GET    /api/shipments
// GET    /api/shipments/:id
// GET    /api/shipments/tracking/:trackingNumber
// POST   /api/shipments
// PATCH  /api/shipments/:id
// PATCH  /api/shipments/:id/status
// DELETE /api/shipments/:id
//
// ======================================================

app.use(
    "/api/shipments",
    shipmentRoutes
);


// ======================================================
// CUSTOMER ROUTES
// ======================================================

app.use(
    "/api/customers",
    customerRoutes
);


// ======================================================
// CARRIER ROUTES
// ======================================================

app.use(
    "/api/carriers",
    carrierRoutes
);


// ======================================================
// SHIPMENT EVENT ROUTES
// ======================================================

app.use(
    "/api/events",
    eventRoutes
);


// ======================================================
// NOTIFICATION PREFERENCE ROUTES
// ======================================================
//
// GET /api/notifications/preferences
// PUT /api/notifications/preferences
//
// ======================================================

app.use(
    "/api/notifications/preferences",
    notificationPreferenceRoutes
);


// ======================================================
// NOTIFICATION ROUTES
// ======================================================
//
// GET    /api/notifications
// GET    /api/notifications/unread-count
// GET    /api/notifications/shipment/:shipmentId
// GET    /api/notifications/:id
// PATCH  /api/notifications/:id/read
// PATCH  /api/notifications/read-all
// DELETE /api/notifications/:id
//
// ======================================================

app.use(
    "/api/notifications",
    notificationRoutes
);


// ======================================================
// USER MANAGEMENT ROUTES (ADMIN)
// ======================================================

app.use(
    "/api/users",
    userRoutes
);


// ======================================================
// AUDIT LOG ROUTES (ADMIN)
// ======================================================

app.use(
    "/api/audit-log",
    auditLogRoutes
);

// JOBS (admin/operations trigger endpoints)
app.use(
    "/api/jobs",
    jobRoutes
);


// ======================================================
// SAVED SHIPMENT FILTERS
// ======================================================
//
// GET    /api/filters
// POST   /api/filters
// GET    /api/filters/:id
// PATCH  /api/filters/:id
// DELETE /api/filters/:id
//
// ======================================================

app.use(
    "/api/filters",
    filterRoutes
);


// ======================================================
// DASHBOARD ROUTES
// ======================================================
//
// GET /api/dashboard/summary
// GET /api/dashboard/shipments/status
// GET /api/dashboard/shipments/priority
// GET /api/dashboard/shipments/carriers
// GET /api/dashboard/recent-shipments
//
// ======================================================

app.use(
    "/api/dashboard",
    dashboardRoutes
);


// ======================================================
// REAL-TIME SHIPMENT TRACKING ROUTES (FEATURE B)
// ======================================================

app.use(
    "/api/tracking",
    trackingRoutes
);


// ======================================================
// 404 HANDLER
// ======================================================
//
// IMPORTANT:
// This MUST be after every API route.
//
// ======================================================

app.use((req, res) => {

    res.status(404).json({
        success: false,
        message: "Route not found",
        path: req.originalUrl,
        method: req.method
    });

});


// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================

app.use((err, req, res, next) => {

    console.error(
        "Unhandled error:",
        err
    );

    const statusCode =
        err.status ||
        err.statusCode ||
        500;

    res.status(statusCode).json({

        success: false,

        message:
            err.message ||
            "Internal server error",

        error:
            process.env.NODE_ENV === "development"
                ? err.stack
                : undefined

    });

});


// ======================================================
// EXPORT APP
// ======================================================

module.exports = app;