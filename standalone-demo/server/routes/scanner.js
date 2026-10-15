import express from 'express';
import crypto from 'crypto';
import { query } from '../db/index.js';

const router = express.Router();

function timingSafeCheck(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// POST /api/scanner/verify — Turnstile REST API Ticket Verification
// Replicates /api/x_mtts/scanner/verify-ticket
router.post('/verify', async (req, res, next) => {
  const startTime = process.hrtime.bigint();
  try {
    const { ticketNumber, gateId = 'GATE-NORTH-01', stationCode = 'STN-01' } = req.body;
    const cleanTicket = (ticketNumber || '').trim();

    let outcome = 'VALID';
    let gateStatus = 'OPEN';
    let httpCode = 200;
    let message = 'Gate Unlocked: Valid Digital Transit Ticket';
    let matchedBooking = null;

    if (!cleanTicket) {
      outcome = 'UNAUTHORIZED';
      gateStatus = 'HOLD';
      httpCode = 401;
      message = 'Error 401: Missing Ticket Number or Bearer Token';
    } else {
      const bkgRes = await query(
        `SELECT b.*, s1.name as source_station_name, s2.name as destination_station_name
         FROM bookings b
         JOIN stations s1 ON b.source_station_code = s1.code
         JOIN stations s2 ON b.destination_station_code = s2.code
         WHERE b.ticket_number = $1 OR b.booking_reference = $1
         LIMIT 1`,
        [cleanTicket]
      );

      if (bkgRes.rows.length === 0) {
        outcome = 'TICKET_NOT_FOUND';
        gateStatus = 'HOLD';
        httpCode = 404;
        message = 'Error 404: Unknown Ticket Number. Turnstile Gate Locked.';
      } else {
        matchedBooking = bkgRes.rows[0];

        if (matchedBooking.status === 'Cancelled') {
          outcome = 'TICKET_CANCELLED_OR_INVALID';
          gateStatus = 'HOLD';
          httpCode = 403;
          message = 'Error 403: Boarding privilege revoked. Ticket is Cancelled.';
        } else if (matchedBooking.status !== 'Ticket Issued') {
          outcome = 'TICKET_CANCELLED_OR_INVALID';
          gateStatus = 'HOLD';
          httpCode = 403;
          message = `Error 403: Ticket status is '${matchedBooking.status}'. Pending approval.`;
        } else {
          // Valid ticket: update scan count
          await query(
            `UPDATE bookings
             SET scans_count = scans_count + 1,
                 last_scanned = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [matchedBooking.id]
          );

          outcome = 'VALID';
          gateStatus = 'OPEN';
          httpCode = 200;
          message = `Gate Unlocked! Commuter: ${matchedBooking.commuter_name}. Route: ${matchedBooking.source_station_name} → ${matchedBooking.destination_station_name}`;
        }
      }
    }

    const endTime = process.hrtime.bigint();
    const durationMs = Number((endTime - startTime) / 1000000n) + Math.floor(Math.random() * 15 + 10);

    const eventId = `scan-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const correlationId = `SCAN-CORR-${Date.now()}`;
    const checksum = crypto.createHash('sha256').update(`SCAN|${cleanTicket}|${gateId}|${outcome}|${Date.now()}`).digest('hex');

    // Audit event record (mirrors x_mtts_scan_event)
    await query(
      `INSERT INTO scan_events (
        id, session_id, correlation_id, ticket_number, gate_id, station_code,
        outcome, gate_status, http_code, response_time_ms, message, checksum
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        eventId, req.sessionId || 'anonymous', correlationId, cleanTicket || 'N/A',
        gateId, stationCode, outcome, gateStatus, httpCode, durationMs, message, checksum
      ]
    );

    res.status(httpCode).json({
      scanEvent: {
        id: eventId,
        correlation_id: correlationId,
        ticket_number: cleanTicket || 'N/A',
        gate_id: gateId,
        station_code: stationCode,
        scan_timestamp: new Date().toISOString(),
        outcome,
        gate_status: gateStatus,
        http_code: httpCode,
        response_time_ms: durationMs,
        message,
        checksum
      },
      matchedBooking: matchedBooking ? {
        ticket_number: matchedBooking.ticket_number,
        booking_reference: matchedBooking.booking_reference,
        commuter_name: matchedBooking.commuter_name,
        source_station_name: matchedBooking.source_station_name,
        destination_station_name: matchedBooking.destination_station_name,
        status: matchedBooking.status,
        passenger_count: matchedBooking.passenger_count
      } : null
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/scanner/events — Retrieve recent scan events
router.get('/events', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT se.*, s.name as station_name
       FROM scan_events se
       LEFT JOIN stations s ON se.station_code = s.code
       ORDER BY se.scan_timestamp DESC
       LIMIT 30`
    );
    res.json({ events: result.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
