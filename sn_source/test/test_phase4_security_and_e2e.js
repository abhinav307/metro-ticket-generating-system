/**
 * test_phase4_security_and_e2e.js
 * 
 * Test Suite 11: Security Controls, Role Bounds & Full End-to-End Acceptance Journey
 * Validates Work Package 4 & 6:
 * - IDOR prevention and attachment authorization
 * - Role boundary enforcement (passenger, approver, scanner, admin)
 * - Complete 13-step booking-to-verification lifecycle workflow
 */
require('./mock_glide_env');
var fs = require('fs');
var path = require('path');
var assert = require('assert');

eval(fs.readFileSync(path.join(__dirname, '../data/MetroDataSeeder.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroFareCalculator.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroNumberFormatter.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroQRGenerator.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroTicketGenerator.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroRefundCalculator.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroBookingService.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroPortalService.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroScannerVerificationService.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroNotificationService.js'), 'utf8'));

global.x_mtts = {
    MetroBookingService: MetroBookingService,
    MetroPortalService: MetroPortalService,
    MetroRefundCalculator: MetroRefundCalculator,
    MetroFareCalculator: MetroFareCalculator,
    MetroTicketGenerator: MetroTicketGenerator,
    MetroNumberFormatter: MetroNumberFormatter,
    MetroQRGenerator: MetroQRGenerator,
    MetroScannerVerificationService: MetroScannerVerificationService,
    MetroNotificationService: MetroNotificationService
};

