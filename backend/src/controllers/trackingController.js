const pool = require("../config/database");
const { resolveLocationCoordinates } = require("../services/geocodingService");

/**
 * GET /api/tracking
 * Get tracking summary for map visualization.
 * Respects customer vs staff ownership boundaries.
 */
const getTrackingOverview = async (req, res) => {
    try {
        const isCustomer = req.user.role === "CUSTOMER";
        const customerId = req.user.customer_id;

        if (isCustomer && !customerId) {
            return res.status(200).json({ success: true, data: [] });
        }

        const queryParams = [];
        let whereClause = "WHERE s.is_deleted = FALSE";

        if (isCustomer) {
            queryParams.push(customerId);
            whereClause += ` AND s.customer_id = $${queryParams.length}`;
        }

        const shipmentsResult = await pool.query(
            `
            SELECT
                s.id,
                s.tracking_number,
                s.status,
                s.priority,
                s.origin,
                s.destination,
                s.expected_delivery,
                s.actual_delivery,
                s.created_at,
                c.name AS customer_name,
                ca.name AS carrier_name,
                ca.code AS carrier_code
            FROM shipments s
            JOIN customers c ON s.customer_id = c.id
            JOIN carriers ca ON s.carrier_id = ca.id
            ${whereClause}
            ORDER BY s.updated_at DESC
            LIMIT 100
            `,
            queryParams
        );

        // Fetch latest event location per shipment
        const shipmentIds = shipmentsResult.rows.map((r) => r.id);
        const latestEventsMap = new Map();

        if (shipmentIds.length > 0) {
            const eventsRes = await pool.query(
                `
                SELECT DISTINCT ON (shipment_id)
                    shipment_id,
                    location,
                    status,
                    description,
                    event_time
                FROM shipment_events
                WHERE shipment_id = ANY($1::int[]) AND is_deleted = FALSE
                ORDER BY shipment_id, event_time DESC
                `,
                [shipmentIds]
            );

            for (const ev of eventsRes.rows) {
                latestEventsMap.set(ev.shipment_id, ev);
            }
        }

        const trackingItems = shipmentsResult.rows.map((shipment) => {
            const originGeo = resolveLocationCoordinates(shipment.origin);
            const destinationGeo = resolveLocationCoordinates(shipment.destination);
            const latestEvent = latestEventsMap.get(shipment.id);
            const currentGeo = latestEvent
                ? resolveLocationCoordinates(latestEvent.location)
                : originGeo;

            return {
                id: shipment.id,
                tracking_number: shipment.tracking_number,
                status: shipment.status,
                priority: shipment.priority,
                origin: shipment.origin,
                destination: shipment.destination,
                expected_delivery: shipment.expected_delivery,
                actual_delivery: shipment.actual_delivery,
                customer_name: shipment.customer_name,
                carrier_name: shipment.carrier_name,
                carrier_code: shipment.carrier_code,
                latest_event: latestEvent || null,
                coordinates: {
                    origin: originGeo,
                    destination: destinationGeo,
                    current: currentGeo || originGeo
                }
            };
        });

        return res.status(200).json({
            success: true,
            data: trackingItems
        });
    } catch (err) {
        console.error("[TrackingController] Overview error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve tracking overview",
            error: err.message
        });
    }
};

/**
 * GET /api/tracking/:idOrTracking
 * Get detailed tracking route, timeline, and physical coordinates for a specific shipment.
 */
const getShipmentTrackingDetail = async (req, res) => {
    try {
        const { idOrTracking } = req.params;
        const isCustomer = req.user.role === "CUSTOMER";
        const customerId = req.user.customer_id;

        const isNumeric = /^\d+$/.test(idOrTracking);
        let shipmentQuery;
        let queryParams;

        if (isNumeric) {
            shipmentQuery = "SELECT s.*, c.name AS customer_name, ca.name AS carrier_name, ca.code AS carrier_code FROM shipments s JOIN customers c ON s.customer_id = c.id JOIN carriers ca ON s.carrier_id = ca.id WHERE s.id = $1 AND s.is_deleted = FALSE";
            queryParams = [Number(idOrTracking)];
        } else {
            shipmentQuery = "SELECT s.*, c.name AS customer_name, ca.name AS carrier_name, ca.code AS carrier_code FROM shipments s JOIN customers c ON s.customer_id = c.id JOIN carriers ca ON s.carrier_id = ca.id WHERE s.tracking_number = $1 AND s.is_deleted = FALSE";
            queryParams = [idOrTracking];
        }

        const shipmentRes = await pool.query(shipmentQuery, queryParams);

        if (shipmentRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Shipment not found"
            });
        }

        const shipment = shipmentRes.rows[0];

        // Ownership enforcement
        if (isCustomer && Number(shipment.customer_id) !== Number(customerId)) {
            return res.status(403).json({
                success: false,
                message: "Access denied to shipment tracking details"
            });
        }

        // Fetch events timeline
        const eventsRes = await pool.query(
            `
            SELECT id, status, location, description, event_time, created_at
            FROM shipment_events
            WHERE shipment_id = $1 AND is_deleted = FALSE
            ORDER BY event_time ASC
            `,
            [shipment.id]
        );

        const originGeo = resolveLocationCoordinates(shipment.origin);
        const destGeo = resolveLocationCoordinates(shipment.destination);

        const eventsWithGeo = eventsRes.rows.map((ev) => ({
            ...ev,
            coordinates: resolveLocationCoordinates(ev.location)
        }));

        // Build route coordinate sequence
        const routeWaypoints = [];
        if (originGeo) {
            routeWaypoints.push({
                type: "origin",
                label: shipment.origin,
                lat: originGeo.lat,
                lng: originGeo.lng
            });
        }

        for (const ev of eventsWithGeo) {
            if (ev.coordinates) {
                // Avoid adjacent duplicate points
                const last = routeWaypoints[routeWaypoints.length - 1];
                if (!last || last.lat !== ev.coordinates.lat || last.lng !== ev.coordinates.lng) {
                    routeWaypoints.push({
                        type: "waypoint",
                        label: ev.location,
                        status: ev.status,
                        event_time: ev.event_time,
                        lat: ev.coordinates.lat,
                        lng: ev.coordinates.lng
                    });
                }
            }
        }

        if (destGeo) {
            const last = routeWaypoints[routeWaypoints.length - 1];
            if (!last || last.lat !== destGeo.lat || last.lng !== destGeo.lng) {
                routeWaypoints.push({
                    type: "destination",
                    label: shipment.destination,
                    lat: destGeo.lat,
                    lng: destGeo.lng
                });
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                shipment: {
                    id: shipment.id,
                    tracking_number: shipment.tracking_number,
                    status: shipment.status,
                    priority: shipment.priority,
                    origin: shipment.origin,
                    destination: shipment.destination,
                    expected_delivery: shipment.expected_delivery,
                    actual_delivery: shipment.actual_delivery,
                    customer_name: shipment.customer_name,
                    carrier_name: shipment.carrier_name,
                    carrier_code: shipment.carrier_code,
                    created_at: shipment.created_at,
                    updated_at: shipment.updated_at
                },
                coordinates: {
                    origin: originGeo,
                    destination: destGeo
                },
                route_waypoints: routeWaypoints,
                events: eventsWithGeo
            }
        });
    } catch (err) {
        console.error("[TrackingController] Detail error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve shipment tracking details",
            error: err.message
        });
    }
};

module.exports = {
    getTrackingOverview,
    getShipmentTrackingDetail
};
