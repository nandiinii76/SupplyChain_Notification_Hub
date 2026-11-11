const Redis = require("ioredis");

const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const redisPort = Number(process.env.REDIS_PORT) || 6379;
const redisPassword = process.env.REDIS_PASSWORD || undefined;

const connectionOptions = {
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: true,
    retryStrategy(times) {
        if (times > 10) {
            return null; // Stop retrying if Redis is down
        }
        return Math.min(times * 100, 3000);
    }
};

let redisClient = null;

const getRedisClient = () => {
    if (!redisClient) {
        redisClient = new Redis(connectionOptions);
        redisClient.on("error", (err) => {
            console.error("[Redis] Connection error:", err.message);
        });
        redisClient.on("connect", () => {
            console.log("[Redis] Connected successfully");
        });
    }
    return redisClient;
};

const isRedisAvailable = async () => {
    try {
        const client = getRedisClient();
        if (client.status === "ready" || client.status === "connecting") {
            const pong = await client.ping();
            return pong === "PONG";
        }
        return false;
    } catch (e) {
        return false;
    }
};

module.exports = {
    connectionOptions,
    getRedisClient,
    isRedisAvailable
};
