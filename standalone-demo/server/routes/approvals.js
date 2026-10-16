import express from 'express';
import crypto from 'crypto';
import { config } from '../config.js';
import { getCollection } from '../db/index.js';
import { generateApproverToken, requireApprover } from '../middleware/auth.js';

const router = express.Router();

/**
 * Constant-time string equality check to prevent timing attacks on credentials.
 */
function safeCompare(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string') return false;
  if (!input || !expected) return false;
  const inputBuf = Buffer.from(input, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (inputBuf.length !== expectedBuf.length) {
    // Perform dummy comparison to prevent timing leak on length
    crypto.timingSafeEqual(inputBuf, inputBuf);
    return false;
  }
  return crypto.timingSafeEqual(inputBuf, expectedBuf);
}

// POST /api/approvals/login — Authenticate Station Duty Approver
router.post('/login', (req, res) => {
  // Fail-closed invariant: Reject authentication if server credentials or signing secret are unconfigured
  if (!config.approverUsername || !config.approverPassword || !config.sessionSecret) {
    return res.status(503).json({
      error: 'Approver authentication is unconfigured in this environment. Required environment variables (APPROVER_USERNAME, APPROVER_PASSWORD, SESSION_SECRET) must be supplied.'
    });
  }

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const isUserValid = safeCompare(username.trim(), config.approverUsername);
  const isPassValid = safeCompare(password, config.approverPassword);

  if (!isUserValid || !isPassValid) {
    return res.status(401).json({ error: 'Invalid approver credentials.' });
  }

  const token = generateApproverToken(config.approverUsername);

  res.json({
    success: true,
    message: 'Station Duty Approver authentication successful.',
    token,
    approver: {
      username: config.approverUsername,
      role: 'x_mtts.approver',
      name: 'Station Duty Approver'
    }
  });
});

// POST /api/approvals/logout — End approver session
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Approver session terminated.' });
});

// GET /api/approvals/me — Retrieve active approver session details
router.get('/me', (req, res) => {
  if (!req.approver) {
    return res.json({ authenticated: false, approver: null });
  }

  res.json({
    authenticated: true,
    approver: {
      username: req.approver.username,
      role: req.approver.role,
      name: req.approver.name
    }
  });
});

// GET /api/approvals/pending — Fetch pending booking requests awaiting review
router.get('/pending', requireApprover, async (req, res, next) => {
  try {
    const bookingsCol = getCollection('bookings');

    // Fetch all bookings that are in 'Pending' lifecycle state
    const pending = await bookingsCol
      .find({
        status: 'Pending',
        approval_status: 'pending'
      })
      .sort({ created_at: 1 }) // First-in, first-out
      .toArray();

    res.json({
      success: true,
      count: pending.length,
      bookings: pending
    });
  } catch (err) {
    next(err);
  }
});

export default router;
