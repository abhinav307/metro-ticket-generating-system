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
  const { bookingReference, ticketNumber } = generateReferenceNumbers();
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
      title: 'Flow Designer: Station Approver Review',
      status: 'Triggering x_mtts.MetroBookingApprovalAndFulfillmentFlow...',
      log: `[FlowDesigner] Step 2.1: Created sysapproval_approver assigned to 'Metro Station Approvers'. Approver automated auto-check: Origin != Destination (VERIFIED), Tariff rule valid (VERIFIED). Status: APPROVED.`
    },
    {
      step: 4,
      title: 'Ticket Fulfillment & Cryptographic Minting',
      status: 'Executing x_mtts.MetroTicketGenerator & QR Token Hashing...',
      log: `[MetroTicketGenerator] Minting Ticket ${ticketNumber}. Generating HMAC-SHA256 token hash with constant-time verification payload. Ticket status set to 'Ticket Issued'.`
    },
    {
      step: 5,
      title: 'Notification Event Registry',
      status: 'Queuing sysevent_register: x_mtts.ticket.generated...',
      log: `[NotificationService] Event 'x_mtts.ticket.generated' queued. Email dispatch prepared with attached SVG QR Pass and portal self-service link.`
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
    // Simulate real platform async execution delay (450ms per step)
    await new Promise(r => setTimeout(r, 450));
  }

  const rawToken = `${bookingReference}:${ticketNumber}:${Date.now()}`;
  const qrHash = simulateHash(rawToken);
  const qrPayload = `MTTS|${ticketNumber}|${bookingReference}|${qrHash.slice(0, 8)}|${formData.travelDate}|${sourceStation?.code}|${destStation?.code}|${calculation.passengerCount}|${calculation.ticketType.code}|PAID`;

  const newBooking = {
    id: `bkg-${Date.now()}`,
    booking_reference: bookingReference,
    ticket_number: ticketNumber,
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
    status: 'Ticket Issued',
    payment_status: 'PAID',
    issued_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    qr_token_hash: qrHash,
    qr_payload: qrPayload,
    scans_count: 0
  };

  saveBooking(newBooking);
  return newBooking;
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
    } else if (matchedBooking.status === 'Cancelled') {
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

// Cancellation & Refund Quote Simulation (MetroRefundCalculator)
export function cancelBooking(bookingId, reason = 'Commuter requested refund') {
  const bookings = getBookings();
  const target = bookings.find(b => b.id === bookingId);
  if (!target) return { success: false, error: 'Booking not found' };

  // Calculate refund
  const refundRate = 0.80; // 80% refund standard
  const refundAmount = +(target.total_fare * refundRate).toFixed(2);

  const updated = updateBooking(bookingId, {
    status: 'Cancelled',
    cancellation_reason: reason,
    cancelled_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    refund_amount: refundAmount,
    refund_status: 'PROCESSED'
  });

  return {
    success: true,
    booking: updated.find(b => b.id === bookingId),
    refundAmount,
    refundRate
  };
}
