const express = require("express");
const router = express.Router();

const {
    getTrackingOverview,
    getShipmentTrackingDetail
} = require("../controllers/trackingController");

const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/authMiddleware");

router.use(authenticateToken);

// GET /api/tracking - Map overview of shipments
router.get(
    "/",
    authorizeRoles("CUSTOMER", "OPERATIONS", "ADMIN"),
    getTrackingOverview
);

// GET /api/tracking/:idOrTracking - Detailed route geometry, coordinates, and event history
router.get(
    "/:idOrTracking",
    authorizeRoles("CUSTOMER", "OPERATIONS", "ADMIN"),
    getShipmentTrackingDetail
);

module.exports = router;
