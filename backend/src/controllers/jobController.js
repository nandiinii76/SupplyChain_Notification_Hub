const { runDelayDetectionNow } = require('../jobs/delayDetectionJob');
const { getNotificationQueue } = require('../queues/notificationQueue');
const { isRedisAvailable } = require('../config/redis');
const pool = require('../config/database');

/**
 * GET /api/jobs/queue-status
 * Get status of asynchronous notification queue and workers (OPERATIONS/ADMIN only)
 */
const getQueueStatus = async (req, res) => {
    try {
        const redisActive = await isRedisAvailable();
        let queueMetrics = null;

        if (redisActive) {
            try {
                const queue = getNotificationQueue();
                const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
                queueMetrics = counts;
            } catch (qErr) {
                console.warn('[JobController] Could not fetch queue metrics:', qErr.message);
            }
        }

        const dbStatus = await pool.query(`
            SELECT state, COUNT(*)::int AS count
            FROM notification_delivery_jobs
            GROUP BY state
        `);

        return res.status(200).json({
            success: true,
            data: {
                redis_connected: redisActive,
                queue_metrics: queueMetrics,
                delivery_states: dbStatus.rows
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to fetch queue status', error: err.message });
    }
};

/**
 * POST /api/jobs/delay-detection
 * Trigger an immediate delay detection run (OPERATIONS/ADMIN only)
 */
const triggerDelayDetection = async (req, res) => {
    try {
        // Allow optional dryRun param for testing
        const dryRun = req.body && req.body.dryRun === true;

        const result = await runDelayDetectionNow({ dryRun });

        return res.status(200).json({
            success: true,
            message: 'Delay detection executed',
            data: result
        });
    } catch (err) {
        console.error('[JobController] delay detection trigger failed:', err);
        return res.status(500).json({ success: false, message: 'Failed to run delay detection', error: err.message });
    }
};

module.exports = {
    triggerDelayDetection,
    getQueueStatus
};
