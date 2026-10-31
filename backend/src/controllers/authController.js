
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const pool = require("../config/database");

const {
    ACCESS_TOKEN_TTL,
    signAccessToken,
    createSession,
    rotateRefreshToken,
    listSessions,
    revokeSession,
    revokeAllSessions,
    revokeByRefreshToken,
    hashToken
} = require("../services/tokenService");

const {
    sendPasswordResetEmail,
    sendVerificationEmail
} = require("../services/emailService");

const { clearRateLimit } = require("../middleware/rateLimiter");
const { logAuditEvent } = require("../services/auditService");

// ======================================================
// REQUEST IP
// ======================================================

const getRequestIp = (req) => {
    const forwarded = req.headers["x-forwarded-for"];

    if (typeof forwarded === "string" && forwarded.length > 0) {
        return forwarded.split(",")[0].trim();
    }

    return req.ip || (req.socket && req.socket.remoteAddress) || null;
};

// ======================================================
// GENERATE JWT
// ======================================================

const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            customer_id: user.customer_id
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN || "1d"
        }
    );
};

// ======================================================
// REGISTER
// ======================================================

const register = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            role,
            customer_id
        } = req.body || {};

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required"
            });
        }

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid registration details"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Public registration only allows CUSTOMER accounts.
        if (
            role &&
            String(role).trim().toUpperCase() !== "CUSTOMER"
        ) {
            return res.status(403).json({
                success: false,
                message: "Public registration only allows CUSTOMER role"
            });
        }

        const normalizedRole = "CUSTOMER";

        if (!customer_id) {
            return res.status(400).json({
                success: false,
                message: "customer_id is required for CUSTOMER users"
            });
        }

        const existingUser = await pool.query(
            `SELECT id FROM users WHERE email = $1`,
            [normalizedEmail]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "User with this email already exists"
            });
        }

        const customerResult = await pool.query(
            `SELECT id FROM customers WHERE id = $1`,
            [customer_id]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `
            INSERT INTO users (
                name,
                email,
                password_hash,
                role,
                customer_id,
                is_active
            )
            VALUES ($1, $2, $3, $4, $5, TRUE)
            RETURNING
                id,
                name,
                email,
                role,
                customer_id,
                is_active,
                created_at
            `,
            [
                name.trim(),
                normalizedEmail,
                passwordHash,
                normalizedRole,
                customer_id
            ]
        );

        const user = result.rows[0];

        // Send verification email.
        try {
            const rawToken = crypto.randomBytes(32).toString("hex");

            await pool.query(
                `
                UPDATE users
                SET email_verification_token = $1,
                    email_verification_expires =
                        CURRENT_TIMESTAMP + INTERVAL '24 hours',
                    email_verified = FALSE
                WHERE id = $2
                `,
                [hashToken(rawToken), user.id]
            );

            user.email_verified = false;

            await sendVerificationEmail({
                to: user.email,
                name: user.name,
                token: rawToken
            });
        } catch (verificationError) {
            console.error(
                "Verification email failed:",
                verificationError.message
            );
        }

        const token = signAccessToken(user);

        const { refreshToken } = await createSession({
            userId: user.id,
            userAgent: req.headers["user-agent"],
            ipAddress: getRequestIp(req)
        });

        return res.status(201).json({
            success: true,
            message: "User registered successfully. Check your email to verify your address.",
            token,
            refreshToken,
            expiresIn: ACCESS_TOKEN_TTL,
            user
        });

    } catch (error) {
        console.error("Registration error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to register user",
            error: process.env.NODE_ENV === "development"
                ? error.message
                : undefined
        });
    }
};

// ======================================================
// LOGIN
// ======================================================

const login = async (req, res) => {
    try {
        const { email, password } = req.body || {};

        // Validate input.
        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Find user.
        const result = await pool.query(
            `
            SELECT
                id,
                name,
                email,
                password_hash,
                role,
                customer_id,
                is_active,
                created_at
            FROM users
            WHERE email = $1
            `,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const user = result.rows[0];

        // Reject inactive accounts.
        if (user.is_active !== true) {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive. Contact the administrator."
            });
        }

        // Verify password.
        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        // Update last login.
        await pool.query(
            `
            UPDATE users
            SET last_login = CURRENT_TIMESTAMP
            WHERE id = $1
            `,
            [user.id]
        );

        // Generate access token.
        const token = signAccessToken(user);

        // Create refresh session.
        const { refreshToken } = await createSession({
            userId: user.id,
            userAgent: req.headers["user-agent"],
            ipAddress: getRequestIp(req)
        });

        // Clear login rate limit after successful login.
        await clearRateLimit(req, "login");

        // Never return the password hash.
        delete user.password_hash;

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            refreshToken,
            expiresIn: ACCESS_TOKEN_TTL,
            user
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to login",
            error: process.env.NODE_ENV === "development"
                ? error.message
                : undefined
        });
    }
};

