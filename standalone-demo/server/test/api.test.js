import assert from 'assert';
import { startServer } from '../index.js';
import { getCollection, getDbInfo, closeDb, connectDb, sanitizeMongoUri } from '../db/index.js';
import { findDuplicateStringTicketNumbers, migrateBookingsTicketIndex } from '../db/schema.js';
import { config } from '../config.js';
import { generateApproverToken, verifyApproverToken } from '../middleware/auth.js';

let server = null;
const TEST_PORT = 5055;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Test session IDs
const SESSION_A = 'test-session-commuter-alpha';
const SESSION_B = 'test-session-commuter-beta';
const SESSION_APPROVER = 'test-session-duty-manager';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function loginApprover() {
  const res = await fetch(`${BASE_URL}/api/approvals/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: config.approverUsername,
      password: config.approverPassword
    })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.ok(data.token);
  return data.token;
}

async function runTests() {
  const isRealAtlas = !!config.mongodbUri;

  console.log('\n======================================================');
  console.log(' MTTS Full-Stack Backend Integration Test Suite');
  console.log(' Scope: x_mtts | Driver: Official MongoDB Node.js Driver');
  console.log(' Lifecycle: Real Server-Side Booking Approvals & Issuance');
  if (isRealAtlas) {
    console.log(' [MODE] LIVE TESTING: Connected to real MongoDB Atlas cluster');
    console.log(` [URI]  Target database: ${config.mongodbDbName}`);
  } else {
    console.log(' [MODE] MOCK/IN-MEMORY TESTING: Using In-Memory Mock MongoDB Engine');
    console.log(' [INFO] No MONGODB_URI supplied. Fast zero-dependency in-process test.');
    console.log(' [NOTE] To test against a live Atlas cluster, set MONGODB_URI in your environment.');
  }
  console.log('======================================================\n');

  try {
    process.env.NODE_ENV = 'test';
    server = await startServer(TEST_PORT);
  } catch (err) {
    console.error('Failed to initialize test server:', err);
    process.exit(1);
  }

  // 1. Health Endpoint Tests
  console.log('[Suite 1: System Health & Diagnostics]');
  await test('GET /api/health returns 200 with MongoDB connection and x_mtts scope', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.scope, 'x_mtts');
    assert.strictEqual(data.database.connected, true);
    assert.strictEqual(data.database.status, 'healthy');
    assert.strictEqual(data.database.dbName, config.mongodbDbName);
    if (isRealAtlas) {
      assert.strictEqual(data.database.engine, 'mongodb-atlas');
      assert.strictEqual(data.database.mode, 'atlas-cluster');
    } else {
      assert.strictEqual(data.database.engine, 'mock-mongodb (in-memory document store)');
      assert.strictEqual(data.database.mode, 'in-memory-mock');
    }
  });

  // 2. Master Transit Data Collections
  console.log('\n[Suite 2: Master Transit Data Collections (MongoDB)]');
  await test('GET /api/stations returns 9 canonical transit stations from stations collection', async () => {
    const res = await fetch(`${BASE_URL}/api/stations`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.stations));
    assert.strictEqual(data.stations.length, 9);
    assert.strictEqual(data.stations[0].code, 'STN-01');
    assert.strictEqual(data.stations[0].name, 'Central Terminus');
  });

  await test('GET /api/routes returns route network documents with distances from routes collection', async () => {
    const res = await fetch(`${BASE_URL}/api/routes`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.routes));
    assert.ok(data.routes.length >= 15);
    const stn1to2 = data.routes.find(r => r.origin_station_code === 'STN-01' && r.destination_station_code === 'STN-02');
    assert.ok(stn1to2);
    assert.strictEqual(parseFloat(stn1to2.distance_km), 4.2);
  });

  // 3. Tariff Calculation Engine
  console.log('\n[Suite 3: Authoritative Tariff Calculation Engine]');
  await test('POST /api/fare/calculate calculates single journey fare with minimum tariff safeguard', async () => {
    const res = await fetch(`${BASE_URL}/api/fare/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originCode: 'STN-01',
        destCode: 'STN-02',
        ticketTypeCode: 'SINGLE',
        passengerCount: 1
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.distanceKm, 4.2);
    assert.strictEqual(data.unitFare, 10.5);
    assert.strictEqual(data.totalFare, 10.5);
  });

  await test('POST /api/fare/calculate enforces minimum tariff for short routes ($10.00)', async () => {
    const res = await fetch(`${BASE_URL}/api/fare/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originCode: 'STN-06',
        destCode: 'STN-07',
        ticketTypeCode: 'SINGLE',
        passengerCount: 1
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.unitFare, 10.00);
    assert.strictEqual(data.totalFare, 10.00);
  });

  await test('POST /api/fare/calculate applies 20% return discount (1.80 multiplier)', async () => {
    const res = await fetch(`${BASE_URL}/api/fare/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originCode: 'STN-01',
        destCode: 'STN-05',
        ticketTypeCode: 'RETURN',
        passengerCount: 2
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.unitFare, 63.9);
    assert.strictEqual(data.totalFare, 127.8);
    assert.strictEqual(data.passengerCount, 2);
  });

  await test('POST /api/fare/calculate applies flat tariff for Daily Pass ($50.00)', async () => {
    const res = await fetch(`${BASE_URL}/api/fare/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originCode: 'STN-01',
        destCode: 'STN-05',
        ticketTypeCode: 'PASS',
        passengerCount: 3
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.unitFare, 50.0);
    assert.strictEqual(data.totalFare, 150.0);
  });

  await test('POST /api/fare/calculate rejects identical origin and destination', async () => {
    const res = await fetch(`${BASE_URL}/api/fare/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originCode: 'STN-01',
        destCode: 'STN-01',
        ticketTypeCode: 'SINGLE',
        passengerCount: 1
      })
    });
    assert.strictEqual(res.status, 400);
  });

  // 4. Booking Submission & Pending Lifecycle Invariant
  console.log('\n[Suite 4: Booking Submission & Pending State Lifecycle Invariants]');
  let bookingA_Id = null;
  let bookingA_Ref = null;

  await test('POST /api/bookings creates booking in Pending state WITHOUT ticket number or QR token', async () => {
    const res = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Session-ID': SESSION_A
      },
      body: JSON.stringify({
        sourceStationCode: 'STN-01',
        destinationStationCode: 'STN-03',
        travelDate: '2026-10-20',
        ticketTypeCode: 'SINGLE',
        passengerCount: 2,
        commuterName: 'Jordan Vance',
        commuterEmail: 'jordan.vance@transit.demo'
      })
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.booking);
    assert.strictEqual(data.booking.commuter_name, 'Jordan Vance');
    assert.strictEqual(data.booking.status, 'Pending');
    assert.strictEqual(data.booking.display_status, 'Pending Approval');
    assert.strictEqual(data.booking.approval_status, 'pending');
    assert.strictEqual(data.booking.payment_status, 'PAID');
    assert.strictEqual(data.booking.ticket_number, null, 'ticket_number MUST be null at submission time');
    assert.strictEqual(data.booking.qr_token_hash, null, 'qr_token_hash MUST be null at submission time');
    assert.strictEqual(data.booking.qr_payload, null, 'qr_payload MUST be null at submission time');
    assert.strictEqual(data.booking.session_id, SESSION_A);

    bookingA_Id = data.booking.id;
    bookingA_Ref = data.booking.booking_reference;

    // Verify approval record was created in approvals collection
    const approvalsCol = getCollection('approvals');
    const apprDoc = await approvalsCol.findOne({ booking_id: bookingA_Id });
    assert.ok(apprDoc, 'Approval record must be created in approvals collection');
    assert.strictEqual(apprDoc.decision, 'pending');
    assert.strictEqual(apprDoc.booking_reference, bookingA_Ref);
  });

  await test('GET /api/bookings enforces session isolation between visitors', async () => {
    const resA = await fetch(`${BASE_URL}/api/bookings`, {
      headers: { 'X-Demo-Session-ID': SESSION_A }
    });
    const dataA = await resA.json();
    const hasMyBooking = dataA.bookings.some(b => b.id === bookingA_Id);
    assert.strictEqual(hasMyBooking, true);

    const resB = await fetch(`${BASE_URL}/api/bookings`, {
      headers: { 'X-Demo-Session-ID': SESSION_B }
    });
    const dataB = await resB.json();
    const hasOtherBooking = dataB.bookings.some(b => b.id === bookingA_Id);
    assert.strictEqual(hasOtherBooking, false);
  });

  // 5. Approver Authentication & Authorization
  console.log('\n[Suite 5: Approver Authentication & Authorization]');
  let approverToken = null;

  await test('POST /api/approvals/login rejects invalid credentials with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/approvals/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'fake_user',
        password: 'WrongPassword@123'
      })
    });
    assert.strictEqual(res.status, 401);
  });

  await test('POST /api/approvals/login authenticates Station Duty Approver and returns signed token', async () => {
    approverToken = await loginApprover();
    assert.ok(approverToken);
  });

  await test('GET /api/approvals/pending rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/approvals/pending`);
    assert.strictEqual(res.status, 401);
  });

  await test('GET /api/approvals/pending returns pending bookings for authenticated approver', async () => {
    const res = await fetch(`${BASE_URL}/api/approvals/pending`, {
      headers: { 'Authorization': `Bearer ${approverToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.bookings));
    const pendingItem = data.bookings.find(b => b.id === bookingA_Id);
    assert.ok(pendingItem, 'Booking A must appear in pending approvals queue');
  });

  await test('POST /api/approvals/login fails closed (503) when credentials or secrets are unconfigured', async () => {
    const savedSecret = config.sessionSecret;
    config.sessionSecret = '';
    try {
      const res = await fetch(`${BASE_URL}/api/approvals/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: config.approverUsername || 'station_duty_manager',
          password: config.approverPassword || 'DutyManager@2026'
        })
      });
      assert.strictEqual(res.status, 503);
      const data = await res.json();
      assert.ok(data.error.includes('unconfigured'));
    } finally {
      config.sessionSecret = savedSecret;
    }
  });

  await test('GET /api/approvals/pending fails closed (503) when SESSION_SECRET is unconfigured', async () => {
    const savedSecret = config.sessionSecret;
    config.sessionSecret = '';
    try {
      const res = await fetch(`${BASE_URL}/api/approvals/pending`, {
        headers: { 'Authorization': `Bearer ${approverToken}` }
      });
      assert.strictEqual(res.status, 503);
      const data = await res.json();
      assert.ok(data.error.includes('unconfigured'));
    } finally {
      config.sessionSecret = savedSecret;
    }
  });

  // 6. Conflict of Interest Protection
  console.log('\n[Suite 6: Conflict of Interest Protection]');
  await test('POST /api/bookings/:id/approve rejects commuter self-approval by session (403 Forbidden)', async () => {
    // Same session as commuter
    const res = await fetch(`${BASE_URL}/api/bookings/${bookingA_Id}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${approverToken}`,
        'X-Demo-Session-ID': SESSION_A // Commuter's own session!
      }
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.ok(data.error.includes('Conflict of interest'));
  });

  // 7. Authorized Approval & Sequential Ticket Issuance
  console.log('\n[Suite 7: Authorized Approval & Cryptographic Ticket Issuance]');
  let issuedTicketNumber = null;

  await test('POST /api/bookings/:id/approve transitions booking to Generated and mints ticket', async () => {
    // Approver approving from an independent approver session
    const res = await fetch(`${BASE_URL}/api/bookings/${bookingA_Id}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${approverToken}`,
        'X-Demo-Session-ID': SESSION_APPROVER
      }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.booking);
    assert.strictEqual(data.booking.status, 'Generated');
    assert.strictEqual(data.booking.display_status, 'Ticket Issued');
    assert.strictEqual(data.booking.approval_status, 'approved');
    assert.strictEqual(data.booking.approved_by, config.approverUsername);
    assert.ok(data.booking.ticket_number.startsWith('TKT-'));
    assert.ok(data.booking.qr_token_hash);
    assert.ok(data.booking.qr_payload.startsWith('MTTS|'));

    issuedTicketNumber = data.booking.ticket_number;

    // Verify approval record updated in approvals collection
    const approvalsCol = getCollection('approvals');
    const apprDoc = await approvalsCol.findOne({ booking_id: bookingA_Id });
    assert.strictEqual(apprDoc.decision, 'approved');
    assert.strictEqual(apprDoc.ticket_number, issuedTicketNumber);
    assert.strictEqual(apprDoc.decision_by, config.approverUsername);
  });

  await test('POST /api/bookings/:id/approve on already approved booking returns 409 Conflict', async () => {
    const res = await fetch(`${BASE_URL}/api/bookings/${bookingA_Id}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${approverToken}`,
        'X-Demo-Session-ID': SESSION_APPROVER
      }
    });
    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.ok(data.error.includes('Only Pending bookings can be approved'));
  });

  // 8. Rejection Workflow & Rejection Reason Auditing
  console.log('\n[Suite 8: Rejection Workflow & Reason Auditing]');
  let bookingB_Id = null;
  let bookingB_Ref = null;

  await test('POST /api/bookings creates second booking for rejection testing', async () => {
    const res = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Session-ID': SESSION_B
      },
      body: JSON.stringify({
        sourceStationCode: 'STN-02',
        destinationStationCode: 'STN-04',
        travelDate: '2026-10-22',
        ticketTypeCode: 'SINGLE',
        passengerCount: 1,
        commuterName: 'Alex Mercer',
        commuterEmail: 'alex.mercer@transit.demo'
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    bookingB_Id = data.booking.id;
    bookingB_Ref = data.booking.booking_reference;
  });

  await test('POST /api/bookings/:id/reject without reason returns 400 Bad Request', async () => {
    const res = await fetch(`${BASE_URL}/api/bookings/${bookingB_Id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${approverToken}`,
        'X-Demo-Session-ID': SESSION_APPROVER
      },
      body: JSON.stringify({ reason: '' })
    });
    assert.strictEqual(res.status, 400);
  });

  await test('POST /api/bookings/:id/reject with reason transitions booking to Cancelled without ticket', async () => {
    const reasonText = 'Train capacity exceeded for selected departure window';
    const res = await fetch(`${BASE_URL}/api/bookings/${bookingB_Id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${approverToken}`,
        'X-Demo-Session-ID': SESSION_APPROVER
      },
      body: JSON.stringify({ reason: reasonText })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.booking.status, 'Cancelled');
    assert.strictEqual(data.booking.display_status, 'Rejected');
    assert.strictEqual(data.booking.approval_status, 'rejected');
    assert.strictEqual(data.booking.rejection_reason, reasonText);
    assert.strictEqual(data.booking.ticket_number, null, 'Rejected booking must NOT receive a ticket number');
    assert.strictEqual(data.booking.qr_token_hash, null, 'Rejected booking must NOT receive a QR token');

    // Verify approvals collection records rejection
    const approvalsCol = getCollection('approvals');
    const apprDoc = await approvalsCol.findOne({ booking_id: bookingB_Id });
    assert.strictEqual(apprDoc.decision, 'rejected');
    assert.strictEqual(apprDoc.rejection_reason, reasonText);
  });

  // 9. Turnstile Scanner Gate Security Enforcement
  console.log('\n[Suite 9: Turnstile Scanner Gate Security Enforcement]');
  await test('POST /api/scanner/verify locks gate (HOLD) for unapproved pending booking (403)', async () => {
    // Create a fresh pending booking
    const createRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Session-ID': SESSION_A
      },
      body: JSON.stringify({
        sourceStationCode: 'STN-03',
        destinationStationCode: 'STN-05',
        travelDate: '2026-10-25',
        ticketTypeCode: 'SINGLE',
        passengerCount: 1,
        commuterName: 'Unapproved Commuter'
      })
    });
    const createData = await createRes.json();
    const pendingRef = createData.booking.booking_reference;

    // Scan turnstile using the pending booking reference
    const scanRes = await fetch(`${BASE_URL}/api/scanner/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketNumber: pendingRef,
        gateId: 'GATE-NORTH-01'
      })
    });

    assert.strictEqual(scanRes.status, 403);
    const scanData = await scanRes.json();
    assert.strictEqual(scanData.scanEvent.gate_status, 'HOLD');
    assert.strictEqual(scanData.scanEvent.outcome, 'TICKET_CANCELLED_OR_INVALID');
    assert.ok(scanData.scanEvent.message.includes('pending approver authorization'));
  });

  await test('POST /api/scanner/verify locks gate (HOLD) for rejected booking (403)', async () => {
    const scanRes = await fetch(`${BASE_URL}/api/scanner/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketNumber: bookingB_Ref,
        gateId: 'GATE-NORTH-01'
      })
    });

    assert.strictEqual(scanRes.status, 403);
    const scanData = await scanRes.json();
    assert.strictEqual(scanData.scanEvent.gate_status, 'HOLD');
    assert.strictEqual(scanData.scanEvent.outcome, 'TICKET_CANCELLED_OR_INVALID');
    assert.ok(scanData.scanEvent.message.includes('Cancelled or Rejected'));
  });

  await test('POST /api/scanner/verify unlocks gate (OPEN) for valid approved ticket and increments scans_count', async () => {
    const res = await fetch(`${BASE_URL}/api/scanner/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Session-ID': SESSION_A
      },
      body: JSON.stringify({
        ticketNumber: issuedTicketNumber,
        gateId: 'GATE-NORTH-01',
        stationCode: 'STN-01'
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.scanEvent.gate_status, 'OPEN');
    assert.strictEqual(data.scanEvent.outcome, 'VALID');
    assert.strictEqual(data.scanEvent.http_code, 200);
    assert.ok(data.matchedBooking);
    assert.strictEqual(data.matchedBooking.ticket_number, issuedTicketNumber);

    // Verify scans_count incremented in MongoDB
    const bookingsCol = getCollection('bookings');
    const doc = await bookingsCol.findOne({ id: bookingA_Id });
    assert.strictEqual(doc.scans_count, 1);
  });

  await test('POST /api/scanner/verify locks gate (HOLD) for non-existent ticket (404)', async () => {
    const res = await fetch(`${BASE_URL}/api/scanner/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketNumber: 'TKT-INVALID-99999',
        gateId: 'GATE-NORTH-01'
      })
    });

    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.scanEvent.gate_status, 'HOLD');
    assert.strictEqual(data.scanEvent.outcome, 'TICKET_NOT_FOUND');
  });

  await test('POST /api/scanner/verify rejects empty ticket with 401 Unauthorized', async () => {
    const res = await fetch(`${BASE_URL}/api/scanner/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketNumber: '',
        gateId: 'GATE-NORTH-01'
      })
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.scanEvent.gate_status, 'HOLD');
    assert.strictEqual(data.scanEvent.outcome, 'UNAUTHORIZED');
  });

  // 10. Scanner Audit Privacy
  console.log('\n[Suite 10: Scanner Audit Privacy & Authorization]');
  await test('GET /api/scanner/events limits ordinary commuters to own session scan events', async () => {
    const res = await fetch(`${BASE_URL}/api/scanner/events`, {
      headers: { 'X-Demo-Session-ID': SESSION_B }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    // Session B should not see Session A's scan events
    const hasSessionAScan = data.events.some(e => e.ticket_number === issuedTicketNumber);
    assert.strictEqual(hasSessionAScan, false);
  });

  await test('GET /api/scanner/events grants authenticated approver system-wide audit access', async () => {
    const res = await fetch(`${BASE_URL}/api/scanner/events`, {
      headers: {
        'Authorization': `Bearer ${approverToken}`,
        'X-Demo-Session-ID': SESSION_APPROVER
      }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const hasSessionAScan = data.events.some(e => e.ticket_number === issuedTicketNumber);
    assert.strictEqual(hasSessionAScan, true, 'Approver must have visibility into all turnstile events');
  });

  // 11. Cancellation & Safety Policy Gate on Approved Ticket
  console.log('\n[Suite 11: Cancellation Safety Policy Gate & Turnstile Revocation]');
  await test('POST /api/bookings/:id/cancel revokes ticket with $0.00 refund when policy is UNCONFIGURED', async () => {
    config.cancellationPolicyStatus = 'UNCONFIGURED';
    const res = await fetch(`${BASE_URL}/api/bookings/${bookingA_Id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Session-ID': SESSION_A
      },
      body: JSON.stringify({
        reason: 'Meeting rescheduled by commuter'
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.booking.status, 'Cancelled');
    assert.strictEqual(data.refund.eligible, false);
    assert.strictEqual(data.refund.refundRate, 0.0);
    assert.strictEqual(data.refund.refundAmount, 0.00);
    assert.strictEqual(data.refund.policyStatus, 'UNCONFIGURED');
    assert.ok(data.refund.policyNotice.includes('UNCONFIGURED'));

    // Verify document in MongoDB reflects Cancelled status and 0.00 refund
    const bookingsCol = getCollection('bookings');
    const doc = await bookingsCol.findOne({ id: bookingA_Id });
    assert.strictEqual(doc.status, 'Cancelled');
    assert.strictEqual(doc.refund_status, 'POLICY_UNCONFIGURED');
    assert.strictEqual(doc.refund_amount, 0.00);
  });

  await test('POST /api/scanner/verify locks gate (HOLD) for cancelled ticket (403)', async () => {
    const res = await fetch(`${BASE_URL}/api/scanner/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketNumber: issuedTicketNumber,
        gateId: 'GATE-NORTH-01'
      })
    });

    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.scanEvent.gate_status, 'HOLD');
    assert.strictEqual(data.scanEvent.outcome, 'TICKET_CANCELLED_OR_INVALID');
  });

  await test('POST /api/bookings/:id/cancel calculates 80% refund when policy is explicitly ACTIVE', async () => {
    // Create a temporary booking to test active policy behavior
    const createRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Session-ID': SESSION_A
      },
      body: JSON.stringify({
        sourceStationCode: 'STN-01',
        destinationStationCode: 'STN-02',
        travelDate: '2026-10-28',
        ticketTypeCode: 'SINGLE',
        passengerCount: 1,
        commuterName: 'Active Policy Commuter'
      })
    });
    const createData = await createRes.json();
    const activeTestBookingId = createData.booking.id;

    config.cancellationPolicyStatus = 'ACTIVE';
    try {
      const cancelRes = await fetch(`${BASE_URL}/api/bookings/${activeTestBookingId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-Session-ID': SESSION_A
        },
        body: JSON.stringify({ reason: 'Trip deferred' })
      });
      assert.strictEqual(cancelRes.status, 200);
      const cancelData = await cancelRes.json();
      assert.strictEqual(cancelData.refund.eligible, true);
      assert.strictEqual(cancelData.refund.refundRate, 0.80);
      assert.strictEqual(cancelData.refund.refundAmount, 8.4); // 10.50 * 0.80 = 8.40
      assert.strictEqual(cancelData.booking.refund_status, 'PROCESSED');
    } finally {
      config.cancellationPolicyStatus = 'UNCONFIGURED'; // Restore safety baseline!
    }
  });

  // 12. MongoDB Unique Constraints & Schema Integrity Tests
  console.log('\n[Suite 12: MongoDB Unique Constraints & Index Enforcement]');
  await test('MongoDB enforces unique constraint on booking_reference (duplicate rejected)', async () => {
    const bookingsCol = getCollection('bookings');
    let duplicateRejected = false;
    try {
      await bookingsCol.insertOne({
        id: `bkg-dup-${Date.now()}`,
        session_id: 'test-collision',
        booking_reference: bookingA_Ref, // duplicate
        ticket_number: `TKT-NEW-${Date.now()}`,
        status: 'Ticket Issued'
      });
    } catch (err) {
      if (err.code === 11000 || err.message.includes('duplicate key')) {
        duplicateRejected = true;
      }
    }
    assert.strictEqual(duplicateRejected, true);
  });

  await test('MongoDB allows multiple bookings with ticket_number: null under unique partial index', async () => {
    const bookingsCol = getCollection('bookings');
    const bkg1 = {
      id: `bkg-null-1-${Date.now()}`,
      session_id: 'test-partial-index',
      booking_reference: `MTTS-NULL-1-${Date.now()}`,
      ticket_number: null,
      status: 'Pending'
    };
    const bkg2 = {
      id: `bkg-null-2-${Date.now()}`,
      session_id: 'test-partial-index',
      booking_reference: `MTTS-NULL-2-${Date.now()}`,
      ticket_number: null,
      status: 'Pending'
    };
    const bkg3 = {
      id: `bkg-null-3-${Date.now()}`,
      session_id: 'test-partial-index',
      booking_reference: `MTTS-NULL-3-${Date.now()}`,
      ticket_number: null,
      status: 'Pending'
    };

    // All three pending bookings with ticket_number: null must succeed without index collision
    await bookingsCol.insertOne(bkg1);
    await bookingsCol.insertOne(bkg2);
    await bookingsCol.insertOne(bkg3);

    const doc1 = await bookingsCol.findOne({ id: bkg1.id });
    const doc2 = await bookingsCol.findOne({ id: bkg2.id });
    const doc3 = await bookingsCol.findOne({ id: bkg3.id });

    assert.ok(doc1 && doc1.ticket_number === null);
    assert.ok(doc2 && doc2.ticket_number === null);
    assert.ok(doc3 && doc3.ticket_number === null);
  });

  await test('MongoDB enforces unique constraint on string ticket_number (duplicate string ticket rejected)', async () => {
    const bookingsCol = getCollection('bookings');
    let duplicateRejected = false;
    try {
      await bookingsCol.insertOne({
        id: `bkg-dup2-${Date.now()}`,
        session_id: 'test-collision',
        booking_reference: `MTTS-NEW-${Date.now()}`,
        ticket_number: issuedTicketNumber, // duplicate of issuedTicketNumber (string)
        status: 'Ticket Issued'
      });
    } catch (err) {
      if (err.code === 11000 || err.message.includes('duplicate key')) {
        duplicateRejected = true;
      }
    }
    assert.strictEqual(duplicateRejected, true);
  });

  await test('MongoDB enforces unique constraint on station code (duplicate rejected)', async () => {
    const stationsCol = getCollection('stations');
    let duplicateRejected = false;
    try {
      await stationsCol.insertOne({
        code: 'STN-01', // duplicate
        name: 'Collision Central',
        line_name: 'Blue Line',
        active: true
      });
    } catch (err) {
      if (err.code === 11000 || err.message.includes('duplicate key')) {
        duplicateRejected = true;
      }
    }
    assert.strictEqual(duplicateRejected, true);
  });

  await test('migrateBookingsTicketIndex is idempotent and recognizes correctly configured index', async () => {
    const bookingsCol = getCollection('bookings');
    // Calling migration when index is already correct should succeed without error
    await migrateBookingsTicketIndex(bookingsCol);
    const indexes = await bookingsCol.indexes();
    const ticketIdx = indexes.find(i => i.name === 'idx_bookings_ticket_number_unique');
    assert.ok(ticketIdx);
    assert.strictEqual(ticketIdx.unique, true);
    assert.strictEqual(ticketIdx.partialFilterExpression?.ticket_number?.$type, 'string');
  });

  await test('migrateBookingsTicketIndex halts safely if duplicate string ticket numbers are detected', async () => {
    const { MemoryCollection } = await import('../db/memoryMongo.js');
    const mockCol = new MemoryCollection('bookings_dup_test');
    await mockCol.insertOne({ id: 'bkg-1', ticket_number: 'TKT-COLLISION-999' });
    await mockCol.insertOne({ id: 'bkg-2', ticket_number: 'TKT-COLLISION-999' }); // duplicate!

    const duplicates = await findDuplicateStringTicketNumbers(mockCol);
    assert.strictEqual(duplicates.length, 1);
    assert.strictEqual(duplicates[0].ticket_number, 'TKT-COLLISION-999');
    assert.strictEqual(duplicates[0].count, 2);

    let migrationThrew = false;
    try {
      await migrateBookingsTicketIndex(mockCol);
    } catch (err) {
      if (err.message.includes('Index migration halted') && err.message.includes('duplicate string ticket numbers exist')) {
        migrationThrew = true;
      }
    }
    assert.strictEqual(migrationThrew, true, 'Migration must halt safely on duplicates without modifying records');
  });

  // Teardown server
  if (server) {
    server.close();
  }
  await closeDb();

  // 13. Production-Safety & Fail-Closed Invariant Verification
  console.log('\n[Suite 13: Production-Safety & Fail-Closed Invariants]');
  
  await test('sanitizeMongoUri() masks plaintext passwords in Atlas connection strings', async () => {
    const rawUri = 'mongodb+srv://admin_user:SuperSecretPassword123@cluster0.abcde.mongodb.net/mtts_transit_db?retryWrites=true';
    const sanitized = sanitizeMongoUri(rawUri);
    assert.strictEqual(sanitized.includes('SuperSecretPassword123'), false);
    assert.strictEqual(sanitized, 'mongodb+srv://***:***@cluster0.abcde.mongodb.net/mtts_transit_db?retryWrites=true');
  });

  await test('Production fail-closed invariant: NODE_ENV=production without MONGODB_URI throws fatal error and rejects mock fallback', async () => {
    const savedEnv = process.env.NODE_ENV;
    const savedUri = config.mongodbUri;
    process.env.NODE_ENV = 'production';
    config.mongodbUri = '';
    let fatalErrorCaught = false;
    let thrownMessage = '';

    try {
      await connectDb();
    } catch (err) {
      fatalErrorCaught = true;
      thrownMessage = err.message;
    } finally {
      process.env.NODE_ENV = savedEnv;
      config.mongodbUri = savedUri;
    }

    assert.strictEqual(fatalErrorCaught, true, 'connectDb() must throw in production when MONGODB_URI is empty');
    assert.ok(
      thrownMessage.includes('[FATAL] Production database misconfiguration'),
      `Expected fatal message but got: ${thrownMessage}`
    );
  });

  await test('Production fail-closed invariant: Atlas connection failure in production throws fatal error and does NOT fall back to mock', async () => {
    const savedEnv = process.env.NODE_ENV;
    const savedUri = config.mongodbUri;
    process.env.NODE_ENV = 'production';
    config.mongodbUri = 'mongodb://127.0.0.1:59999/test?connectTimeoutMS=500&serverSelectionTimeoutMS=500';
    let fatalErrorCaught = false;
    let thrownMessage = '';

    try {
      await connectDb();
    } catch (err) {
      fatalErrorCaught = true;
      thrownMessage = err.message;
    } finally {
      process.env.NODE_ENV = savedEnv;
      config.mongodbUri = savedUri;
    }

    assert.strictEqual(fatalErrorCaught, true, 'connectDb() must throw on Atlas connection failure in production');
    assert.ok(
      thrownMessage.includes('[FATAL] Production MongoDB Atlas connection failure'),
      `Expected fatal message but got: ${thrownMessage}`
    );
  });

  await test('Production approver auth safety: generateApproverToken() throws when SESSION_SECRET is missing', async () => {
    const savedSecret = config.sessionSecret;
    config.sessionSecret = '';
    let caught = false;
    try {
      generateApproverToken('test_user');
    } catch (e) {
      caught = true;
      assert.ok(e.message.includes('SESSION_SECRET is not configured'));
    } finally {
      config.sessionSecret = savedSecret;
    }
    assert.strictEqual(caught, true);
  });

  await test('Production approver auth safety: verifyApproverToken() returns null when SESSION_SECRET is missing', async () => {
    const savedSecret = config.sessionSecret;
    config.sessionSecret = '';
    try {
      const res = verifyApproverToken('mock.header.sig');
      assert.strictEqual(res, null);
    } finally {
      config.sessionSecret = savedSecret;
    }
  });

  console.log('\n======================================================');
  console.log(` Test Summary: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution fatal error:', err);
  if (server) server.close();
  process.exit(1);
});
