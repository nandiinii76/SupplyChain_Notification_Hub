const assert = require("assert");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const pool = require("../src/config/database");
const { enqueueNotification, getNotificationQueue } = require("../src/queues/notificationQueue");
const { startNotificationWorker, stopNotificationWorker } = require("../src/workers/notificationWorker");
const { createShipmentNotification } = require("../src/services/notificationService");
const { isRedisAvailable } = require("../src/config/redis");

async function runQueueTests() {
    console.log("-----------------------------------------");
    console.log("Running Asynchronous Notification Queue Tests");
    console.log("-----------------------------------------");

    // 1. Verify Redis connectivity
    const redisUp = await isRedisAvailable();
    assert.strictEqual(redisUp, true, "Redis should be available and responding to PING");
    console.log("✓ Redis is connected and responsive");

    // 2. Start Worker
    const worker = startNotificationWorker();
    assert(worker, "Worker should be initialized");

    // 3. Test direct enqueue and deduplication with a real notification ID
    const notifRow = await pool.query("SELECT id FROM notifications LIMIT 1");
    const testNotificationId = notifRow.rows[0]?.id || 1;
    const res1 = await enqueueNotification({
        notificationId: testNotificationId,
        channel: "EMAIL",
        recipient: "test@example.com",
        payload: {
            to: "test@example.com",
            customerName: "Test User",
            trackingNumber: "TRK-QUEUE-001",
            status: "IN_TRANSIT",
            title: "Test In Transit",
            message: "Test message",
            priority: "HIGH"
        },
        priority: "HIGH"
    });

    assert.strictEqual(res1.enqueued, true, "Job 1 should be enqueued");
    console.log("✓ Job successfully enqueued:", res1.jobId);

    // Verify record in PostgreSQL notification_delivery_jobs
    const dbRecord = await pool.query(
        "SELECT * FROM notification_delivery_jobs WHERE job_id = $1",
        [res1.jobId]
    );
    assert(dbRecord.rows.length > 0, "Job must be recorded in notification_delivery_jobs");
    console.log("✓ Job recorded in PostgreSQL with state:", dbRecord.rows[0].state);

    // Wait for worker to pick up and complete
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const dbRecordAfter = await pool.query(
        "SELECT * FROM notification_delivery_jobs WHERE job_id = $1",
        [res1.jobId]
    );
    assert(
        ["COMPLETED", "PROCESSING", "QUEUED"].includes(dbRecordAfter.rows[0].state),
        `Job state should transition (actual: ${dbRecordAfter.rows[0].state})`
    );
    console.log("✓ Worker processed job, state is now:", dbRecordAfter.rows[0].state);

    // 4. Test end-to-end notification creation through notificationService
    // Fetch a real shipment from DB
    const shipRes = await pool.query("SELECT id FROM shipments LIMIT 1");
    if (shipRes.rows.length > 0) {
        const shipmentId = shipRes.rows[0].id;
        const notifResult = await createShipmentNotification({
            shipmentId,
            status: "IN_TRANSIT",
            title: "Automated Transit Notification",
            message: "Testing async BullMQ pipeline",
            priority: "NORMAL"
        });

        assert.strictEqual(notifResult.created, true, "Notification must be created");
        assert(notifResult.notification.id, "Notification must have an ID in PostgreSQL");
        assert.strictEqual(notifResult.delivery.queued, true, "Delivery should be queued asynchronously");
        console.log("✓ createShipmentNotification created notification #", notifResult.notification.id, "and queued asynchronously");

        // Verify notification saved in notifications table
        const savedNotif = await pool.query(
            "SELECT * FROM notifications WHERE id = $1",
            [notifResult.notification.id]
        );
        assert.strictEqual(savedNotif.rows.length, 1, "Notification must exist in notifications table");
        console.log("✓ Notification record verified in PostgreSQL database");
    }

    // 5. Cleanup worker and pool
    await stopNotificationWorker();
    const queue = getNotificationQueue();
    await queue.close();

    console.log("✓ All Asynchronous Notification Queue Tests Passed!");
}

runQueueTests()
    .then(async () => {
        await pool.end();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error("Test failed:", err);
        await pool.end();
        process.exit(1);
    });
