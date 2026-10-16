import crypto from 'crypto';
import { config } from '../config.js';

/**
 * Generate a cryptographically signed HMAC-SHA256 session token for Station Duty Approvers.
 */
export function generateApproverToken(username) {
  if (!config.sessionSecret) {
    throw new Error('[FATAL] Cannot generate approver token: SESSION_SECRET is not configured.');
  }

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    username,
    role: 'x_mtts.approver',
    name: 'Station Duty Approver',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (12 * 3600) // 12 hours
  })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Verify and parse an approver token in constant time.
 */
export function verifyApproverToken(token) {
  if (!config.sessionSecret) return null;
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (data.exp && data.exp < now) {
      return null;
    }
    return data;
  } catch (err) {
    return null;
  }
}

/**
 * Middleware that extracts and verifies approver credentials if present on any request.
 */
export function approverAuthMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = bearerToken || req.headers['x-approver-token'];

  if (token) {
    const approver = verifyApproverToken(token);
    if (approver) {
      req.approver = approver;
    }
  }
  next();
}

/**
 * Route guard requiring authenticated Station Duty Approver identity.
 * Fails closed with 503 if approver authentication is unconfigured in production.
 */
export function requireApprover(req, res, next) {
  if (!config.sessionSecret || !config.approverUsername || !config.approverPassword) {
    return res.status(503).json({
      error: 'Approver authentication is unconfigured in this environment. Required environment variables (APPROVER_USERNAME, APPROVER_PASSWORD, SESSION_SECRET) must be supplied.'
    });
  }

  if (!req.approver || req.approver.role !== 'x_mtts.approver') {
    return res.status(401).json({
      error: 'Unauthorized: Valid Station Duty Approver credentials are required to perform this action.'
    });
  }
  next();
}
