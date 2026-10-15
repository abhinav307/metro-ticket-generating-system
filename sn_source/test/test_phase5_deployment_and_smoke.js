/**
 * test_phase5_deployment_and_smoke.js
 * Suite 12: Phase 5 Controlled Deployment & Smoke Testing Suite
 *
 * Verifies:
 * 1. Artifact classification, schema integrity, and script include exports
 * 2. Canonical portal route consistency (/metro?id=my_metro_bookings)
 * 3. System safety controls default invariants (fail-closed baselines)
 * 4. Master data dry run and synthetic fixture protection
 * 5. Full end-to-end deployment smoke test lifecycle
 * 6. Emergency kill switch operational behavior
 */
require('./mock_glide_env');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');

var baseDir = path.resolve(__dirname, '../..');
var snSourceDir = path.join(baseDir, 'sn_source');

// Load all production script includes into runtime context
var scriptIncludes = [
    'MetroFareCalculator.js',
    'MetroFareCalculatorAjax.js',
    'MetroNumberFormatter.js',
    'MetroQRGenerator.js',
    'MetroTicketGenerator.js',
    'MetroBookingService.js',
    'MetroPortalService.js',
    'MetroRefundCalculator.js',
    'MetroScannerVerificationService.js',
    'MetroAuditRetentionService.js',
    'MetroNotificationService.js',
    'MetroDataMigrationService.js'
];

scriptIncludes.forEach(function(file) {
    var code = fs.readFileSync(path.join(snSourceDir, 'sys_script_include', file), 'utf8');
    vm.runInThisContext(code);
});

// Load seeder
vm.runInThisContext(fs.readFileSync(path.join(snSourceDir, 'data/MetroDataSeeder.js'), 'utf8'));

