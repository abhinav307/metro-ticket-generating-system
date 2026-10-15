import express from 'express';
import crypto from 'crypto';
import { query } from '../db/index.js';
import { lookupRouteDistance } from './fare.js';

const router = express.Router();

function generateIdentifiers() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randNum1 = Math.floor(10000 + Math.random() * 90000);
  const randNum2 = Math.floor(10000 + Math.random() * 90000);
  return {
    bookingReference: `MTTS-${dateStr}-${randNum1}`,
    ticketNumber: `TKT-${dateStr}-${randNum2}`
  };
}

function computeTokenHash(tokenString) {
  return crypto.createHmac('sha256', 'mtts-demo-secret-key-salt').update(tokenString).digest('hex');
}

// GET /api/bookings — Retrieve bookings for the current visitor session
router.get('/', async (req, res, next) => {
  try {
    const sessionId = req.sessionId;

    // Fetch bookings belonging to this session, plus the global demo seed if none created yet
    let result = await query(
      `SELECT b.*,
              s1.name as source_station_name, s2.name as destination_station_name,
              tt.name as ticket_type_name
       FROM bookings b
       JOIN stations s1 ON b.source_station_code = s1.code
       JOIN stations s2 ON b.destination_station_code = s2.code
       JOIN ticket_types tt ON b.ticket_type_code = tt.code
       WHERE b.session_id = $1
       ORDER BY b.created_at DESC`,
      [sessionId]
    );

    // If visitor has no personal bookings yet, show the global demo seed booking
    if (result.rows.length === 0) {
      const demoRes = await query(
        `SELECT b.*,
                s1.name as source_station_name, s2.name as destination_station_name,
                tt.name as ticket_type_name
         FROM bookings b
         JOIN stations s1 ON b.source_station_code = s1.code
         JOIN stations s2 ON b.destination_station_code = s2.code
         JOIN ticket_types tt ON b.ticket_type_code = tt.code
         WHERE b.session_id = 'demo-global-seed'
         ORDER BY b.created_at DESC`
      );
      return res.json({ bookings: demoRes.rows, isSampleData: true });
    }

    res.json({ bookings: result.rows, isSampleData: false });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings — Create booking with authoritative server-side calculation and cryptographic token minting
router.post('/', async (req, res, next) => {
  try {
    const sessionId = req.sessionId;
    const {
      sourceStationCode,
      destinationStationCode,
      travelDate,
      ticketTypeCode,
      passengerCount,
      commuterName,
      commuterEmail
    } = req.body;

    if (!sourceStationCode || !destinationStationCode) {
      return res.status(400).json({ error: 'Origin and destination stations are required.' });
    }

    if (sourceStationCode === destinationStationCode) {
      return res.status(400).json({ error: 'Origin and destination stations must be different.' });
    }

    const count = Math.max(1, Math.min(6, parseInt(passengerCount, 10) || 1));
    const distanceKm = await lookupRouteDistance(sourceStationCode, destinationStationCode);

    // Look up ticket type & tariff
    const typeRes = await query(
      `SELECT tt.*, fr.rate_per_km, fr.minimum_fare
       FROM ticket_types tt
       LEFT JOIN fare_rules fr ON tt.code = fr.ticket_type_code
       WHERE tt.code = $1 AND tt.active = true`,
      [ticketTypeCode || 'SINGLE']
    );

    if (typeRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid ticket type.' });
    }

    const tt = typeRes.rows[0];
    const ratePerKm = parseFloat(tt.rate_per_km || 2.50);
    const minimumFare = parseFloat(tt.minimum_fare || 10.00);
    const multiplier = parseFloat(tt.multiplier || 1.0);
    const fixedFare = tt.fixed_fare ? parseFloat(tt.fixed_fare) : null;

    let unitFare = 0;
    if (tt.code === 'PASS') {
      unitFare = fixedFare || 50.00;
    } else if (tt.code === 'RETURN') {
      const oneWayBase = Math.max(distanceKm * ratePerKm, minimumFare);
      unitFare = +(oneWayBase * multiplier).toFixed(2);
    } else {
      unitFare = +Math.max(distanceKm * ratePerKm, minimumFare).toFixed(2);
    }

    const totalFare = +(unitFare * count).toFixed(2);
    const { bookingReference, ticketNumber } = generateIdentifiers();

    const rawToken = `${bookingReference}:${ticketNumber}:${Date.now()}`;
    const qrTokenHash = computeTokenHash(rawToken);
    const qrPayload = `MTTS|${ticketNumber}|${bookingReference}|${qrTokenHash.slice(0, 8)}|${travelDate}|${sourceStationCode}|${destinationStationCode}|${count}|${tt.code}|PAID`;
    const bookingId = `bkg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const insertResult = await query(
      `INSERT INTO bookings (
        id, session_id, booking_reference, ticket_number, commuter_name, commuter_email,
        source_station_code, destination_station_code, travel_date, ticket_type_code,
        passenger_count, distance_km, unit_fare, total_fare, status, payment_status,
        qr_token_hash, qr_payload, scans_count
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'Ticket Issued', 'PAID', $15, $16, 0
      ) RETURNING *`,
      [
        bookingId, sessionId, bookingReference, ticketNumber,
        commuterName || 'Registered Commuter',
        commuterEmail || 'commuter@metro.internal',
        sourceStationCode, destinationStationCode, travelDate || new Date(),
        tt.code, count, distanceKm, unitFare, totalFare,
        qrTokenHash, qrPayload
      ]
    );

    // Fetch enriched row with station and type names
    const enriched = await query(
      `SELECT b.*,
              s1.name as source_station_name, s2.name as destination_station_name,
              tt.name as ticket_type_name
       FROM bookings b
       JOIN stations s1 ON b.source_station_code = s1.code
       JOIN stations s2 ON b.destination_station_code = s2.code
       JOIN ticket_types tt ON b.ticket_type_code = tt.code
       WHERE b.id = $1`,
      [bookingId]
    );

    res.status(201).json({
      success: true,
      booking: enriched.rows[0],
      simulated_workflow: {
        flow_designer: 'x_mtts.MetroBookingApprovalAndFulfillmentFlow',
        status: 'Completed',
        steps: [
          'Service Catalog request created (sc_req_item)',
          'Financial snapshotting locked (BR_Booking_FinancialSnapshot)',
          'Station Duty Manager review approved (sysapproval_approver)',
          'HMAC-SHA256 Token hash minted (MetroTicketGenerator.js)',
          'Notification queued (x_mtts.ticket.generated)'
        ]
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/:id/cancel — Demonstrate ticket cancellation and refund quote
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const bookingId = req.params.id;
    const { reason } = req.body;
    const sessionId = req.sessionId;

    const bkgRes = await query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
    if (bkgRes.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = bkgRes.rows[0];

    // Verify session ownership (unless global sample)
    if (booking.session_id !== sessionId && booking.session_id !== 'demo-global-seed') {
      return res.status(403).json({ error: 'Unauthorized: Booking belongs to a different demo session.' });
    }

    if (booking.status === 'Cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled.' });
    }

    const refundRate = 0.80; // 80% refund standard (MetroRefundCalculator)
    const refundAmount = +(parseFloat(booking.total_fare) * refundRate).toFixed(2);

    const updateRes = await query(
      `UPDATE bookings
       SET status = 'Cancelled',
           cancellation_reason = $1,
           cancelled_at = CURRENT_TIMESTAMP,
           refund_amount = $2,
           refund_status = 'PROCESSED',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [reason || 'Commuter schedule change', refundAmount, bookingId]
    );

    res.json({
      success: true,
      booking: updateRes.rows[0],
      refund: {
        originalTotalFare: parseFloat(booking.total_fare),
        refundRate: 0.80,
        refundAmount,
        policyNotice: '80% tariff refund calculated via simulated MetroRefundCalculator. Boarding privilege revoked.'
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
