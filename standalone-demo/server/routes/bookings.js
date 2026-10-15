import express from 'express';
import crypto from 'crypto';
import { getCollection } from '../db/index.js';
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

// GET /api/bookings — Retrieve bookings from MongoDB for the current visitor session
router.get('/', async (req, res, next) => {
  try {
    const sessionId = req.sessionId;
    const bookingsCol = getCollection('bookings');

    // Fetch bookings belonging to this session, sorted by creation date descending
    let docs = await bookingsCol.find({ session_id: sessionId }).sort({ created_at: -1 }).toArray();

    // If visitor has no personal bookings yet, return the global demo seed booking
    if (docs.length === 0) {
      const demoDocs = await bookingsCol.find({ session_id: 'demo-global-seed' }).sort({ created_at: -1 }).toArray();
      return res.json({ bookings: demoDocs, isSampleData: true });
    }

    res.json({ bookings: docs, isSampleData: false });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings — Create booking document in MongoDB with authoritative fare and cryptographic token
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

    // Look up ticket type & tariff in MongoDB
    const ticketTypesCol = getCollection('ticket_types');
    const fareRulesCol = getCollection('fare_rules');
    const stationsCol = getCollection('stations');

    const tt = await ticketTypesCol.findOne({ code: ticketTypeCode || 'SINGLE', active: true });
    if (!tt) {
      return res.status(400).json({ error: 'Invalid ticket type.' });
    }

    const fr = await fareRulesCol.findOne({ ticket_type_code: tt.code, active: true });
    const ratePerKm = parseFloat(fr?.rate_per_km || 2.50);
    const minimumFare = parseFloat(fr?.minimum_fare || 10.00);
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

    const srcStation = await stationsCol.findOne({ code: sourceStationCode });
    const destStation = await stationsCol.findOne({ code: destinationStationCode });

    const newBooking = {
      id: bookingId,
      session_id: sessionId,
      booking_reference: bookingReference,
      ticket_number: ticketNumber,
      commuter_name: commuterName || 'Registered Commuter',
      commuter_email: commuterEmail || 'commuter@metro.internal',
      source_station_code: sourceStationCode,
      source_station_name: srcStation?.name || sourceStationCode,
      destination_station_code: destinationStationCode,
      destination_station_name: destStation?.name || destinationStationCode,
      travel_date: travelDate || new Date().toISOString().slice(0, 10),
      ticket_type_code: tt.code,
      ticket_type_name: tt.name,
      passenger_count: count,
      distance_km: distanceKm,
      unit_fare: unitFare,
      total_fare: totalFare,
      status: 'Ticket Issued',
      payment_status: 'PAID',
      qr_token_hash: qrTokenHash,
      qr_payload: qrPayload,
      scans_count: 0,
      created_at: new Date().toISOString()
    };

    const bookingsCol = getCollection('bookings');
    await bookingsCol.insertOne(newBooking);

    res.status(201).json({
      success: true,
      booking: newBooking,
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

// POST /api/bookings/:id/cancel — Demonstrate ticket cancellation and refund quote in MongoDB
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const bookingId = req.params.id;
    const { reason } = req.body;
    const sessionId = req.sessionId;
    const bookingsCol = getCollection('bookings');

    const booking = await bookingsCol.findOne({ id: bookingId });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    // Verify session ownership (unless global sample)
    if (booking.session_id !== sessionId && booking.session_id !== 'demo-global-seed') {
      return res.status(403).json({ error: 'Unauthorized: Booking belongs to a different demo session.' });
    }

    if (booking.status === 'Cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled.' });
    }

    const refundRate = 0.80; // 80% refund standard (MetroRefundCalculator)
    const refundAmount = +(parseFloat(booking.total_fare) * refundRate).toFixed(2);
    const now = new Date().toISOString();

    await bookingsCol.updateOne(
      { id: bookingId },
      {
        $set: {
          status: 'Cancelled',
          cancellation_reason: reason || 'Commuter schedule change',
          cancelled_at: now,
          refund_amount: refundAmount,
          refund_status: 'PROCESSED',
          updated_at: now
        }
      }
    );

    const updatedBooking = await bookingsCol.findOne({ id: bookingId });

    res.json({
      success: true,
      booking: updatedBooking,
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
