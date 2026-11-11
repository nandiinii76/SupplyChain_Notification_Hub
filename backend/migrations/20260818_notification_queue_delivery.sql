-- Asynchronous notification delivery jobs and queue audit tracking
CREATE TABLE IF NOT EXISTS notification_delivery_jobs (
    id                  SERIAL PRIMARY KEY,
    job_id              VARCHAR(150) UNIQUE,
    notification_id     INTEGER REFERENCES notifications(id) ON DELETE CASCADE,
    channel             VARCHAR(50) NOT NULL,
    recipient           VARCHAR(255),
    state               VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
    attempts            INTEGER NOT NULL DEFAULT 0,
    max_attempts        INTEGER NOT NULL DEFAULT 5,
    last_error          TEXT,
    payload             JSONB,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notif_jobs_state ON notification_delivery_jobs(state);
CREATE INDEX IF NOT EXISTS idx_notif_jobs_notification_id ON notification_delivery_jobs(notification_id);
