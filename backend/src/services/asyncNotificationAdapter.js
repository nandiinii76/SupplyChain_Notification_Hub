const { enqueueNotification } = require("../queues/notificationQueue");
const { isRedisAvailable } = require("../config/redis");
const { sendShipmentNotificationEmail } = require("./emailService");
const { sendWebhookNotification } = require("./webhookService");
const { publishNotification } = require("./realtimeService");

/**
 * Dispatches notifications asynchronously via BullMQ/Redis queue when available,
 * with seamless fallback to direct dispatch if the queue is unavailable.
 */
const dispatchNotificationAsync = async ({
    createdNotification,
    shipment,
    preferences,
    status,
    title,
    message,
    priority
}) => {
    const redisUp = await isRedisAvailable();

    const emailEligible = Boolean(preferences.email_enabled && shipment.customer_email);
    const webhookEligible = Boolean(preferences.webhook_enabled && preferences.webhook_url);
    const sseEligible = Boolean(preferences.in_app_enabled);

    if (redisUp) {
        try {
            // 1. Enqueue SSE In-App Push
            if (sseEligible) {
                await enqueueNotification({
                    notificationId: createdNotification.id,
                    channel: "IN_APP_SSE",
                    recipient: String(shipment.customer_id),
                    payload: {
                        ...createdNotification,
                        tracking_number: shipment.tracking_number
                    },
                    priority
                });
            }

            // 2. Enqueue Email Delivery
            if (emailEligible) {
                await enqueueNotification({
                    notificationId: createdNotification.id,
                    channel: "EMAIL",
                    recipient: shipment.customer_email,
                    payload: {
                        to: shipment.customer_email,
                        customerName: shipment.customer_name,
                        trackingNumber: shipment.tracking_number,
                        status,
                        title,
                        message,
                        priority
                    },
                    priority
                });
            }

            // 3. Enqueue Webhook Delivery
            if (webhookEligible) {
                await enqueueNotification({
                    notificationId: createdNotification.id,
                    channel: "WEBHOOK",
                    recipient: preferences.webhook_url,
                    payload: {
                        webhookUrl: preferences.webhook_url,
                        webhookSecret: preferences.webhook_secret,
                        notification: createdNotification,
                        customerId: shipment.customer_id,
                        maxAttempts: 3
                    },
                    priority
                });
            }

            return {
                queued: true,
                email_dispatched: emailEligible,
                webhook_dispatched: webhookEligible
            };
        } catch (enqueueError) {
            console.warn(
                "[AsyncNotificationAdapter] Enqueue error, falling back to direct dispatch:",
                enqueueError.message
            );
        }
    }

    // Safe fallback when Redis is offline or enqueue fails: direct dispatch
    try {
        if (sseEligible) {
            publishNotification({
                ...createdNotification,
                tracking_number: shipment.tracking_number
            });
        }
    } catch (e) {
        console.error("[AsyncNotificationAdapter] Fallback SSE push failed:", e.message);
    }

    if (emailEligible) {
        sendShipmentNotificationEmail({
            to: shipment.customer_email,
            customerName: shipment.customer_name,
            trackingNumber: shipment.tracking_number,
            status,
            title,
            message,
            priority
        }).catch((err) => {
            console.error("[AsyncNotificationAdapter] Fallback email error:", err.message);
        });
    }

    if (webhookEligible) {
        sendWebhookNotification({
            webhookUrl: preferences.webhook_url,
            webhookSecret: preferences.webhook_secret,
            notification: createdNotification,
            customerId: shipment.customer_id,
            maxAttempts: 3
        }).catch((err) => {
            console.error("[AsyncNotificationAdapter] Fallback webhook error:", err.message);
        });
    }

    return {
        queued: false,
        email_dispatched: emailEligible,
        webhook_dispatched: webhookEligible
    };
};

module.exports = {
    dispatchNotificationAsync
};
