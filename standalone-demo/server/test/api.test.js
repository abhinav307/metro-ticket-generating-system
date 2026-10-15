import assert from 'assert';
import { startServer } from '../index.js';
import { getCollection, getDbInfo, closeDb, connectDb, sanitizeMongoUri } from '../db/index.js';
import { config } from '../config.js';

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
  const isRealAtlas = !!config.mongodbUri;

  console.log('\n======================================================');
  console.log(' MTTS Full-Stack Backend Integration Test Suite');
  console.log(' Scope: x_mtts | Database Driver: Official MongoDB Node.js Driver');
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

  await test('POST /api/fare/calculate enforces minimum tariff for short routes ($10.00)', async () => {
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
    assert.strictEqual(data.unitFare, 10.00); // Minimum fare threshold applied
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

  // 4. Booking Creation & Session Isolation
  console.log('\n[Suite 4: Booking Creation, MongoDB Documents & Session Isolation]');
  let createdBookingId = null;
  let createdTicketNumber = null;
  let createdReference = null;

  await test('POST /api/bookings creates booking in MongoDB with HMAC-SHA256 token', async () => {
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
    createdReference = data.booking.booking_reference;
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

  // 5. MongoDB Unique Constraints & Schema Integrity Tests
  console.log('\n[Suite 5: MongoDB Unique Constraints & Index Enforcement]');
  await test('MongoDB enforces unique constraint on booking_reference (duplicate rejected)', async () => {
    const bookingsCol = getCollection('bookings');
    let duplicateRejected = false;
    try {
      await bookingsCol.insertOne({
        id: `bkg-dup-${Date.now()}`,
        session_id: 'test-collision',
        booking_reference: createdReference, // duplicate
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

  await test('MongoDB enforces unique constraint on ticket_number (duplicate rejected)', async () => {
    const bookingsCol = getCollection('bookings');
    let duplicateRejected = false;
    try {
      await bookingsCol.insertOne({
        id: `bkg-dup2-${Date.now()}`,
        session_id: 'test-collision',
        booking_reference: `MTTS-NEW-${Date.now()}`,
        ticket_number: createdTicketNumber, // duplicate
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

  // 6. Turnstile Scanner Hardware Verification & Document Updates
  console.log('\n[Suite 6: Turnstile Scanner Verification & Atomic Updates]');
  await test('POST /api/scanner/verify unlocks gate (OPEN) for valid issued ticket and increments scans_count', async () => {
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

    // Verify scans_count incremented in MongoDB
    const bookingsCol = getCollection('bookings');
    const doc = await bookingsCol.findOne({ id: createdBookingId });
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

  // 7. Cancellation & Tariff Refund Policy
  console.log('\n[Suite 7: Cancellation, 80% Refund & MongoDB Document Updates]');
  await test('POST /api/bookings/:id/cancel issues 80% tariff refund and revokes ticket in MongoDB', async () => {
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

    // Verify document in MongoDB reflects Cancelled status
    const bookingsCol = getCollection('bookings');
    const doc = await bookingsCol.findOne({ id: createdBookingId });
    assert.strictEqual(doc.status, 'Cancelled');
    assert.strictEqual(doc.refund_status, 'PROCESSED');
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

  // 8. Audit Logging in MongoDB
  console.log('\n[Suite 8: Turnstile Audit Event Log Persistence (MongoDB)]');
  await test('GET /api/scanner/events returns scan audit documents from scan_events collection', async () => {
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
  await closeDb();

  // 9. Production-Safety & Fail-Closed Invariant Verification
  console.log('\n[Suite 9: Production-Safety & Fail-Closed Invariants]');
  
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
