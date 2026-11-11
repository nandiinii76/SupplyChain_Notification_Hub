const { Queue } = require("bullmq");
const { connectionOptions, isRedisAvailable } = require("../config/redis");
const pool = require("../config/database");

const QUEUE_NAME = "notification-dispatch";

let notificationQueue = null;

const getNotificationQueue = () => {
    if (!notificationQueue) {
        notificationQueue = new Queue(QUEUE_NAME, {
            connection: connectionOptions,
            defaultJobOptions: {
                attempts: 4,
                backoff: {
                    type: "exponential",
                    delay: 1000
                },
                removeOnComplete: {
                    count: 1000
                },
                removeOnFail: {
                    count: 2000
                }
            }
        });

        notificationQueue.on("error", (err) => {
            console.error("[NotificationQueue] Queue error:", err.message);
        });
    }
    return notificationQueue;
};

/**
 * Enqueue a notification job with deduplication and state tracking in PostgreSQL.
 */
const enqueueNotification = async ({
    notificationId,
    channel,
    recipient,
    payload,
    priority = "NORMAL"
}) => {
    const queue = getNotificationQueue();

    // Deterministic job ID prevents duplicate dispatch for the same notification + channel
    const deduplicationKey = `notif-${notificationId}-${channel}`;

    // Map priority to BullMQ priority (lower number = higher priority)
    let bullPriority = 3;
    if (priority === "URGENT") bullPriority = 1;
    else if (priority === "HIGH") bullPriority = 2;

    // 1. Record job in PostgreSQL
    let dbJobId = null;
    try {
        const insertRes = await pool.query(
            `
            INSERT INTO notification_delivery_jobs (
                job_id, notification_id, channel, recipient, state, attempts, max_attempts, payload
            )
            VALUES ($1, $2, $3, $4, 'QUEUED', 0, 4, $5)
            ON CONFLICT (job_id) DO UPDATE
            SET updated_at = CURRENT_TIMESTAMP
            RETURNING id
            `,
            [deduplicationKey, notificationId, channel, recipient, JSON.stringify(payload)]
        );
        dbJobId = insertRes.rows[0]?.id;
    } catch (dbErr) {
        console.error("[NotificationQueue] Failed to record job in DB:", dbErr.message);
    }

    // 2. Add to BullMQ queue
    const job = await queue.add(
        channel,
        {
            dbJobId,
            notificationId,
            channel,
            recipient,
            payload,
            priority
        },
        {
            jobId: deduplicationKey,
            priority: bullPriority
        }
    );

    return {
        jobId: job.id,
        dbJobId,
        enqueued: true
    };
};

module.exports = {
    QUEUE_NAME,
    getNotificationQueue,
    enqueueNotification
};