// ======================================================
// GET CURRENT USER
// ======================================================

const getMe = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await pool.query(
            `
            SELECT
                u.id,
                u.name,
                u.email,
                u.role,
                u.customer_id,
                u.is_active,
                u.created_at,
                u.updated_at,
                c.name AS customer_name,
                c.company_name AS company_name
            FROM users u
            LEFT JOIN customers c ON u.customer_id = c.id
            WHERE u.id = $1
            `,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error("Error fetching current user:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch current user",
            error: process.env.NODE_ENV === "development"
                ? error.message
                : undefined
        });
    }
};

// ======================================================
// REFRESH ACCESS TOKEN
// ======================================================

const refresh = async (req, res) => {
    try {
        const refreshToken =
            (req.body && req.body.refreshToken) ||
            req.headers["x-refresh-token"];

        const result = await rotateRefreshToken({
            refreshToken,
            userAgent: req.headers["user-agent"],
            ipAddress: getRequestIp(req)
        });

        return res.status(200).json({
            success: true,
            token: result.accessToken,
            refreshToken: result.refreshToken,
            expiresIn: ACCESS_TOKEN_TTL,
            user: result.user
        });

    } catch (error) {
        return res.status(error.statusCode || 401).json({
            success: false,
            message: error.message || "Could not refresh session"
        });
    }
};

// ======================================================
// LOGOUT
// ======================================================

const logout = async (req, res) => {
    try {
        const refreshToken =
            (req.body && req.body.refreshToken) ||
            req.headers["x-refresh-token"];

        await revokeByRefreshToken(refreshToken);

        return res.status(200).json({
            success: true,
            message: "Logged out"
        });

    } catch (error) {
        console.error("Logout error:", error);

        return res.status(200).json({
            success: true,
            message: "Logged out"
        });
    }
};

// ======================================================
// FORGOT PASSWORD
// ======================================================

const forgotPassword = async (req, res) => {
    const genericResponse = {
        success: true,
        message: "If an account exists for that email, a reset link has been sent."
    };

    try {
        const { email } = req.body || {};

        if (!email || typeof email !== "string") {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const userResult = await pool.query(
            `
            SELECT id, name, email, is_active
            FROM users
            WHERE email = $1
            `,
            [normalizedEmail]
        );

        if (
            userResult.rows.length === 0 ||
            userResult.rows[0].is_active === false
        ) {
            return res.status(200).json(genericResponse);
        }

        const user = userResult.rows[0];

        const rawToken = crypto.randomBytes(32).toString("hex");

        const ttlMinutes = Number(
            process.env.PASSWORD_RESET_TTL_MINUTES || 60
        );

        await pool.query(
            `
            UPDATE password_reset_tokens
            SET used_at = CURRENT_TIMESTAMP
            WHERE user_id = $1
              AND used_at IS NULL
            `,
            [user.id]
        );

        await pool.query(
            `
            INSERT INTO password_reset_tokens (
                user_id,
                token,
                expires_at
            )
            VALUES (
                $1,
                $2,
                CURRENT_TIMESTAMP + ($3::int * INTERVAL '1 minute')
            )
            `,
            [user.id, hashToken(rawToken), ttlMinutes]
        );

        await sendPasswordResetEmail({
            to: user.email,
            name: user.name,
            token: rawToken
        });

        return res.status(200).json(genericResponse);

    } catch (error) {
        console.error("Forgot password error:", error);
        return res.status(200).json(genericResponse);
    }
};

// ======================================================
// RESET PASSWORD
// ======================================================

const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body || {};

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                message: "Token and new password are required"
            });
        }

        if (String(password).length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters"
            });
        }

        const tokenResult = await pool.query(
            `
            SELECT
                prt.id,
                prt.user_id,
                prt.expires_at,
                prt.used_at,
                u.email
            FROM password_reset_tokens prt
            JOIN users u ON u.id = prt.user_id
            WHERE prt.token = $1
            `,
            [hashToken(token)]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired reset token"
            });
        }

        const resetToken = tokenResult.rows[0];

        if (
            resetToken.used_at ||
            new Date(resetToken.expires_at) < new Date()
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired reset token"
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            await client.query(
                `
                UPDATE users
                SET password_hash = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                `,
                [passwordHash, resetToken.user_id]
            );

            await client.query(
                `
                UPDATE password_reset_tokens
                SET used_at = CURRENT_TIMESTAMP
                WHERE id = $1
                `,
                [resetToken.id]
            );

            await client.query("COMMIT");

        } catch (txError) {
            await client.query("ROLLBACK");
            throw txError;

        } finally {
            client.release();
        }

        await revokeAllSessions({
            userId: resetToken.user_id
        });

        await logAuditEvent({
            entityType: "USER",
            entityId: resetToken.user_id,
            action: "PASSWORD_RESET",
            changedBy: resetToken.user_id,
            newValue: { email: resetToken.email }
        });

        return res.status(200).json({
            success: true,
            message: "Password updated. Please sign in with your new password."
        });

    } catch (error) {
        console.error("Reset password error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to reset password"
        });
    }
};