function runSecurityAndE2ETests() {
    console.log('\n--- RUNNING SUITE: Security Controls & Full End-to-End Acceptance Tests ---');
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

    // Seed master transit data
    var seeder = new MetroDataSeeder();
    seeder.runSeed();

    var portalService = new MetroPortalService();
    var ticketGen = new MetroTicketGenerator();
    var scannerService = new MetroScannerVerificationService();
    var notifService = new MetroNotificationService();

    // Test 1: IDOR Protection: Passenger A cannot view Passenger B's booking
    it('Security IDOR: Passenger A cannot view or retrieve Passenger B booking details', function() {
        // Create booking for Passenger B
        var bkgB = new GlideRecord('x_mtts_booking_ticket');
        bkgB.initialize();
        bkgB.setValue('booking_reference', 'BKG-20261015-USR-B');
        bkgB.setValue('passenger', 'usr_passenger_b');
        bkgB.setValue('status', 'Pending');
        var bkgBId = bkgB.insert();

        // Simulate session as Passenger A
        gs.setUserID('usr_passenger_a');
        gs.setUserRoles(['snc_internal']);

        var detailsRes = portalService.getBookingDetailsAndQR(bkgBId);
        assert.strictEqual(detailsRes.success, false);
        assert.strictEqual(detailsRes.error, 'UNAUTHORIZED');
    });

    // Test 2: Attachment Authorization: Passenger A cannot access Passenger B's QR SVG attachment
    it('Security: Attachment retrieval enforces ownership; foreign attachment denied', function() {
        var bkgB = new GlideRecord('x_mtts_booking_ticket');
        bkgB.initialize();
        bkgB.setValue('booking_reference', 'BKG-20261015-ATTACH-B');
        bkgB.setValue('passenger', 'usr_passenger_b');
        bkgB.setValue('status', 'Approved');
        var bId = bkgB.insert();

        var fulfillRes = ticketGen.generateTicket(bId);
        var attachId = fulfillRes.attachmentId;

        // Passenger A attempts to fetch details and SVG
        gs.setUserID('usr_passenger_a');
        var details = portalService.getBookingDetailsAndQR(bId);
        assert.strictEqual(details.success, false);
        assert.strictEqual(details.svgContent, undefined);
    });

    // Test 3: Financial Snapshot Protection: Passenger cannot modify fare snapshot
    it('Security: Financial snapshot fields (total_fare, unit_fare) cannot be modified by passengers', function() {
        var aclDefs = JSON.parse(fs.readFileSync(path.join(__dirname, '../security/acl_definitions.json'), 'utf8'));
        var fareWriteAcl = aclDefs.find(function(a) { return a.name === 'x_mtts_booking_ticket.total_fare'; });
        assert.ok(fareWriteAcl, 'Missing ACL for x_mtts_booking_ticket.total_fare');
        assert.deepStrictEqual(fareWriteAcl.roles, ['admin'], 'Field total_fare write must be restricted strictly to admin');
    });

    // Test 4: Scanner Role Bounds: Scanner client cannot modify bookings or read other data
    it('Security: Scanner role x_mtts.scanner is strictly restricted from updating bookings or reading audit logs', function() {
        var aclDefs = JSON.parse(fs.readFileSync(path.join(__dirname, '../security/acl_definitions.json'), 'utf8'));
        var bookingWriteAcl = aclDefs.find(function(a) { return a.name === 'x_mtts_booking_ticket' && a.operation === 'write'; });
        assert.ok(bookingWriteAcl.roles.indexOf('x_mtts.scanner') === -1, 'Scanner role must NOT have write access to bookings');

        var scanLogReadAcl = aclDefs.find(function(a) { return a.name === 'x_mtts_scan_event' && a.operation === 'read'; });
        assert.ok(scanLogReadAcl.roles.indexOf('x_mtts.scanner') === -1, 'Scanner role must NOT have read access to scan event history');
    });

    // Test 5: Approver Role Bounds: Station Approvers cannot edit ticket numbers or token hashes
    it('Security: Approvers cannot edit ticket_number or qr_token_hash fields', function() {
        var aclDefs = JSON.parse(fs.readFileSync(path.join(__dirname, '../security/acl_definitions.json'), 'utf8'));
        var tktNumAcl = aclDefs.find(function(a) { return a.name === 'x_mtts_booking_ticket.ticket_number'; });
        assert.deepStrictEqual(tktNumAcl.roles, ['admin']);

        var hashAcl = aclDefs.find(function(a) { return a.name === 'x_mtts_booking_ticket.qr_token_hash'; });
        assert.deepStrictEqual(hashAcl.roles, ['admin']);
    });

    // Test 6: Zero Secret/Token Leakage Across Entire Application
    it('Confidentiality: Raw tokens and token hashes are never exposed in portal or notification outputs', function() {
        gs.setUserID('usr_test_commuter_001');
        gs.setProperty('x_mtts.notifications.enabled', 'true'); // isolated test enablement
        var bkgGr = new GlideRecord('x_mtts_booking_ticket');
        bkgGr.initialize();
        bkgGr.setValue('booking_reference', 'BKG-20261015-CONF-01');
        bkgGr.setValue('passenger', 'usr_test_commuter_001');
        bkgGr.setValue('status', 'Approved');
        var bkgId = bkgGr.insert();

        var fulfill = ticketGen.generateTicket(bkgId);
        var details = portalService.getBookingDetailsAndQR(bkgId);
        assert.strictEqual(details.success, true);
        assert.strictEqual(details.details.qr_token_hash, undefined);
        assert.strictEqual(details.details.rawToken, undefined);

        // Check notification payload
        var notifRes = notifService.dispatch('x_mtts.ticket.generated', bkgGr);
        assert.strictEqual(notifRes.success, true);
        var lastEvt = global._events[global._events.length - 1];
        assert.strictEqual(lastEvt.parm2.indexOf(fulfill.rawToken), -1);
        assert.strictEqual(lastEvt.parm2.indexOf('qr_token_hash'), -1);
    });

    // Test 7: Complete 13-Step End-to-End Acceptance Flow
    it('End-to-End Workflow: Submission -> Approval -> Fulfillment -> QR Delivery -> Scanner Verification -> Revocation Rejection', function() {
        // Step 1: Commuter submits catalog booking
        gs.setUserID('usr_commuter_e2e');
        gs.setUserName('commuter.e2e');
        var ritmId = 'ritm_e2e_' + Date.now();

        var bkgService = new MetroBookingService();
        var stnOrigin = 'STN-01'; // Central Terminus
        var stnDest = 'STN-05';   // Airport Junction (Distance: 14.2 km)

        var bkgGr = new GlideRecord('x_mtts_booking_ticket');
        bkgGr.initialize();
        bkgGr.setValue('request_item', ritmId);
        bkgGr.setValue('passenger', 'usr_commuter_e2e');
        bkgGr.setValue('source_station', stnOrigin);
        bkgGr.setValue('destination_station', stnDest);
        bkgGr.setValue('travel_date', '2026-10-20');
        bkgGr.setValue('passenger_count', 2);
        bkgGr.setValue('ticket_type', 'SINGLE');
        bkgGr.setValue('status', 'Pending');
        bkgGr.setValue('booking_reference', 'BKG-20261020-E2E-01');
        bkgGr.setValue('total_fare', 71.00);
        var e2eBookingId = bkgGr.insert();
        assert.ok(e2eBookingId, 'Failed to create e2e booking record');

        // Step 2: Submission notification queued
        notifService.clearDispatchCache();
        var subNotif = notifService.dispatch('x_mtts.booking.submitted', bkgGr);
        assert.strictEqual(subNotif.success, true);
        assert.strictEqual(subNotif.code, 'EVENT_QUEUED');

        // Step 3: Approval request notification queued
        var apprNotif = notifService.dispatch('x_mtts.approval.requested', bkgGr, { approvalId: 'appr_e2e_01' });
        assert.strictEqual(apprNotif.success, true);

        // Step 4: Station Approver approves booking
        bkgGr.get(e2eBookingId);
        bkgGr.setValue('status', 'Approved');
        bkgGr.update();
        assert.strictEqual(bkgGr.getValue('status'), 'Approved');

        // Step 5: Approval advisory notification queued
        var apprdNotif = notifService.dispatch('x_mtts.booking.approved', bkgGr);
        assert.strictEqual(apprdNotif.success, true);

        // Step 6: Fulfillment engine generates ticket & QR
        var fulfillOutcome = ticketGen.generateTicket(e2eBookingId);
        assert.strictEqual(fulfillOutcome.success, true);
        var issuedTicketNumber = fulfillOutcome.ticketNumber;
        var issuedBearerToken = fulfillOutcome.rawToken;
        assert.ok(issuedTicketNumber.startsWith('TKT-20261020-'));
        assert.strictEqual(issuedBearerToken.length, 32);

        // Step 7: Ticket generated notification queued
        bkgGr.get(e2eBookingId);
        assert.strictEqual(bkgGr.getValue('status'), 'Generated');
        var genNotif = notifService.dispatch('x_mtts.ticket.generated', bkgGr);
        assert.strictEqual(genNotif.success, true);

        // Step 8: Commuter views ticket in portal
        var portalView = portalService.getBookingDetailsAndQR(e2eBookingId);
        assert.strictEqual(portalView.success, true);
        assert.strictEqual(portalView.details.ticketReady, true);
        assert.ok(portalView.details.svgContent.indexOf('<svg') !== -1);

        // Step 9: Turnstile scanner invokes Scripted REST API with authentic token
        var scanReq = {
            body: {
                data: {
                    ticket_number: issuedTicketNumber,
                    token: issuedBearerToken,
                    scanner_id: 'TURNSTILE-GATE-04',
                    station_code: 'STN-01'
                }
            },
            getHeader: function(h) { return null; },
            getClientIP: function() { return '10.200.1.50'; },
            _mockUserRoles: ['x_mtts.scanner']
        };
        var scanResStatus = 200;
        var scanRes = {
            setStatus: function(s) { scanResStatus = s; },
            getStatus: function() { return scanResStatus; }
        };

        var verifyResult = scannerService.processRestRequest(scanReq, scanRes);
        assert.strictEqual(scanRes.getStatus(), 200);
        assert.strictEqual(verifyResult.result, 'VALID');
        assert.strictEqual(verifyResult.code, 'VALID');
        assert.strictEqual(verifyResult.ticket_number, issuedTicketNumber);

        // Step 10: Scan audit event verified in x_mtts_scan_event
        var scanEventGr = new GlideRecord('x_mtts_scan_event');
        scanEventGr.addQuery('ticket_number', issuedTicketNumber);
        scanEventGr.query();
        assert.ok(scanEventGr.next());
        assert.strictEqual(scanEventGr.getValue('verification_outcome'), 'VALID');
        assert.strictEqual(scanEventGr.getValue('scanner_id'), 'TURNSTILE-GATE-04');

        // Step 11: Passenger cancellation under UNCONFIGURED policy fails safely
        var cancelOutcome = portalService.cancelBookingWithPolicyGate(e2eBookingId);
        assert.strictEqual(cancelOutcome.success, false);
        assert.strictEqual(cancelOutcome.error, 'POLICY_UNCONFIGURED');

        // Step 12: Administrative Rejection fallback simulated
        bkgGr.get(e2eBookingId);
        bkgGr.setValue('status', 'Cancelled');
        bkgGr.setValue('cancellation_reason', 'Administrative Rejection: Station closure');
        bkgGr.update();
        assert.strictEqual(bkgGr.getValue('status'), 'Cancelled');

        // Step 13: Scanner re-checks cancelled ticket -> REJECTED with HTTP 403
        var recheckReq = {
            body: {
                data: {
                    ticket_number: issuedTicketNumber,
                    token: issuedBearerToken,
                    scanner_id: 'TURNSTILE-GATE-04'
                }
            },
            getHeader: function(h) { return null; },
            getClientIP: function() { return '10.200.1.50'; },
            _mockUserRoles: ['x_mtts.scanner']
        };
        var recheckResStatus = 200;
        var recheckRes = {
            setStatus: function(s) { recheckResStatus = s; },
            getStatus: function() { return recheckResStatus; }
        };

        var recheckOutcome = scannerService.processRestRequest(recheckReq, recheckRes);
        assert.strictEqual(recheckRes.getStatus(), 403);
        assert.strictEqual(recheckOutcome.result, 'REJECTED');
        assert.strictEqual(recheckOutcome.code, 'TICKET_CANCELLED_OR_INVALID');
    });

    // Test 8: Schema & Reference Reconciliation (Fix 5 Acceptance Criteria)
    it('Schema & Reference Reconciliation: Canonical tables, schema integrity and scanner access bounds (Fix 5)', function() {
        var schemaFiles = fs.readdirSync(path.join(__dirname, '../schema'));
        var expectedSchemas = [
            'x_mtts_station.xml',
            'x_mtts_route.xml',
            'x_mtts_ticket_type.xml',
            'x_mtts_fare_rule.xml',
            'x_mtts_booking_ticket.xml',
            'x_mtts_daily_sequence.xml',
            'x_mtts_scan_event.xml'
        ];
        for (var i = 0; i < expectedSchemas.length; i++) {
            assert.ok(schemaFiles.indexOf(expectedSchemas[i]) !== -1, 'Missing schema definition: ' + expectedSchemas[i]);
        }
        // Verify outdated separate booking / ticket schemas do NOT exist
        assert.strictEqual(schemaFiles.indexOf('x_mtts_booking.xml'), -1, 'Outdated x_mtts_booking.xml must not exist');
        assert.strictEqual(schemaFiles.indexOf('x_mtts_ticket.xml'), -1, 'Outdated x_mtts_ticket.xml must not exist');

        // Verify ACLs
        var aclDefs = JSON.parse(fs.readFileSync(path.join(__dirname, '../security/acl_definitions.json'), 'utf8'));
        var bookingReadAcl = aclDefs.find(function(a) { return a.name === 'x_mtts_booking_ticket' && a.operation === 'read'; });
        assert.ok(bookingReadAcl.roles.indexOf('x_mtts.scanner') === -1, 'Scanner role must NOT have table read on bookings');

        var scanEventReadAcl = aclDefs.find(function(a) { return a.name === 'x_mtts_scan_event' && a.operation === 'read'; });
        assert.deepStrictEqual(scanEventReadAcl.roles, ['x_mtts.admin'], 'Scan event read must be restricted strictly to admin');

        // Teardown: ensure notifications.enabled is restored to default false
        gs.setProperty('x_mtts.notifications.enabled', 'false');
    });

    console.log('Result: ' + passed + ' Passed, 0 Failed.\n');
    return { passed: passed, failed: 0 };
}

if (require.main === module) {
    runSecurityAndE2ETests();
}

module.exports = { runTests: runSecurityAndE2ETests };
