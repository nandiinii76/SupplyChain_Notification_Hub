const assert = require("assert");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const app = require("../src/app");
const pool = require("../src/config/database");

async function runAllNotificationTests() {
    console.log("=========================================");
    console.log("Testing All Existing & New Notification APIs");
    console.log("=========================================");

    const server = app.listen(5002);

    try {
        // 1. Login as Admin
        const adminLoginRes = await fetch("http://localhost:5002/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "admin@supplychain.local", password: "Admin123!" })
        });
        const adminAuth = await adminLoginRes.json();
        assert.strictEqual(adminLoginRes.status, 200, "Admin login should succeed");
        const adminToken = adminAuth.token;
        console.log("✓ Admin login successful");

        // 2. Login as Customer
        const customerLoginRes = await fetch("http://localhost:5002/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "buyer@acme.example", password: "Customer123!" })
        });
        const customerAuth = await customerLoginRes.json();
        assert.strictEqual(customerLoginRes.status, 200, "Customer login should succeed");
        const customerToken = customerAuth.token;
        console.log("✓ Customer login successful");

        // 3. GET /api/notifications (Customer)
        const notifRes = await fetch("http://localhost:5002/api/notifications", {
            headers: { Authorization: `Bearer ${customerToken}` }
        });
        assert.strictEqual(notifRes.status, 200, "GET /api/notifications should return 200");
        const notifData = await notifRes.json();
        assert(Array.isArray(notifData.data), "Notifications data should be an array");
        console.log(`✓ Customer retrieved ${notifData.data.length} notifications`);

        // 4. GET /api/notifications/unread-count
        const unreadRes = await fetch("http://localhost:5002/api/notifications/unread-count", {
            headers: { Authorization: `Bearer ${customerToken}` }
        });
        assert.strictEqual(unreadRes.status, 200);
        const unreadData = await unreadRes.json();
        const count = unreadData.unread_count !== undefined ? unreadData.unread_count : unreadData.unreadCount;
        assert(typeof count === "number", "unread_count should be a number");
        console.log(`✓ Unread count verified: ${count}`);

        // 5. GET notification preferences
        const prefRes = await fetch("http://localhost:5002/api/notifications/preferences", {
            headers: { Authorization: `Bearer ${customerToken}` }
        });
        assert.strictEqual(prefRes.status, 200);
        console.log("✓ Customer notification preferences fetched");

        // 6. Test GET /api/jobs/queue-status (Admin only)
        const queueStatusRes = await fetch("http://localhost:5002/api/jobs/queue-status", {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert.strictEqual(queueStatusRes.status, 200);
        const queueStatusData = await queueStatusRes.json();
        assert.strictEqual(queueStatusData.data.redis_connected, true);
        console.log("✓ Asynchronous queue status verified:", JSON.stringify(queueStatusData.data));

        // 7. Test Customer forbidden from queue-status
        const forbiddenRes = await fetch("http://localhost:5002/api/jobs/queue-status", {
            headers: { Authorization: `Bearer ${customerToken}` }
        });
        assert.strictEqual(forbiddenRes.status, 403, "Customer should be forbidden from /api/jobs/queue-status");
        console.log("✓ Role permission enforcement verified for queue endpoints");

        console.log("=========================================");
        console.log("✓ All Notification Regression Tests Passed!");
        console.log("=========================================");
    } finally {
        server.close();
    }
}

runAllNotificationTests()
    .then(async () => {
        await pool.end();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error("Test failed:", err);
        await pool.end();
        process.exit(1);
    });
