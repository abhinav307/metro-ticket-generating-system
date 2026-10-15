import assert from 'assert';
import { startServer } from '../index.js';

let server = null;
const TEST_PORT = 5055;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Test session IDs
const SESSION_A = 'test-session-commuter-alpha';
const SESSION_B = 'test-session-commuter-beta';

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

async function runTests() {
  console.log('\n======================================================');
  console.log(' MTTS Full-Stack Backend Integration Test Suite');
  console.log(' Scope: x_mtts | Dual-Mode: pg-mem embedded PostgreSQL');
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
  await test('GET /api/health returns 200 with database health and x_mtts scope', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.scope, 'x_mtts');
    assert.strictEqual(data.database.connected, true);
    assert.strictEqual(data.database.status, 'healthy');
  });

  // 2. Master Data Endpoints
  console.log('\n[Suite 2: Master Transit Data Endpoints]');
  await test('GET /api/stations returns 9 canonical transit stations', async () => {
    const res = await fetch(`${BASE_URL}/api/stations`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.stations));
    assert.strictEqual(data.stations.length, 9);
    assert.strictEqual(data.stations[0].code, 'STN-01');
    assert.strictEqual(data.stations[0].name, 'Central Terminus');
  });

  await test('GET /api/routes returns route network pairs with distances', async () => {
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
    // STN-01 to STN-02: 4.2 km * $2.50 = $10.50 (> $10.00 min)
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

  await test('POST /api/fare/calculate enforces minimum tariff for short routes', async () => {
    // Red Line short route: STN-06 to STN-07 (3.5 km * $2.50 = $8.75 < $10.00 min)
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
    assert.strictEqual(data.unitFare, 10.00); // Minimum fare applied
    assert.strictEqual(data.totalFare, 10.00);
  });

  await test('POST /api/fare/calculate applies 20% return discount (1.80 multiplier)', async () => {
    // STN-01 to STN-05: 14.2 km * $2.50 = $35.50 one-way. Return = $35.50 * 1.8 = $63.90. 2 passengers = $127.80
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

  await test('POST /api/fare/calculate applies flat tariff for Daily Pass', async () => {
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

  // 4. Booking Creation & Session Isolation
  console.log('\n[Suite 4: Booking Creation & Session Isolation]');
  let createdBookingId = null;
  let createdTicketNumber = null;

  await test('POST /api/bookings creates booking in PostgreSQL with HMAC-SHA256 token', async () => {
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
    assert.strictEqual(data.booking.status, 'Ticket Issued');
    assert.strictEqual(data.booking.payment_status, 'PAID');
    assert.ok(data.booking.qr_token_hash);
    assert.ok(data.booking.qr_payload.startsWith('MTTS|'));
    assert.strictEqual(data.booking.session_id, SESSION_A);

    createdBookingId = data.booking.id;
    createdTicketNumber = data.booking.ticket_number;
  });

  await test('GET /api/bookings enforces session isolation between visitors', async () => {
    // Session A should see the booking it created
    const resA = await fetch(`${BASE_URL}/api/bookings`, {
      headers: { 'X-Demo-Session-ID': SESSION_A }
    });
    const dataA = await resA.json();
    const hasMyBooking = dataA.bookings.some(b => b.id === createdBookingId);
    assert.strictEqual(hasMyBooking, true);

    // Session B should NOT see Session A's private booking
    const resB = await fetch(`${BASE_URL}/api/bookings`, {
      headers: { 'X-Demo-Session-ID': SESSION_B }
    });
    const dataB = await resB.json();
    const hasOtherBooking = dataB.bookings.some(b => b.id === createdBookingId);
    assert.strictEqual(hasOtherBooking, false);
  });

  // 5. Turnstile Hardware Verification
  console.log('\n[Suite 5: Turnstile Scanner Verification Service]');
  await test('POST /api/scanner/verify unlocks gate (OPEN) for valid issued ticket', async () => {
    const res = await fetch(`${BASE_URL}/api/scanner/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Session-ID': SESSION_A
      },
      body: JSON.stringify({
        ticketNumber: createdTicketNumber,
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
    assert.strictEqual(data.matchedBooking.ticket_number, createdTicketNumber);
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

  // 6. Cancellation & Tariff Refund Policy
  console.log('\n[Suite 6: Cancellation & Refund Quote Engine]');
  await test('POST /api/bookings/:id/cancel issues 80% tariff refund and revokes ticket', async () => {
    const res = await fetch(`${BASE_URL}/api/bookings/${createdBookingId}/cancel`, {
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
    assert.strictEqual(data.refund.refundRate, 0.80);
    assert.ok(data.refund.refundAmount > 0);
  });

  await test('POST /api/bookings/:id/cancel rejects cancellation from unauthorized session (403)', async () => {
    // Session B attempts to cancel Session A's booking
    const res = await fetch(`${BASE_URL}/api/bookings/${createdBookingId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Session-ID': SESSION_B
      },
      body: JSON.stringify({
        reason: 'Malicious attempt'
      })
    });

    assert.strictEqual(res.status, 403);
  });

  await test('POST /api/scanner/verify locks gate (HOLD) for cancelled ticket (403)', async () => {
    const res = await fetch(`${BASE_URL}/api/scanner/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketNumber: createdTicketNumber,
        gateId: 'GATE-NORTH-01'
      })
    });

    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.scanEvent.gate_status, 'HOLD');
    assert.strictEqual(data.scanEvent.outcome, 'TICKET_CANCELLED_OR_INVALID');
  });

  // 7. Audit Logging
  console.log('\n[Suite 7: Turnstile Audit Event Log]');
  await test('GET /api/scanner/events returns persistent scan audit events', async () => {
    const res = await fetch(`${BASE_URL}/api/scanner/events`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.events));
    assert.ok(data.events.length >= 4);
    const hasCreatedTicketScan = data.events.some(e => e.ticket_number === createdTicketNumber);
    assert.strictEqual(hasCreatedTicketScan, true);
  });

  // Teardown
  if (server) {
    server.close();
  }

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
