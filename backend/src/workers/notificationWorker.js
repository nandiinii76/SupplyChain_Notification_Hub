const { Worker } = require("bullmq");
const { connectionOptions } = require("../config/redis");
const { QUEUE_NAME } = require("../queues/notificationQueue");
const { sendShipmentNotificationEmail } = require("../services/emailService");
const { sendWebhookNotification } = require("../services/webhookService");
const { publishNotification } = require("../services/realtimeService");
const pool = require("../config/database");

let worker = null;

const processJob = async (job) => {
    const { notificationId, channel, recipient, payload } = job.data;
    const currentAttempt = job.attemptsMade + 1;

    // 1. Mark state = 'PROCESSING' in PostgreSQL
    try {
        await pool.query(
            `
            UPDATE notification_delivery_jobs
            SET state = 'PROCESSING',
                attempts = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE job_id = $2
            `,
            [currentAttempt, job.id]
        );
    } catch (dbErr) {
        console.error("[NotificationWorker] Failed to update processing state:", dbErr.message);
    }

    try {
        let result = null;

        if (channel === "EMAIL") {
            result = await sendShipmentNotificationEmail(payload);
        } else if (channel === "WEBHOOK") {
            result = await sendWebhookNotification(payload);
        } else if (channel === "IN_APP_SSE") {
            result = publishNotification(payload);
        } else {
            console.warn(`[NotificationWorker] Unknown channel: ${channel}`);
        }

        // 2. Mark state = 'COMPLETED' in PostgreSQL
        try {
            await pool.query(
                `
                UPDATE notification_delivery_jobs
                SET state = 'COMPLETED',
                    updated_at = CURRENT_TIMESTAMP
                WHERE job_id = $1
                `,
                [job.id]
            );
        } catch (dbErr) {
            console.error("[NotificationWorker] Failed to update completed state:", dbErr.message);
        }

        return result;
    } catch (err) {
        console.error(`[NotificationWorker] Job ${job.id} failed on attempt ${currentAttempt}:`, err.message);

        const isExhausted = currentAttempt >= (job.opts?.attempts || 4);
        const nextState = isExhausted ? "EXHAUSTED" : "FAILED";

        try {
            await pool.query(
                `
                UPDATE notification_delivery_jobs
                SET state = $1,
                    last_error = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE job_id = $3
                `,
                [nextState, err.message, job.id]
            );
        } catch (dbErr) {
            console.error("[NotificationWorker] Failed to update failed state:", dbErr.message);
        }

        throw err; // rethrow so BullMQ triggers retry / backoff logic
    }
};

const startNotificationWorker = () => {
    if (worker) {
        return worker;
    }

    worker = new Worker(QUEUE_NAME, processJob, {
        connection: connectionOptions,
        concurrency: 5
    });

    worker.on("completed", (job) => {
        console.log(`[NotificationWorker] Job ${job.id} (${job.name}) completed successfully.`);
    });

    worker.on("failed", (job, err) => {
        console.warn(`[NotificationWorker] Job ${job?.id} (${job?.name}) failed: ${err.message}`);
    });

    worker.on("error", (err) => {
        console.error("[NotificationWorker] Worker error:", err.message);
    });

    console.log("[NotificationWorker] Background notification worker started.");
    return worker;
};

const stopNotificationWorker = async () => {
    if (worker) {
        console.log("[NotificationWorker] Stopping background worker...");
        await worker.close();
        worker = null;
        console.log("[NotificationWorker] Worker stopped.");
    }
};

module.exports = {
    startNotificationWorker,
    stopNotificationWorker
};
