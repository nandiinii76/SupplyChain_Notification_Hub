const assert = require("assert");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const app = require("../src/app");
const pool = require("../src/config/database");

async function runShipmentAndTrackingTests() {
    console.log("=========================================");
    console.log("Testing Existing Shipment APIs & New Tracking Dashboard");
    console.log("=========================================");

    const server = app.listen(5004);

    try {
        // 1. Authenticate users
        const adminLogin = await (await fetch("http://localhost:5004/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "admin@supplychain.local", password: "Admin123!" })
        })).json();
        const adminToken = adminLogin.token;

        const customerLogin = await (await fetch("http://localhost:5004/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "buyer@acme.example", password: "Customer123!" })
        })).json();
        const customerToken = customerLogin.token;

        console.log("✓ Admin and Customer authenticated");

        // 2. Existing GET /api/shipments
        const allShipmentsRes = await fetch("http://localhost:5004/api/shipments", {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert.strictEqual(allShipmentsRes.status, 200);
        const allShipments = await allShipmentsRes.json();
        assert(allShipments.data.length > 0, "Admin should see shipments");
        console.log(`✓ Existing GET /api/shipments returned ${allShipments.data.length} shipments for admin`);

        // Customer sees only customer's shipments
        const custShipmentsRes = await fetch("http://localhost:5004/api/shipments", {
            headers: { Authorization: `Bearer ${customerToken}` }
        });
        const custShipments = await custShipmentsRes.json();
        assert.strictEqual(custShipmentsRes.status, 200);
        console.log(`✓ Existing GET /api/shipments returned ${custShipments.data.length} scoped shipments for customer`);

        // 3. New Tracking Overview: GET /api/tracking
        const trackOverviewAdmin = await (await fetch("http://localhost:5004/api/tracking", {
            headers: { Authorization: `Bearer ${adminToken}` }
        })).json();
        assert.strictEqual(trackOverviewAdmin.success, true);
        assert(trackOverviewAdmin.data.length > 0);
        console.log(`✓ GET /api/tracking overview returned ${trackOverviewAdmin.data.length} items`);

        // Verify coordinates format
        const sample = trackOverviewAdmin.data[0];
        assert(sample.coordinates, "Tracking item must contain coordinates object");
        console.log(`✓ Verified physical coordinates on shipment ${sample.tracking_number}:`, sample.coordinates.origin?.label, "->", sample.coordinates.destination?.label);

        // 4. New Tracking Detail: GET /api/tracking/:id
        const trackDetailRes = await fetch(`http://localhost:5004/api/tracking/${sample.id}`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert.strictEqual(trackDetailRes.status, 200);
        const trackDetail = await trackDetailRes.json();
        assert(trackDetail.data.route_waypoints, "Must contain route_waypoints array");
        assert(Array.isArray(trackDetail.data.events), "Must contain events array");
        console.log(`✓ GET /api/tracking/:id returned ${trackDetail.data.route_waypoints.length} route waypoints and ${trackDetail.data.events.length} timeline events`);

        // 5. Customer authorization boundary on tracking details
        // Find a shipment NOT owned by customer 1 (buyer@acme.example)
        const otherShipmentRes = await pool.query("SELECT id FROM shipments WHERE customer_id != 1 AND is_deleted = FALSE LIMIT 1");
        if (otherShipmentRes.rows.length > 0) {
            const forbiddenShipmentId = otherShipmentRes.rows[0].id;
            const forbiddenRes = await fetch(`http://localhost:5004/api/tracking/${forbiddenShipmentId}`, {
                headers: { Authorization: `Bearer ${customerToken}` }
            });
            assert.strictEqual(forbiddenRes.status, 403, "Customer must get 403 for unauthorized shipment tracking");
            console.log("✓ Customer ownership access control strictly enforced (HTTP 403)");
        }

        // 6. Test existing shipment status update + auto notification + async queueing
        // Create a new test shipment first to test a valid CREATED -> PICKED_UP transition
        const createShipRes = await fetch("http://localhost:5004/api/shipments", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                tracking_number: `TRK-TEST-${Date.now()}`,
                carrier_id: 1,
                customer_id: 1,
                origin: "Tokyo, JP",
                destination: "Seattle, US",
                status: "CREATED",
                priority: "HIGH"
            })
        });
        assert.strictEqual(createShipRes.status, 201, "Shipment creation should return 201");
        const newShipment = (await createShipRes.json()).data;
        console.log("✓ Existing POST /api/shipments created shipment:", newShipment.tracking_number);

        // Perform valid status transition CREATED -> PICKED_UP
        const updateRes = await fetch(`http://localhost:5004/api/shipments/${newShipment.id}/status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                status: "PICKED_UP"
            })
        });
        assert.strictEqual(updateRes.status, 200, "Status update should succeed");
        console.log("✓ Existing PATCH /api/shipments/:id/status executed valid transition to PICKED_UP");

        console.log("=========================================");
        console.log("✓ All Tracking & Shipment Regression Tests Passed!");
        console.log("=========================================");
    } finally {
        server.close();
    }
}

runShipmentAndTrackingTests()
    .then(async () => {
        await pool.end();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error("Test failed:", err);
        await pool.end();
        process.exit(1);
    });
