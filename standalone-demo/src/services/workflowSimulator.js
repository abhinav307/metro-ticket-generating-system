// ServiceNow Workflow Simulator — Scoped App x_mtts Simulation Engine
// Simulates:
// 1. Flow Designer: x_mtts.MetroBookingApprovalAndFulfillmentFlow
// 2. Script Include: x_mtts.MetroTicketGenerator
// 3. Script Include: x_mtts.MetroScannerVerificationService
// 4. Script Include: x_mtts.MetroRefundCalculator
// 5. REST API: /api/x_mtts/scanner/verify-ticket
// 6. Audit Logging: x_mtts_scan_event

import { INITIAL_BOOKINGS, STATIONS } from '../data/transitData';

const BOOKINGS_KEY = 'mtts_demo_bookings_v1';
const SCAN_EVENTS_KEY = 'mtts_demo_scan_events_v1';

// Seed initial state in localStorage if not present
export function initLocalStorage() {
  if (!localStorage.getItem(BOOKINGS_KEY)) {
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(INITIAL_BOOKINGS));
  }
  if (!localStorage.getItem(SCAN_EVENTS_KEY)) {
    const initialScans = [
      {
        id: 'scan-001',
        correlation_id: 'SCAN-CORR-20261016-08112',
        ticket_number: 'TKT-20261016-00008',
        gate_id: 'GATE-NORTH-01',
        station_code: 'STN-01',
        station_name: 'Central Terminus',
        scan_timestamp: '2026-10-16 09:15:22',
        outcome: 'VALID',
        gate_status: 'OPEN',
        http_code: 200,
        response_time_ms: 38,
        checksum: 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069'
      }
    ];
    localStorage.setItem(SCAN_EVENTS_KEY, JSON.stringify(initialScans));
  }
}

export function getBookings() {
  initLocalStorage();
  try {
    return JSON.parse(localStorage.getItem(BOOKINGS_KEY)) || INITIAL_BOOKINGS;
  } catch (e) {
    return INITIAL_BOOKINGS;
  }
}

export function saveBooking(booking) {
  const current = getBookings();
  const updated = [booking, ...current];
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(updated));
  return updated;
}

export function updateBooking(id, updates) {
  const current = getBookings();
  const updated = current.map(b => b.id === id ? { ...b, ...updates } : b);
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(updated));
  return updated;
}

