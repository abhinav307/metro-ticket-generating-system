import express from 'express';
import crypto from 'crypto';
import { getCollection } from '../db/index.js';

const router = express.Router();

// POST /api/scanner/verify — Turnstile REST API Ticket Verification with MongoDB
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

    const bookingsCol = getCollection('bookings');
    const scanEventsCol = getCollection('scan_events');

    if (!cleanTicket) {
      outcome = 'UNAUTHORIZED';
      gateStatus = 'HOLD';
      httpCode = 401;
      message = 'Error 401: Missing Ticket Number or Bearer Token';
    } else {
      matchedBooking = await bookingsCol.findOne({
        $or: [
          { ticket_number: cleanTicket },
          { booking_reference: cleanTicket }
        ]
      });

      if (!matchedBooking) {
        outcome = 'TICKET_NOT_FOUND';
        gateStatus = 'HOLD';
        httpCode = 404;
        message = 'Error 404: Unknown Ticket Number. Turnstile Gate Locked.';
      } else {
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
          // Valid ticket: increment scan count and record last_scanned
          await bookingsCol.updateOne(
            { id: matchedBooking.id },
            {
              $inc: { scans_count: 1 },
              $set: { last_scanned: new Date().toISOString() }
            }
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

    const scanEventDoc = {
      id: eventId,
      session_id: req.sessionId || 'anonymous',
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
    };

    // Insert into append-only turnstile audit log in MongoDB (mirrors x_mtts_scan_event)
    await scanEventsCol.insertOne(scanEventDoc);

    res.status(httpCode).json({
      scanEvent: scanEventDoc,
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

// GET /api/scanner/events — Retrieve recent scan events from MongoDB
router.get('/events', async (req, res, next) => {
  try {
    const scanEventsCol = getCollection('scan_events');
    const stationsCol = getCollection('stations');

    const events = await scanEventsCol.find({}).sort({ scan_timestamp: -1 }).limit(30).toArray();

    // Enrich with station_name if missing
    for (const ev of events) {
      if (!ev.station_name && ev.station_code) {
        const stn = await stationsCol.findOne({ code: ev.station_code });
        if (stn) ev.station_name = stn.name;
      }
    }

    res.json({ events });
  } catch (err) {
    next(err);
  }
});

export default router;
