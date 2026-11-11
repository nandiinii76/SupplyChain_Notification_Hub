const express = require('express');
const router = express.Router();

const { triggerDelayDetection, getQueueStatus } = require('../controllers/jobController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

router.use(authenticateToken);

// GET /api/jobs/queue-status
router.get('/queue-status', authorizeRoles('OPERATIONS', 'ADMIN'), getQueueStatus);

// POST /api/jobs/delay-detection
router.post('/delay-detection', authorizeRoles('OPERATIONS', 'ADMIN'), triggerDelayDetection);

module.exports = router;