export function getScanEvents() {
  initLocalStorage();
  try {
    return JSON.parse(localStorage.getItem(SCAN_EVENTS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

export function logScanEvent(event) {
  const current = getScanEvents();
  const updated = [event, ...current];
  localStorage.setItem(SCAN_EVENTS_KEY, JSON.stringify(updated));
  return updated;
}

// Generate atomic reference & ticket numbers
export function generateReferenceNumbers() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randNum = Math.floor(10000 + Math.random() * 90000);
  const tktNum = Math.floor(10000 + Math.random() * 90000);
  return {
    bookingReference: `MTTS-${dateStr}-${randNum}`,
    ticketNumber: `TKT-${dateStr}-${tktNum}`
  };
}

// Cryptographic hash simulation (SHA-256 style)
export function simulateHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `sha256:${hex}${hex}${hex}${hex}`.slice(0, 64);
}

// Full ServiceNow Flow Designer Execution Simulation
export async function executeBookingWorkflow(formData, calculation, onProgress) {
  const { bookingReference } = generateReferenceNumbers();
  const sourceStation = STATIONS.find(s => s.code === formData.sourceStationCode);
  const destStation = STATIONS.find(s => s.code === formData.destinationStationCode);

  const steps = [
    {
      step: 1,
      title: 'Service Catalog Submission',
      status: 'Creating sc_req_item record with variables payload...',
      log: `[ServiceCatalog] Inserted sc_req_item (Order: 100). Variables captured: Source=${sourceStation?.name}, Dest=${destStation?.name}, Type=${calculation.ticketType.name}, Count=${calculation.passengerCount}`
    },
    {
      step: 2,
      title: 'State Transition Guard',
      status: 'Evaluating BR_Booking_FinancialSnapshot & BR_Route_Validation...',
      log: `[BusinessRule:BR_Booking_FinancialSnapshot] Unit Fare ($${calculation.unitFare}) and Total Fare ($${calculation.totalFare}) snapshot locked. Database tampering prevention active.`
    },
    {
      step: 3,
      title: 'Queued for Station Approver Review',
      status: 'Creating sysapproval_approver queue entry...',
      log: `[FlowDesigner] Step 2.1: Created sysapproval_approver assigned to 'Metro Station Approvers'. Booking held in 'Pending' status. Ticket number and QR token held until approver authorization.`
    }
  ];

  for (let i = 0; i < steps.length; i++) {
    if (onProgress) {
      onProgress({
        currentStep: i + 1,
        totalSteps: steps.length,
        stepInfo: steps[i]
      });
    }
    await new Promise(r => setTimeout(r, 400));
  }

  const newBooking = {
    id: `bkg-${Date.now()}`,
    booking_reference: bookingReference,
    ticket_number: null,
    commuter_name: formData.commuterName || 'Registered Commuter',
    commuter_email: formData.commuterEmail || 'commuter@metro.internal',
    source_station_code: sourceStation?.code,
    source_station_name: sourceStation?.name,
    destination_station_code: destStation?.code,
    destination_station_name: destStation?.name,
    travel_date: formData.travelDate,
    ticket_type_code: calculation.ticketType.code,
    ticket_type_name: calculation.ticketType.name,
    passenger_count: calculation.passengerCount,
    distance_km: calculation.distanceKm,
    unit_fare: calculation.unitFare,
    total_fare: calculation.totalFare,
    status: 'Pending',
    display_status: 'Pending Approval',
    approval_status: 'pending',
    payment_status: 'PAID',
    issued_at: null,
    qr_token_hash: null,
    qr_payload: null,
    scans_count: 0
  };

  saveBooking(newBooking);
  return newBooking;
}

// Simulated Approver Action: Approve
export function approveBookingSimulator(bookingId, approverName = 'station_duty_manager') {
  const bookings = getBookings();
  const target = bookings.find(b => b.id === bookingId);
  if (!target) return { success: false, error: 'Booking not found' };

  const { ticketNumber } = generateReferenceNumbers();
  const rawToken = `${target.booking_reference}:${ticketNumber}:${Date.now()}`;
  const qrHash = simulateHash(rawToken);
  const qrPayload = `MTTS|${ticketNumber}|${target.booking_reference}|${qrHash.slice(0, 8)}|${target.travel_date}|${target.source_station_code}|${target.destination_station_code}|${target.passenger_count}|${target.ticket_type_code}|PAID`;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const updated = updateBooking(bookingId, {
    status: 'Generated',
    display_status: 'Ticket Issued',
    approval_status: 'approved',
    approved_by: approverName,
    approved_at: now,
    ticket_number: ticketNumber,
    issued_at: now,
    qr_token_hash: qrHash,
    qr_payload: qrPayload
  });

  return {
    success: true,
    booking: updated.find(b => b.id === bookingId)
  };
}

// Simulated Approver Action: Reject
export function rejectBookingSimulator(bookingId, reason = 'Administrative hold') {
  const bookings = getBookings();
  const target = bookings.find(b => b.id === bookingId);
  if (!target) return { success: false, error: 'Booking not found' };

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const updated = updateBooking(bookingId, {
    status: 'Cancelled',
    display_status: 'Rejected',
    approval_status: 'rejected',
    rejection_reason: reason,
    cancelled_at: now
  });

  return {
    success: true,
    booking: updated.find(b => b.id === bookingId)
  };
}

// Turnstile Scanner Verification Simulation
// Faithful replication of /api/x_mtts/scanner/verify-ticket (POST)
export function scanTicket(ticketNumberInput, gateId = 'GATE-SOUTH-03', stationCode = 'STN-01') {
  const station = STATIONS.find(s => s.code === stationCode) || STATIONS[0];
  const startTime = performance.now();
  const bookings = getBookings();
  const cleanTicket = (ticketNumberInput || '').trim();

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
    matchedBooking = bookings.find(b => b.ticket_number === cleanTicket || b.booking_reference === cleanTicket);

    if (!matchedBooking) {
      outcome = 'TICKET_NOT_FOUND';
      gateStatus = 'HOLD';
      httpCode = 404;
      message = 'Error 404: Unknown Ticket Number. Turnstile Gate Locked.';
    } else if (matchedBooking.status === 'Cancelled' || matchedBooking.approval_status === 'rejected') {
      outcome = 'TICKET_CANCELLED_OR_INVALID';
      gateStatus = 'HOLD';
      httpCode = 403;
      message = 'Error 403: Boarding privilege revoked. Ticket is Cancelled or Rejected.';
    } else if (matchedBooking.status === 'Pending' || matchedBooking.approval_status === 'pending' || !matchedBooking.ticket_number) {
      outcome = 'TICKET_CANCELLED_OR_INVALID';
      gateStatus = 'HOLD';
      httpCode = 403;
      message = 'Error 403: Gate Locked. Booking is pending approver authorization. No ticket issued.';
    } else if (matchedBooking.status !== 'Ticket Issued' && matchedBooking.status !== 'Generated') {
      outcome = 'TICKET_CANCELLED_OR_INVALID';
      gateStatus = 'HOLD';
      httpCode = 403;
      message = `Error 403: Ticket status is '${matchedBooking.status}'. Not authorized for gate entry.`;
    } else {
      // Successful scan: increment scan count
      updateBooking(matchedBooking.id, {
        scans_count: (matchedBooking.scans_count || 0) + 1,
        last_scanned: new Date().toISOString().replace('T', ' ').slice(0, 19)
      });
      outcome = 'VALID';
      gateStatus = 'OPEN';
      httpCode = 200;
      message = `Gate Unlocked! Welcome ${matchedBooking.commuter_name}. Route: ${matchedBooking.source_station_name} → ${matchedBooking.destination_station_name}`;
    }
  }

  const durationMs = Math.round(performance.now() - startTime + Math.floor(Math.random() * 25 + 15));
  const scanEvent = {
    id: `scan-${Date.now()}`,
    correlation_id: `SCAN-CORR-${Date.now()}`,
    ticket_number: cleanTicket || 'N/A',
    gate_id: gateId,
    station_code: station.code,
    station_name: station.name,
    scan_timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    outcome,
    gate_status: gateStatus,
    http_code: httpCode,
    response_time_ms: durationMs,
    message,
    checksum: simulateHash(`SCAN|${cleanTicket}|${gateId}|${outcome}|${Date.now()}`)
  };

  logScanEvent(scanEvent);

  return {
    scanEvent,
    matchedBooking
  };
}

// Cancellation & Refund Policy Simulation (Mirrors x_mtts.cancellation.policy_status)
export function cancelBooking(bookingId, reason = 'Commuter schedule change', policyStatus = 'UNCONFIGURED') {
  const bookings = getBookings();
  const target = bookings.find(b => b.id === bookingId);
  if (!target) return { success: false, error: 'Booking not found' };

  let refundAmount = 0.00;
  let refundRate = 0.0;
  let refundStatus = 'POLICY_UNCONFIGURED';
  let policyNotice = 'Cancellation policy is UNCONFIGURED. No refund authorized without formal policy approval. Turnstile boarding privileges permanently revoked.';

  if (policyStatus === 'ACTIVE') {
    refundRate = 0.80;
    refundAmount = +(target.total_fare * refundRate).toFixed(2);
    refundStatus = 'PROCESSED';
    policyNotice = '80% refund processed under active policy.';
  }

  const updated = updateBooking(bookingId, {
    status: 'Cancelled',
    display_status: 'Cancelled',
    cancellation_reason: reason,
    cancelled_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    refund_amount: refundAmount,
    refund_status: refundStatus
  });

  return {
    success: true,
    booking: updated.find(b => b.id === bookingId),
    refundAmount,
    refundRate,
    policyStatus,
    policyNotice
  };
}
