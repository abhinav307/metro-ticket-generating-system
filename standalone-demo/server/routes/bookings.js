import express from 'express';
import crypto from 'crypto';
import { getCollection } from '../db/index.js';
import { lookupRouteDistance } from './fare.js';
import { requireApprover } from '../middleware/auth.js';
import { config } from '../config.js';

const router = express.Router();

function generateBookingReference() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randNum = Math.floor(10000 + Math.random() * 90000);
  return `MTTS-${dateStr}-${randNum}`;
}

function generateTicketNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randNum = Math.floor(10000 + Math.random() * 90000);
  return `TKT-${dateStr}-${randNum}`;
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

// POST /api/bookings — Create booking in MongoDB in 'Pending' lifecycle state
// INVARIANT: No ticket number or QR token is generated at submission time.
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
    const bookingReference = generateBookingReference();
    const bookingId = `bkg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    const srcStation = await stationsCol.findOne({ code: sourceStationCode });
    const destStation = await stationsCol.findOne({ code: destinationStationCode });

    // Initial lifecycle record: Status is strictly 'Pending', ticket material is null
    const newBooking = {
      id: bookingId,
      session_id: sessionId,
      booking_reference: bookingReference,
      ticket_number: null, // Guard: No ticket issued before approval
      commuter_name: commuterName || 'Registered Commuter',
      commuter_email: commuterEmail || 'commuter@metro.internal',
      source_station_code: sourceStationCode,
      source_station_name: srcStation?.name || sourceStationCode,
      destination_station_code: destinationStationCode,
      destination_station_name: destStation?.name || destinationStationCode,
      travel_date: travelDate || now.slice(0, 10),
      ticket_type_code: tt.code,
      ticket_type_name: tt.name,
      passenger_count: count,
      distance_km: distanceKm,
      unit_fare: unitFare,
      total_fare: totalFare,
      currency_code: 'USD',
      status: 'Pending', // Four-status lifecycle initial baseline
      display_status: 'Pending Approval',
      approval_status: 'pending',
      payment_status: 'PAID', // Financial snapshot recorded
      qr_token_hash: null, // Guard: No QR token hash before approval
      qr_payload: null, // Guard: No QR payload before approval
      scans_count: 0,
      created_at: now,
      updated_at: now
    };

    const bookingsCol = getCollection('bookings');
    await bookingsCol.insertOne(newBooking);

    // Create persistent approval item in approvals collection
    const approvalsCol = getCollection('approvals');
    await approvalsCol.insertOne({
      id: `appr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      booking_id: bookingId,
      booking_reference: bookingReference,
      commuter_name: newBooking.commuter_name,
      commuter_email: newBooking.commuter_email,
      source_station_name: newBooking.source_station_name,
      destination_station_name: newBooking.destination_station_name,
      travel_date: newBooking.travel_date,
      passenger_count: newBooking.passenger_count,
      total_fare: newBooking.total_fare,
      ticket_type_name: newBooking.ticket_type_name,
      session_id: sessionId,
      decision: 'pending',
      decision_by: null,
      decision_time: null,
      rejection_reason: null,
      created_at: now
    });

    res.status(201).json({
      success: true,
      booking: newBooking,
      message: 'Booking submitted successfully and queued for Station Duty Approver review.'
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/:id/approve — Authenticated Station Duty Approver approval & ticket issuance
router.post('/:id/approve', requireApprover, async (req, res, next) => {
  try {
    const bookingId = req.params.id;
    const bookingsCol = getCollection('bookings');
    const approvalsCol = getCollection('approvals');

    const booking = await bookingsCol.findOne({ id: bookingId });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    // Conflict of interest enforcement: Commuter cannot approve their own booking
    const isOwnerSession = booking.session_id === req.sessionId;
    const isOwnerEmail = booking.commuter_email && req.approver && 
      booking.commuter_email.toLowerCase() === req.approver.username.toLowerCase();

    if (isOwnerSession || isOwnerEmail) {
      return res.status(403).json({
        error: 'Conflict of interest: Commuters are strictly prohibited from approving their own bookings.'
      });
    }

    // State machine guard: Only 'Pending' bookings can be approved
    if (booking.status !== 'Pending') {
      return res.status(409).json({
        error: `Cannot approve booking in status '${booking.status}'. Only Pending bookings can be approved.`
      });
    }

    // Allocate unique ticket number and mint cryptographic QR token
    const ticketNumber = generateTicketNumber();
    const rawToken = `${booking.booking_reference}:${ticketNumber}:${Date.now()}`;
    const qrTokenHash = computeTokenHash(rawToken);
    const qrPayload = `MTTS|${ticketNumber}|${booking.booking_reference}|${qrTokenHash.slice(0, 8)}|${booking.travel_date}|${booking.source_station_code}|${booking.destination_station_code}|${booking.passenger_count}|${booking.ticket_type_code}|PAID`;
    const now = new Date().toISOString();

    // Atomic update to prevent race conditions or duplicate issuance
    const updatedBooking = await bookingsCol.findOneAndUpdate(
      { id: bookingId, status: 'Pending' },
      {
        $set: {
          status: 'Generated',
          display_status: 'Ticket Issued',
          approval_status: 'approved',
          approved_by: req.approver.username,
          approved_at: now,
          ticket_number: ticketNumber,
          qr_token_hash: qrTokenHash,
          qr_payload: qrPayload,
          generation_time: now,
          updated_at: now
        }
      },
      { returnDocument: 'after' }
    );

    if (!updatedBooking) {
      return res.status(409).json({
        error: 'Concurrent modification conflict: Booking was already processed by another approver.'
      });
    }

    // Persist decision into approvals collection
    await approvalsCol.updateOne(
      { booking_id: bookingId },
      {
        $set: {
          decision: 'approved',
          decision_by: req.approver.username,
          decision_time: now,
          ticket_number: ticketNumber,
          updated_at: now
        }
      }
    );

    res.json({
      success: true,
      booking: updatedBooking,
      message: `Booking ${booking.booking_reference} approved. Issued Ticket ${ticketNumber}.`
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/:id/reject — Authenticated Station Duty Approver rejection
router.post('/:id/reject', requireApprover, async (req, res, next) => {
  try {
    const bookingId = req.params.id;
    const { reason } = req.body || {};
    const bookingsCol = getCollection('bookings');
    const approvalsCol = getCollection('approvals');

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ error: 'Rejection reason is mandatory.' });
    }

    const booking = await bookingsCol.findOne({ id: bookingId });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    // Conflict of interest enforcement
    const isOwnerSession = booking.session_id === req.sessionId;
    const isOwnerEmail = booking.commuter_email && req.approver && 
      booking.commuter_email.toLowerCase() === req.approver.username.toLowerCase();

    if (isOwnerSession || isOwnerEmail) {
      return res.status(403).json({
        error: 'Conflict of interest: Commuters are strictly prohibited from rejecting their own bookings.'
      });
    }

    // State machine guard: Only 'Pending' bookings can be rejected
    if (booking.status !== 'Pending') {
      return res.status(409).json({
        error: `Cannot reject booking in status '${booking.status}'. Only Pending bookings can be rejected.`
      });
    }

    const now = new Date().toISOString();
    const cleanReason = reason.trim();

    // Preserve 4-status baseline: Status becomes 'Cancelled' with distinct rejection metadata
    // Ensures no ticket number, QR token or boarding privilege is ever created
    const updatedBooking = await bookingsCol.findOneAndUpdate(
      { id: bookingId, status: 'Pending' },
      {
        $set: {
          status: 'Cancelled',
          display_status: 'Rejected',
          approval_status: 'rejected',
          rejection_reason: cleanReason,
          rejected_by: req.approver.username,
          rejected_at: now,
          cancellation_reason: `Administrative Rejection: ${cleanReason}`,
          cancelled_at: now,
          ticket_number: null,
          qr_token_hash: null,
          qr_payload: null,
          updated_at: now
        }
      },
      { returnDocument: 'after' }
    );

    if (!updatedBooking) {
      return res.status(409).json({
        error: 'Concurrent modification conflict: Booking was already processed by another approver.'
      });
    }

    // Update approvals collection
    await approvalsCol.updateOne(
      { booking_id: bookingId },
      {
        $set: {
          decision: 'rejected',
          decision_by: req.approver.username,
          decision_time: now,
          rejection_reason: cleanReason,
          updated_at: now
        }
      }
    );

    res.json({
      success: true,
      booking: updatedBooking,
      message: `Booking ${booking.booking_reference} rejected. Reason: ${cleanReason}. No ticket was issued.`
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/:id/cancel — Commuter cancellation of active booking
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const bookingId = req.params.id;
    const { reason } = req.body || {};
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

    const now = new Date().toISOString();
    const policyStatus = config.cancellationPolicyStatus || 'UNCONFIGURED';
    const isPolicyActive = policyStatus === 'ACTIVE';

    // Safety Gate: System Property x_mtts.cancellation.policy_status
    // Baseline is UNCONFIGURED: No refund is calculated or represented as authorized
    // until formal administrative and stakeholder policy activation.
    let refundRate = 0.0;
    let refundAmount = 0.00;
    let refundStatus = 'POLICY_UNCONFIGURED';
    let policyNotice = 'Cancellation and refund policy is currently UNCONFIGURED and pending formal stakeholder approval. No monetary refund is authorized. Turnstile boarding privileges permanently revoked.';

    if (isPolicyActive) {
      refundRate = 0.80;
      refundAmount = +(parseFloat(booking.total_fare) * refundRate).toFixed(2);
      refundStatus = 'PROCESSED';
      policyNotice = '80% tariff refund calculated via MetroRefundCalculator. Turnstile boarding privileges revoked.';
    }

    const updatedBooking = await bookingsCol.findOneAndUpdate(
      { id: bookingId },
      {
        $set: {
          status: 'Cancelled',
          display_status: 'Cancelled',
          cancellation_reason: reason || 'Commuter schedule change',
          cancelled_at: now,
          refund_amount: refundAmount,
          refund_status: refundStatus,
          updated_at: now
        }
      },
      { returnDocument: 'after' }
    );

    res.json({
      success: true,
      booking: updatedBooking,
      refund: {
        eligible: isPolicyActive,
        originalTotalFare: parseFloat(booking.total_fare),
        refundRate,
        refundAmount,
        policyStatus,
        policyNotice
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
