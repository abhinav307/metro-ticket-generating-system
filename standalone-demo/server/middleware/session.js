import crypto from 'crypto';

/**
 * Demo Session Isolation Middleware
 * 
 * Ensures that one demo visitor cannot casually access another visitor's private booking history.
 * Reads the client-asserted session ID header `X-Demo-Session-ID`. If absent, assigns a secure session ID.
 * 
 * SECURITY LIMITATIONS & ARCHITECTURAL NOTE:
 * This mechanism isolates records between distinct browser sessions using a unique client-asserted token
 * stored in the visitor's browser localStorage.
 * While this reliably separates demonstration traffic and prevents cross-visitor data leakage in a public demo,
 * it is not an enterprise authentication system (such as ServiceNow SAML 2.0, OAuth 2.0 PKCE, or Mutual TLS).
 * For a live production deployment, authentication must be enforced via identity provider integration.
 */
export function sessionMiddleware(req, res, next) {
  let sessionId = req.headers['x-demo-session-id'];

  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    sessionId = `demo_${crypto.randomBytes(12).toString('hex')}`;
  } else {
    // Sanitize session identifier (alphanumeric and dashes only, max 64 chars)
    sessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  }

  req.sessionId = sessionId;
  res.setHeader('X-Demo-Session-ID', sessionId);
  next();
}