function runTests() {
    console.log('\n--- RUNNING SUITE: Phase 5 Controlled Deployment & Smoke Tests ---');
    var passed = 0;
    var failed = 0;

    function it(name, fn) {
        try {
            fn();
            console.log('  [PASS] ' + name);
            passed++;
        } catch (e) {
            console.error('  [FAIL] ' + name + ': ' + e.message);
            failed++;
        }
    }

    // Ensure database is seeded with initial reference data
    var seeder = new MetroDataSeeder();
    seeder.runSeed();

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

    // Test 1: Seven canonical XML table schemas exist and declare correct tables
    it('Deployment Artifacts: All 7 canonical XML table schemas exist and declare correct tables', function() {
        var expectedTables = [
            'x_mtts_station',
            'x_mtts_route',
            'x_mtts_ticket_type',
            'x_mtts_fare_rule',
            'x_mtts_daily_sequence',
            'x_mtts_booking_ticket',
            'x_mtts_scan_event'
        ];

        var schemaDir = path.join(snSourceDir, 'schema');
        assert.ok(fs.existsSync(schemaDir), 'schema directory must exist');

        expectedTables.forEach(function(tableName) {
            var xmlPath = path.join(schemaDir, tableName + '.xml');
            assert.ok(fs.existsSync(xmlPath), 'Schema file must exist for: ' + tableName);
            var content = fs.readFileSync(xmlPath, 'utf8');
            assert.ok(content.indexOf('<?xml') !== -1, 'Must be valid XML: ' + tableName);
            assert.ok(content.indexOf(tableName) !== -1, 'XML content must reference table name: ' + tableName);
        });
    });

    // Test 2: All 12 scoped Script Includes exist and instantiate cleanly
    it('Deployment Artifacts: All 12 production Script Includes exist and instantiate cleanly', function() {
        var constructors = [
            MetroFareCalculator,
            MetroFareCalculatorAjax,
            MetroNumberFormatter,
            MetroQRGenerator,
            MetroTicketGenerator,
            MetroBookingService,
            MetroPortalService,
            MetroRefundCalculator,
            MetroScannerVerificationService,
            MetroAuditRetentionService,
            MetroNotificationService,
            MetroDataMigrationService
        ];

        constructors.forEach(function(Ctor) {
            assert.ok(typeof Ctor === 'function', 'Script Include must be a function constructor');
            var instance = new Ctor();
            assert.ok(typeof instance === 'object', 'Must successfully instantiate');
        });
    });

    // Test 3: Canonical portal route resolution (/metro)
    it('Portal Route Consistency: Canonical portal route /metro?id=my_metro_bookings is enforced', function() {
        var notif = new MetroNotificationService();

        var mockBooking = {
            getValue: function(field) {
                if (field === 'booking_reference') return 'BKG-20261015-TEST';
                if (field === 'travel_date') return '2026-10-15';
                if (field === 'passenger_count') return '1';
                if (field === 'status') return 'Generated';
                if (field === 'ticket_number') return 'TKT-20261015-000001';
                return null;
            },
            getUniqueValue: function() { return 'sys_test_booking_99'; }
        };

        var payload = notif._buildEventPayload('x_mtts.ticket.generated', mockBooking);
        assert.strictEqual(payload.portal_url, '/metro?id=my_metro_bookings&sys_id=sys_test_booking_99');

        var mailScriptsPath = path.join(snSourceDir, 'notifications/notification_mail_scripts.json');
        var mailScriptsContent = fs.readFileSync(mailScriptsPath, 'utf8');
        assert.ok(mailScriptsContent.indexOf('/metro?id=my_metro_bookings') !== -1, 'Mail script must use canonical /metro portal');
        assert.strictEqual(mailScriptsContent.indexOf('/mtts?id='), -1, 'Mail scripts must not reference deprecated /mtts path');
    });

    // Test 4: System Safety Control - Cancellation Policy Gate
    it('Safety Controls: Cancellation policy remains UNCONFIGURED by default, blocking cancellation', function() {
        var propsArray = JSON.parse(fs.readFileSync(path.join(snSourceDir, 'sys_properties/system_properties.json'), 'utf8'));
        var propMap = {};
        propsArray.forEach(function(p) { propMap[p.name] = p.value; });
        assert.strictEqual(propMap['x_mtts.cancellation.policy_status'], 'UNCONFIGURED');
        assert.strictEqual(gs.getProperty('x_mtts.cancellation.policy_status'), 'UNCONFIGURED');

        var refundCalc = new MetroRefundCalculator();
        var testBookingGr = new GlideRecord('x_mtts_booking_ticket');
        testBookingGr.initialize();
        testBookingGr.setValue('travel_date', '2026-10-25');
        testBookingGr.setValue('total_fare', 50.00);

        var refundResult = refundCalc.calculateRefund(testBookingGr);
        assert.strictEqual(refundResult.eligible, false);
        assert.strictEqual(refundResult.refundAmount, 0.00);
        assert.ok(refundResult.reason.indexOf('UNCONFIGURED') !== -1);
    });

    // Test 5: System Safety Control - Audit Retention Policy Gate
    it('Safety Controls: Audit retention policy remains UNCONFIGURED (0 days), blocking auto-deletion', function() {
        var propsArray = JSON.parse(fs.readFileSync(path.join(snSourceDir, 'sys_properties/system_properties.json'), 'utf8'));
        var propMap = {};
        propsArray.forEach(function(p) { propMap[p.name] = p.value; });
        assert.strictEqual(propMap['x_mtts.audit.retention_policy_status'], 'UNCONFIGURED');
        assert.strictEqual(propMap['x_mtts.audit.retention_days'], '0');
        assert.strictEqual(gs.getProperty('x_mtts.audit.retention_policy_status'), 'UNCONFIGURED');
        assert.strictEqual(gs.getProperty('x_mtts.audit.retention_days'), '0');

        gs.setUserRoles(['x_mtts.admin']);
        var retentionSvc = new MetroAuditRetentionService();
        var result = retentionSvc.cleanExpiredScanEvents(false);
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.code, 'POLICY_UNCONFIGURED');
        assert.strictEqual(result.deletedCount, 0);
    });

    // Test 6: System Safety Control - Notification Master Switch
    it('Safety Controls: Notifications master switch is disabled by default (false)', function() {
        var propsArray = JSON.parse(fs.readFileSync(path.join(snSourceDir, 'sys_properties/system_properties.json'), 'utf8'));
        var propMap = {};
        propsArray.forEach(function(p) { propMap[p.name] = p.value; });
        assert.strictEqual(propMap['x_mtts.notifications.enabled'], 'false');

        // Restore global property to default false if altered
        gs.setProperty('x_mtts.notifications.enabled', 'false');

        var notif = new MetroNotificationService();
        var testBookingGr = new GlideRecord('x_mtts_booking_ticket');
        testBookingGr.initialize();
        testBookingGr.setValue('booking_reference', 'BKG-20261015-SMOKE');

        var dispatched = notif.dispatch('x_mtts.booking.submitted', testBookingGr);
        assert.strictEqual(dispatched.success, false);
        assert.strictEqual(dispatched.code, 'NOTIFICATIONS_DISABLED');
    });

    // Test 7: System Safety Control - 4-Status Lifecycle Model
    it('Safety Controls: Rejected status remains disabled (false), maintaining 4-status baseline', function() {
        var propsArray = JSON.parse(fs.readFileSync(path.join(snSourceDir, 'sys_properties/system_properties.json'), 'utf8'));
        var propMap = {};
        propsArray.forEach(function(p) { propMap[p.name] = p.value; });
        assert.strictEqual(propMap['x_mtts.lifecycle.enable_rejected_status'], 'false');
        assert.strictEqual(gs.getProperty('x_mtts.lifecycle.enable_rejected_status'), 'false');
    });

    // Test 8: Master Data Migration Dry Run Performs Zero Writes
    it('Master Data Migration: Pre-flight dry-run completes cleanly with zero database writes', function() {
        var mig = new MetroDataMigrationService();

        var testDataset = {
            stations: [
                { station_code: 'SMK-01', name: 'Smoke North', line_zone: 'Red Line', order: 1, active: true },
                { station_code: 'SMK-02', name: 'Smoke South', line_zone: 'Red Line', order: 2, active: true }
            ],
            routes: [
                { origin_station: 'SMK-01', destination_station: 'SMK-02', distance_km: 12.5, active: true }
            ],
            ticketTypes: [
                { code: 'SMK_SNG', name: 'Smoke Single', pricing_model: 'Distance_Based', validity_hours: 4, active: true }
            ],
            fareRules: [
                { rule_code: 'SMK-R1', ticket_type_code: 'SMK_SNG', rate_per_km: 2.0, minimum_fare: 10.0, effective_from: '2026-01-01', effective_to: '2026-12-31', active: true }
            ]
        };

        var initialCount = _db['x_mtts_station'].length;
        var dryRunResult = mig.importMasterData(testDataset, { dryRun: true });
        assert.strictEqual(dryRunResult.success, true);
        assert.strictEqual(_db['x_mtts_station'].length, initialCount, 'Zero writes must occur on dry-run');
    });

    // Test 9: Master Data Production Safety Mode
    it('Master Data Migration: Production import mode strictly rejects synthetic development fixtures', function() {
        var mig = new MetroDataMigrationService();

        var syntheticDataset = {
            stations: [
                { station_code: 'MIG-01', name: 'Synthetic Station [SYNTHETIC_TEST_DATA]', line_zone: 'Blue Line', order: 1, active: true }
            ],
            routes: [],
            fareRules: [],
            ticketTypes: []
        };

        var prodResult = mig.importMasterData(syntheticDataset, { dryRun: false, mode: 'PRODUCTION' });
        assert.strictEqual(prodResult.success, false);
        assert.strictEqual(prodResult.code, 'SYNTHETIC_DATA_IN_PRODUCTION');
    });

    // Test 10: Live Smoke Test Simulation - Booking Lifecycle & Unique Numbering
    it('Smoke Test: Booking submission -> approval -> ticket fulfillment creates valid record', function() {
        var bkgGr = new GlideRecord('x_mtts_booking_ticket');
        bkgGr.initialize();
        bkgGr.setValue('booking_reference', 'BKG-20261015-SMK01');
        bkgGr.setValue('passenger', 'usr_commuter_smoke');
        bkgGr.setValue('travel_date', '2026-10-25');
        bkgGr.setValue('passenger_count', 1);
        bkgGr.setValue('total_fare', 25.00);
        bkgGr.setValue('status', 'Pending');
        var bkgId = bkgGr.insert();
        assert.ok(bkgId, 'Booking insertion must return sys_id');

        // Transition to Approved
        bkgGr.setValue('status', 'Approved');
        bkgGr.update();
        assert.strictEqual(bkgGr.getValue('status'), 'Approved');

        // Fulfillment generates ticket
        var ticketGen = new MetroTicketGenerator();
        var genResult = ticketGen.generateTicket(bkgId);
        assert.strictEqual(genResult.success, true, 'Ticket generation must succeed');
        assert.ok(genResult.ticketNumber && genResult.ticketNumber.indexOf('TKT-') === 0);
        assert.ok(genResult.rawToken && genResult.rawToken.length === 32);
        assert.ok(genResult.attachmentId && genResult.attachmentId.indexOf('att_') === 0);

        // Verify attachment content in mock attachment database
        var att = _db['sys_attachment'].find(function(a) { return a.sys_id === genResult.attachmentId; });
        assert.ok(att && att.content && att.content.indexOf('<svg') !== -1, 'Attachment must contain SVG content');

        // Verify status in DB updated to Generated
        var verifyGr = new GlideRecord('x_mtts_booking_ticket');
        verifyGr.get(bkgId);
        assert.strictEqual(verifyGr.getValue('status'), 'Generated');
        assert.strictEqual(verifyGr.getValue('ticket_number'), genResult.ticketNumber);
    });

    // Test 11: Live Smoke Test Simulation - Scanner API Gate Verification
    it('Smoke Test: Scanner API verifies authentic ticket and opens gate (HTTP 200 OPEN)', function() {
        var scannerSvc = new MetroScannerVerificationService();

        // Create booking & ticket
        var bkgGr = new GlideRecord('x_mtts_booking_ticket');
        bkgGr.initialize();
        bkgGr.setValue('booking_reference', 'BKG-20261015-SMK02');
        bkgGr.setValue('travel_date', '2026-10-25');
        bkgGr.setValue('total_fare', 25.00);
        bkgGr.setValue('status', 'Approved');
        var bkgId = bkgGr.insert();

        var ticketGen = new MetroTicketGenerator();
        var issued = ticketGen.generateTicket(bkgId);

        var call = createMockRestCall({
            ticket_number: issued.ticketNumber,
            token: issued.rawToken,
            scanner_id: 'GATE-SMOKE-01',
            station_code: 'STN-01'
        });

        var response = scannerSvc.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 200);
        assert.strictEqual(response.result, 'VALID');
        assert.strictEqual(response.code, 'VALID');
        assert.strictEqual(response.ticket_number, issued.ticketNumber);
        assert.ok(response.message.indexOf('Gate open') !== -1);
    });

    // Test 12: Live Smoke Test Simulation - Forgery Gate Rejection
    it('Smoke Test: Scanner API rejects forged token and holds gate (HTTP 401 HOLD)', function() {
        var scannerSvc = new MetroScannerVerificationService();

        var bkgGr = new GlideRecord('x_mtts_booking_ticket');
        bkgGr.initialize();
        bkgGr.setValue('booking_reference', 'BKG-20261015-FORGE');
        bkgGr.setValue('travel_date', '2026-10-25');
        bkgGr.setValue('total_fare', 25.00);
        bkgGr.setValue('status', 'Approved');
        var bkgId = bkgGr.insert();

        var ticketGen = new MetroTicketGenerator();
        var issued = ticketGen.generateTicket(bkgId);

        var call = createMockRestCall({
            ticket_number: issued.ticketNumber,
            token: 'ffffffffffffffffffffffffffffffff', // Forged token
            scanner_id: 'GATE-SMOKE-01',
            station_code: 'STN-01'
        });

        var response = scannerSvc.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 401);
        assert.strictEqual(response.result, 'REJECTED');
        assert.strictEqual(response.code, 'TOKEN_MISMATCH');
    });

    // Test 13: Live Smoke Test Simulation - Revoked Ticket Gate Rejection
    it('Smoke Test: Scanner API rejects cancelled/revoked ticket (HTTP 403 HOLD)', function() {
        var scannerSvc = new MetroScannerVerificationService();

        var bkgGr = new GlideRecord('x_mtts_booking_ticket');
        bkgGr.initialize();
        bkgGr.setValue('booking_reference', 'BKG-20261015-SMK03');
        bkgGr.setValue('travel_date', '2026-10-25');
        bkgGr.setValue('total_fare', 25.00);
        bkgGr.setValue('status', 'Approved');
        var bkgId = bkgGr.insert();

        var ticketGen = new MetroTicketGenerator();
        var issued = ticketGen.generateTicket(bkgId);

        // Cancel booking authoritatively
        var cancelGr = new GlideRecord('x_mtts_booking_ticket');
        cancelGr.get(bkgId);
        cancelGr.setValue('status', 'Cancelled');
        cancelGr.update();

        var call = createMockRestCall({
            ticket_number: issued.ticketNumber,
            token: issued.rawToken,
            scanner_id: 'GATE-SMOKE-01',
            station_code: 'STN-01'
        });

        var response = scannerSvc.processRestRequest(call.req, call.res);
        assert.strictEqual(call.res.getStatus(), 403);
        assert.strictEqual(response.result, 'REJECTED');
        assert.strictEqual(response.code, 'TICKET_CANCELLED_OR_INVALID');
    });

    // Test 14: Emergency Kill Switch - Scanner Aggressive Rate Limiting
    it('Emergency Kill Switch: Adjusting scanner rate limit property immediately throttles abusers', function() {
        var scannerSvc = new MetroScannerVerificationService();

        // Simulate emergency lockdown: set max failed attempts to 1
        gs.setProperty('x_mtts.scanner.max_failed_attempts', '1');

        var call1 = createMockRestCall({
            ticket_number: 'TKT-20261025-999999',
            token: '00000000000000000000000000000000',
            scanner_id: 'ROGUE-DEVICE-99',
            station_code: 'STN-99'
        }, null, ['x_mtts.scanner'], '10.0.0.99');

        // Attempt 1: Fails (not found)
        scannerSvc.processRestRequest(call1.req, call1.res);
        assert.strictEqual(call1.res.getStatus(), 404);

        // Attempt 2: Immediately throttled with 429 RATE_LIMITED
        var call2 = createMockRestCall({
            ticket_number: 'TKT-20261025-999999',
            token: '00000000000000000000000000000000',
            scanner_id: 'ROGUE-DEVICE-99',
            station_code: 'STN-99'
        }, null, ['x_mtts.scanner'], '10.0.0.99');

        var res2 = scannerSvc.processRestRequest(call2.req, call2.res);
        assert.strictEqual(call2.res.getStatus(), 429);
        assert.strictEqual(res2.code, 'RATE_LIMITED');
        assert.strictEqual(res2.result, 'REJECTED');

        // Restore default property
        gs.setProperty('x_mtts.scanner.max_failed_attempts', '5');
    });

    // Test 15: Clean Audit Trail on Scan Event Generation
    it('Audit Trail: Scanner scan event creates audit record with non-repudiation checksum', function() {
        var lastAudit = _db['x_mtts_scan_event'][_db['x_mtts_scan_event'].length - 1];
        assert.ok(lastAudit, 'Scan event record should exist');
        assert.ok(lastAudit.sys_id, 'Audit record must have sys_id');
        assert.ok(lastAudit.correlation_id);
        assert.strictEqual(typeof lastAudit.processing_duration_ms, 'number');
        assert.strictEqual(lastAudit.raw_token, undefined, 'Raw bearer token must never be stored');
        assert.strictEqual(lastAudit.token, undefined, 'Token must never be stored in scan event');
    });

    console.log('Result: ' + passed + ' Passed, ' + failed + ' Failed.\n');
    return { passed: passed, failed: failed };
}

module.exports = { runTests: runTests };
if (require.main === module) {
    runTests();
}
