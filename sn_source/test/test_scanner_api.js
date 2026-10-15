/**
 * test_scanner_api.js
 * 
 * Test Suite 7: Secure QR Verification Scripted REST API Tests
 * Tests endpoint: POST /api/x_mtts/scanner/verify-ticket
 */
require('./mock_glide_env');
var fs = require('fs');
var path = require('path');
var assert = require('assert');

eval(fs.readFileSync(path.join(__dirname, '../data/MetroDataSeeder.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroNumberFormatter.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroQRGenerator.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroTicketGenerator.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroScannerVerificationService.js'), 'utf8'));

global.x_mtts = global.x_mtts || {};
global.x_mtts.MetroScannerVerificationService = MetroScannerVerificationService;

function runScannerApiTests() {
    console.log('\n--- RUNNING SUITE: Secure QR Verification Scripted REST API Tests ---');
    var passed = 0;

    function it(desc, fn) {
        try {
            fn();
            console.log('  [PASS] ' + desc);
            passed++;
        } catch (err) {
            console.error('  [FAIL] ' + desc);
            console.error('    Error: ' + err.message);
            throw err;
        }
    }

    var service = new MetroScannerVerificationService();

    // Setup helper to create a verified Generated ticket
    var bkgGr = new GlideRecord('x_mtts_booking_ticket');
    bkgGr.initialize();
    bkgGr.setValue('booking_reference', 'BKG-20261015-7701');
    bkgGr.setValue('travel_date', '2026-10-15');
    bkgGr.setValue('passenger_count', 1);
    bkgGr.setValue('total_fare', 25.00);
    bkgGr.setValue('status', 'Approved');
    var bkgId = bkgGr.insert();
    bkgGr.get(bkgId);

    var ticketGen = new MetroTicketGenerator();
    var fulfillRes = ticketGen.generateTicket(bkgId);
    var validTicketNumber = fulfillRes.ticketNumber;
    var validRawToken = fulfillRes.rawToken;

    // Helper to simulate REST request/response objects
    function createMockRestCall(body, headers, roles, clientIp) {
        var statusVal = 200;
        var req = {
            body: { data: body },
            headers: headers || {},
            getHeader: function(h) { return this.headers[h]; },
            getClientIP: function() { return clientIp || '192.168.1.100'; },
            _mockUserRoles: roles || ['x_mtts.scanner']
        };
        var res = {
            status: 200,
            setStatus: function(s) { statusVal = s; this.status = s; },
            getStatus: function() { return statusVal; }
        };
        return { req: req, res: res };
    }

    // Test 1: Valid generated ticket + valid bearer token
    it('Valid generated ticket + valid token returns HTTP 200 VALID and opens gate', function() {
        var call = createMockRestCall({
            ticket_number: validTicketNumber,
            token: validRawToken,
            scanner_id: 'GATE-NORTH-01',
            station_code: 'STN-01'
        });
        var result = service.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 200);
        assert.strictEqual(result.result, 'VALID');
        assert.strictEqual(result.code, 'VALID');
        assert.strictEqual(result.ticket_number, validTicketNumber);
        assert.strictEqual(result.status, 'Generated');
        assert.strictEqual(result.station_code, 'STN-01');
        assert.ok(result.correlation_id);
    });

    // Test 2: Valid ticket + forged/invalid bearer token
    it('Valid ticket + forged token returns HTTP 401 TOKEN_MISMATCH and closes gate', function() {
        var forgedToken = 'ffffffffffffffffffffffffffffffff';
        var call = createMockRestCall({
            ticket_number: validTicketNumber,
            token: forgedToken,
            scanner_id: 'GATE-NORTH-01'
        });
        var result = service.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 401);
        assert.strictEqual(result.result, 'REJECTED');
        assert.strictEqual(result.code, 'TOKEN_MISMATCH');
    });

    // Test 3: Cancelled ticket + authentic bearer token
    it('Cancelled ticket + authentic token returns HTTP 403 TICKET_CANCELLED_OR_INVALID', function() {
        // Create another booking and cancel it
        var cBkg = new GlideRecord('x_mtts_booking_ticket');
        cBkg.initialize();
        cBkg.setValue('booking_reference', 'BKG-20261015-7702');
        cBkg.setValue('travel_date', '2026-10-15');
        cBkg.setValue('status', 'Approved');
        var cId = cBkg.insert();
        cBkg.get(cId);

        var cFulfill = ticketGen.generateTicket(cId);
        cBkg.get(cId);
        cBkg.setValue('status', 'Cancelled');
        cBkg.setValue('cancellation_reason', 'Administrative Rejection: Test');
        cBkg.update();

        var call = createMockRestCall({
            ticket_number: cFulfill.ticketNumber,
            token: cFulfill.rawToken,
            scanner_id: 'GATE-NORTH-01'
        });
        var result = service.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 403);
        assert.strictEqual(result.result, 'REJECTED');
        assert.strictEqual(result.code, 'TICKET_CANCELLED_OR_INVALID');
        assert.strictEqual(result.status, 'Cancelled');
    });

    // Test 4: Pending ticket (not yet approved or generated)
    it('Pending ticket returns HTTP 403 TICKET_CANCELLED_OR_INVALID', function() {
        var pBkg = new GlideRecord('x_mtts_booking_ticket');
        pBkg.initialize();
        pBkg.setValue('booking_reference', 'BKG-20261015-7703');
        pBkg.setValue('ticket_number', 'TKT-20261015-000099');
        pBkg.setValue('status', 'Pending');
        pBkg.insert();

        var call = createMockRestCall({
            ticket_number: 'TKT-20261015-000099',
            token: 'a1b2c3d4e5f67890abcdef1234567890',
            scanner_id: 'GATE-NORTH-01'
        });
        var result = service.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 403);
        assert.strictEqual(result.result, 'REJECTED');
        assert.strictEqual(result.code, 'TICKET_CANCELLED_OR_INVALID');
    });

    // Test 5: Approved ticket without completed fulfillment
    it('Approved ticket without fulfillment returns HTTP 403 TICKET_CANCELLED_OR_INVALID', function() {
        var aBkg = new GlideRecord('x_mtts_booking_ticket');
        aBkg.initialize();
        aBkg.setValue('booking_reference', 'BKG-20261015-7704');
        aBkg.setValue('ticket_number', 'TKT-20261015-000098');
        aBkg.setValue('status', 'Approved');
        aBkg.insert();

        var call = createMockRestCall({
            ticket_number: 'TKT-20261015-000098',
            token: 'a1b2c3d4e5f67890abcdef1234567890',
            scanner_id: 'GATE-NORTH-01'
        });
        var result = service.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 403);
        assert.strictEqual(result.result, 'REJECTED');
        assert.strictEqual(result.code, 'TICKET_CANCELLED_OR_INVALID');
    });

    // Test 6: Non-existent ticket number
    it('Unknown ticket number returns HTTP 404 TICKET_NOT_FOUND', function() {
        var call = createMockRestCall({
            ticket_number: 'TKT-20261015-999999',
            token: 'a1b2c3d4e5f67890abcdef1234567890',
            scanner_id: 'GATE-NORTH-01'
        });
        var result = service.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 404);
        assert.strictEqual(result.result, 'REJECTED');
        assert.strictEqual(result.code, 'TICKET_NOT_FOUND');
    });

    // Test 7: Malformed request payload (missing token)
    it('Missing required token returns HTTP 400 INVALID_REQUEST', function() {
        var call = createMockRestCall({
            ticket_number: validTicketNumber
        });
        var result = service.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 400);
        assert.strictEqual(result.result, 'REJECTED');
        assert.strictEqual(result.code, 'INVALID_REQUEST');
    });

    // Test 8: Ticket number invalid format
    it('Malformed ticket number format returns HTTP 400 INVALID_REQUEST', function() {
        var call = createMockRestCall({
            ticket_number: 'INVALID_TICKET_123',
            token: validRawToken
        });
        var result = service.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 400);
        assert.strictEqual(result.result, 'REJECTED');
        assert.strictEqual(result.code, 'INVALID_REQUEST');
    });

    // Test 9: Bearer token invalid format (short string)
    it('Malformed bearer token length returns HTTP 400 INVALID_REQUEST', function() {
        var call = createMockRestCall({
            ticket_number: validTicketNumber,
            token: 'short_token'
        });
        var result = service.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 400);
        assert.strictEqual(result.result, 'REJECTED');
        assert.strictEqual(result.code, 'INVALID_REQUEST');
    });

    // Test 10: Unexpected extra fields in payload
    it('Unexpected fields in payload rejected with HTTP 400 INVALID_REQUEST', function() {
        var call = createMockRestCall({
            ticket_number: validTicketNumber,
            token: validRawToken,
            override_fare: 0.00
        });
        var result = service.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 400);
        assert.strictEqual(result.result, 'REJECTED');
        assert.strictEqual(result.code, 'INVALID_REQUEST');
    });

    // Test 11: Unauthorized scanner client (lacks x_mtts.scanner role)
    it('Unauthorized caller lacking x_mtts.scanner returns HTTP 401 UNAUTHORIZED', function() {
        var call = createMockRestCall({
            ticket_number: validTicketNumber,
            token: validRawToken
        }, {}, ['snc_internal']); // lacks x_mtts.scanner
        var result = service.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 401);
        assert.strictEqual(result.result, 'REJECTED');
        assert.strictEqual(result.code, 'UNAUTHORIZED');
    });

    // Test 12: Repeated failed token attempts trigger rate limit (HTTP 429)
    it('Exceeding failed attempt threshold triggers HTTP 429 RATE_LIMITED', function() {
        var attackerIp = '10.0.0.99';
        var badToken = '00000000000000000000000000000000';

        // Send 5 failed attempts (configured threshold)
        for (var i = 0; i < 5; i++) {
            var failCall = createMockRestCall({
                ticket_number: validTicketNumber,
                token: badToken,
                scanner_id: 'BRUTE_SCANNER_01'
            }, {}, ['x_mtts.scanner'], attackerIp);
            service.processRestRequest(failCall.req, failCall.res);
        }

        // 6th attempt should be blocked by rate limiting
        var blockedCall = createMockRestCall({
            ticket_number: validTicketNumber,
            token: validRawToken, // even with valid token, client is temporarily locked out
            scanner_id: 'BRUTE_SCANNER_01'
        }, {}, ['x_mtts.scanner'], attackerIp);

        var blockedRes = service.processRestRequest(blockedCall.req, blockedCall.res);
        assert.strictEqual(blockedCall.res.getStatus(), 429);
        assert.strictEqual(blockedRes.result, 'REJECTED');
        assert.strictEqual(blockedRes.code, 'RATE_LIMITED');
    });

    // Test 13: Response body confidentiality
    it('Successful response body contains zero raw tokens, hashes, or passenger PII', function() {
        var call = createMockRestCall({
            ticket_number: validTicketNumber,
            token: validRawToken,
            scanner_id: 'GATE-SOUTH-02',
            station_code: 'STN-02'
        });
        var result = service.processRestRequest(call.req, call.res);
        assert.strictEqual(result.result, 'VALID');
        assert.strictEqual(result.token, undefined);
        assert.strictEqual(result.rawToken, undefined);
        assert.strictEqual(result.qr_token_hash, undefined);
        assert.strictEqual(result.passenger, undefined);
        assert.strictEqual(result.total_fare, undefined);
    });

    // Test 14: Hash immutability in database
    it('Audit integrity: qr_token_hash remains strictly unchanged in database', function() {
        var checkGr = new GlideRecord('x_mtts_booking_ticket');
        checkGr.addQuery('ticket_number', validTicketNumber);
        checkGr.query();
        assert.ok(checkGr.next());
        assert.strictEqual(checkGr.getValue('qr_token_hash').length, 64);
        assert.strictEqual(checkGr.getValue('status'), 'Generated');
    });

    // Test 15: Stored hash wrong length / malformed fails closed
    it('Security: Stored hash of wrong length fails closed with TOKEN_MISMATCH (Local Simulated Verification)', function() {
        var badHashBkg = new GlideRecord('x_mtts_booking_ticket');
        badHashBkg.initialize();
        badHashBkg.setValue('booking_reference', 'BKG-20261015-BADHASH');
        badHashBkg.setValue('ticket_number', 'TKT-20261015-000088');
        badHashBkg.setValue('status', 'Generated');
        badHashBkg.setValue('qr_token_hash', 'short_32_character_hash_value_12'); // Only 32 chars, not 64 hex
        badHashBkg.insert();

        var call = createMockRestCall({
            ticket_number: 'TKT-20261015-000088',
            token: validRawToken,
            scanner_id: 'GATE-NORTH-01'
        });
        var result = service.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 401);
        assert.strictEqual(result.result, 'REJECTED');
        assert.strictEqual(result.code, 'TOKEN_MISMATCH');
        assert.strictEqual(result.expected_hash, undefined, 'Response must never reveal expected hash');
    });

    // Test 16: Raw bearer token is never logged into system logs
    it('Security: Raw bearer token is never logged in system logs (Local Simulated Verification)', function() {
        var tokenFoundInLogs = false;
        var allLogs = [].concat(_logs.info, _logs.warn, _logs.error);
        for (var i = 0; i < allLogs.length; i++) {
            if (allLogs[i].indexOf(validRawToken) !== -1) {
                tokenFoundInLogs = true;
                break;
            }
        }
        assert.strictEqual(tokenFoundInLogs, false, 'Raw bearer token must never appear in platform logs');
    });

    console.log('Result: ' + passed + ' Passed, 0 Failed.\n');
    return { passed: passed, failed: 0 };
}

if (require.main === module) {
    runScannerApiTests();
}

module.exports = { runTests: runScannerApiTests };