// ======================================================
// VERIFY EMAIL
// ======================================================

const verifyEmail = async (req, res) => {
    try {
        const token =
            (req.body && req.body.token) ||
            req.query.token;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: "Verification token is required"
            });
        }

        const result = await pool.query(
            `
            UPDATE users
            SET email_verified = TRUE,
                email_verification_token = NULL,
                email_verification_expires = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE email_verification_token = $1
              AND (
                    email_verification_expires IS NULL
                    OR email_verification_expires > CURRENT_TIMESTAMP
                  )
            RETURNING id, email, email_verified
            `,
            [hashToken(token)]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired verification token"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Email verified successfully",
            data: result.rows[0]
        });

    } catch (error) {
        console.error("Verify email error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to verify email"
        });
    }
};

// ======================================================
// RESEND VERIFICATION EMAIL
// ======================================================

const resendVerification = async (req, res) => {
    try {
        const userResult = await pool.query(
            `
            SELECT id, name, email, email_verified
            FROM users
            WHERE id = $1
            `,
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const user = userResult.rows[0];

        if (user.email_verified) {
            return res.status(200).json({
                success: true,
                message: "Email is already verified"
            });
        }

        const rawToken = crypto.randomBytes(32).toString("hex");

        await pool.query(
            `
            UPDATE users
            SET email_verification_token = $1,
                email_verification_expires =
                    CURRENT_TIMESTAMP + INTERVAL '24 hours'
            WHERE id = $2
            `,
            [hashToken(rawToken), user.id]
        );

        await sendVerificationEmail({
            to: user.email,
            name: user.name,
            token: rawToken
        });

        return res.status(200).json({
            success: true,
            message: "Verification email sent"
        });

    } catch (error) {
        console.error("Resend verification error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to send verification email"
        });
    }
};

// ======================================================
// LIST SESSIONS
// ======================================================

const getSessions = async (req, res) => {
    try {
        const sessions = await listSessions(req.user.id);

        return res.status(200).json({
            success: true,
            count: sessions.length,
            data: sessions
        });

    } catch (error) {
        console.error("List sessions error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load sessions"
        });
    }
};

// ======================================================
// REVOKE ONE SESSION
// ======================================================

const deleteSession = async (req, res) => {
    try {
        const revoked = await revokeSession({
            sessionId: req.params.id,
            userId: req.user.id
        });

        if (!revoked) {
            return res.status(404).json({
                success: false,
                message: "Session not found or already revoked"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Session revoked"
        });

    } catch (error) {
        console.error("Revoke session error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to revoke session"
        });
    }
};

// ======================================================
// REVOKE ALL OTHER SESSIONS
// ======================================================

const deleteAllSessions = async (req, res) => {
    try {
        const keepToken =
            (req.body && req.body.refreshToken) ||
            req.headers["x-refresh-token"] ||
            null;

        const count = await revokeAllSessions({
            userId: req.user.id,
            exceptRefreshToken: keepToken
        });

        return res.status(200).json({
            success: true,
            message: `${count} session(s) revoked`,
            revoked_count: count
        });

    } catch (error) {
        console.error("Revoke all sessions error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to revoke sessions"
        });
    }
};

// ======================================================
// EXPORT
// ======================================================

module.exports = {
    register,
    login,
    getMe,
    refresh,
    logout,
    forgotPassword,
    resetPassword,
    verifyEmail,
    resendVerification,
    getSessions,
    deleteSession,
    deleteAllSessions
};
