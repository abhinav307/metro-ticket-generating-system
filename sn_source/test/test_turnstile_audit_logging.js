/**
 * test_turnstile_audit_logging.js
 * 
 * Test Suite 8: Turnstile Verification Audit Logging Tests (x_mtts_scan_event)
 * Validates Work Package 2: Structured audit logging, zero token leakage, ACL compliance.
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

function runTurnstileAuditLoggingTests() {
    console.log('\n--- RUNNING SUITE: Turnstile Verification Audit Logging Tests ---');
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

    // Create a generated ticket
    var bkgGr = new GlideRecord('x_mtts_booking_ticket');
    bkgGr.initialize();
    bkgGr.setValue('booking_reference', 'BKG-20261015-8801');
    bkgGr.setValue('travel_date', '2026-10-15');
    bkgGr.setValue('status', 'Approved');
    var bkgId = bkgGr.insert();

    var ticketGen = new MetroTicketGenerator();
    var fulfillRes = ticketGen.generateTicket(bkgId);
    var ticketNum = fulfillRes.ticketNumber;
    var rawTok = fulfillRes.rawToken;

    function callRest(body, headers, roles, clientIp) {
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
        return service.processRestRequest(req, res);
    }

    // Clear any previous events
    global._db['x_mtts_scan_event'] = [];

    // Test 1: Successful verification creates audit record
    it('Successful scan records an audit event with outcome VALID', function() {
        callRest({
            ticket_number: ticketNum,
            token: rawTok,
            scanner_id: 'GATE-01',
            station_code: 'STN-01'
        });

        var scanGr = new GlideRecord('x_mtts_scan_event');
        scanGr.addQuery('ticket_number', ticketNum);
        scanGr.query();

        assert.ok(scanGr.next());
        assert.strictEqual(scanGr.getValue('verification_outcome'), 'VALID');
        assert.strictEqual(scanGr.getValue('scanner_id'), 'GATE-01');
        assert.strictEqual(scanGr.getValue('station_code'), 'STN-01');
        assert.strictEqual(scanGr.getValue('booking_ticket'), bkgId);
        assert.ok(!scanGr.getValue('error_code'));
    });

    // Test 2: Forged token records audit record with TOKEN_MISMATCH
    it('Forged token scan records an audit event with outcome TOKEN_MISMATCH', function() {
        callRest({
            ticket_number: ticketNum,
            token: '11111111111111111111111111111111',
            scanner_id: 'GATE-02',
            station_code: 'STN-01'
        });

        var scanGr = new GlideRecord('x_mtts_scan_event');
        scanGr.addQuery('verification_outcome', 'TOKEN_MISMATCH');
        scanGr.query();

        assert.ok(scanGr.next());
        assert.strictEqual(scanGr.getValue('scanner_id'), 'GATE-02');
        assert.strictEqual(scanGr.getValue('error_code'), 'FORGED_OR_INVALID_TOKEN');
    });

    // Test 3: Cancelled ticket scan records audit record with TICKET_CANCELLED_OR_INVALID
    it('Cancelled ticket scan records audit event with outcome TICKET_CANCELLED_OR_INVALID', function() {
        var cBkg = new GlideRecord('x_mtts_booking_ticket');
        cBkg.initialize();
        cBkg.setValue('booking_reference', 'BKG-20261015-8802');
        cBkg.setValue('travel_date', '2026-10-15');
        cBkg.setValue('status', 'Approved');
        var cId = cBkg.insert();

        var cFulfill = ticketGen.generateTicket(cId);
        cBkg.get(cId);
        cBkg.setValue('status', 'Cancelled');
        cBkg.update();

        callRest({
            ticket_number: cFulfill.ticketNumber,
            token: cFulfill.rawToken,
            scanner_id: 'GATE-03',
            station_code: 'STN-03'
        });

        var scanGr = new GlideRecord('x_mtts_scan_event');
        scanGr.addQuery('ticket_number', cFulfill.ticketNumber);
        scanGr.query();

        assert.ok(scanGr.next());
        assert.strictEqual(scanGr.getValue('verification_outcome'), 'TICKET_CANCELLED_OR_INVALID');
        assert.strictEqual(scanGr.getValue('error_code'), 'TICKET_REVOKED_OR_CANCELLED');
    });

    // Test 4: Unknown ticket scan records audit event with TICKET_NOT_FOUND
    it('Unknown ticket number records audit event with outcome TICKET_NOT_FOUND', function() {
        callRest({
            ticket_number: 'TKT-20261015-888888',
            token: 'a1b2c3d4e5f67890abcdef1234567890',
            scanner_id: 'GATE-04'
        });

        var scanGr = new GlideRecord('x_mtts_scan_event');
        scanGr.addQuery('ticket_number', 'TKT-20261015-888888');
        scanGr.query();

        assert.ok(scanGr.next());
        assert.strictEqual(scanGr.getValue('verification_outcome'), 'TICKET_NOT_FOUND');
        assert.strictEqual(scanGr.getValue('error_code'), 'RECORD_NOT_FOUND');
    });

    // Test 5: Unauthorized caller records audit event with UNAUTHORIZED
    it('Unauthorized scan request records audit event with outcome UNAUTHORIZED', function() {
        callRest({
            ticket_number: ticketNum,
            token: rawTok,
            scanner_id: 'UNAUTH-GATE'
        }, {}, ['snc_external']);

        var scanGr = new GlideRecord('x_mtts_scan_event');
        scanGr.addQuery('verification_outcome', 'UNAUTHORIZED');
        scanGr.query();

        assert.ok(scanGr.next());
        assert.strictEqual(scanGr.getValue('error_code'), 'AUTH_REQUIRED');
    });

    // Test 6: Audit records contain correlation_id, timestamp, and duration >= 0
    it('All audit records capture correlation_id, scan_timestamp, and execution duration', function() {
        var scanGr = new GlideRecord('x_mtts_scan_event');
        scanGr.query();
        var count = 0;
        while (scanGr.next()) {
            count++;
            assert.ok(scanGr.getValue('correlation_id'), 'Missing correlation_id');
            assert.ok(scanGr.getValue('scan_timestamp'), 'Missing scan_timestamp');
            var duration = scanGr.getValue('processing_duration_ms');
            assert.ok(duration !== undefined && duration !== null && duration >= 0, 'Invalid duration: ' + duration);
        }
        assert.ok(count >= 5, 'Expected at least 5 audit records, found ' + count);
    });

    // Test 7: Strict confidentiality: zero raw tokens or passwords stored in scan event table
    it('Confidentiality: x_mtts_scan_event table contains zero raw bearer tokens or passwords', function() {
        var allEvents = global._db['x_mtts_scan_event'];
        for (var i = 0; i < allEvents.length; i++) {
            var evt = allEvents[i];
            assert.strictEqual(evt.token, undefined);
            assert.strictEqual(evt.raw_token, undefined);
            assert.strictEqual(evt.bearer_token, undefined);
            assert.strictEqual(evt.password, undefined);
            assert.strictEqual(evt.qr_token_hash, undefined);

            // Double check values
            for (var key in evt) {
                if (typeof evt[key] === 'string') {
                    assert.ok(evt[key].indexOf(rawTok) === -1, 'Raw bearer token found in field ' + key);
                }
            }
        }
    });

    // Test 8: Security & ACL: Commuters and station approvers denied read access to audit logs
    it('Security ACL: Passengers and station approvers are denied read access to x_mtts_scan_event', function() {
        var aclDefs = JSON.parse(fs.readFileSync(path.join(__dirname, '../security/acl_definitions.json'), 'utf8'));
        var scanAcls = aclDefs.filter(function(a) { return a.name === 'x_mtts_scan_event'; });

        var readAcl = scanAcls.find(function(a) { return a.operation === 'read'; });
        assert.ok(readAcl, 'Missing read ACL for x_mtts_scan_event');
        assert.deepStrictEqual(readAcl.roles, ['x_mtts.admin'], 'Read ACL must be restricted to x_mtts.admin');

        var createAcl = scanAcls.find(function(a) { return a.operation === 'create'; });
        assert.ok(createAcl, 'Missing create ACL for x_mtts_scan_event');
        assert.ok(createAcl.roles.indexOf('x_mtts.scanner') !== -1, 'Create ACL must allow x_mtts.scanner');

        var writeAcl = scanAcls.find(function(a) { return a.operation === 'write'; });
        assert.ok(writeAcl, 'Missing write ACL for x_mtts_scan_event');
        assert.deepStrictEqual(writeAcl.roles, ['admin'], 'Write ACL must be locked to admin (immutable log)');
    });

    eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroAuditRetentionService.js'), 'utf8'));

    // Test 9: Unconfigured retention prevents deletion; cleanup is inactive by default
    it('Unconfigured retention prevents deletion and cleanup is inactive by default (Fix 2)', function() {
        gs.setUserRoles(['x_mtts.admin']);
        gs.setProperty('x_mtts.audit.retention_policy_status', 'UNCONFIGURED');
        gs.setProperty('x_mtts.audit.retention_days', '0');

        var retentionService = new MetroAuditRetentionService();
        var res = retentionService.cleanExpiredScanEvents(false);
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.code, 'POLICY_UNCONFIGURED');
        assert.strictEqual(res.deletedCount, 0);
    });

    // Test 10: Old records are not deleted when policy approval is missing
    it('Old records are not deleted when retention policy approval is missing (Fix 2)', function() {
        var oldDate = new GlideDateTime();
        oldDate.addDaysUTC(-120);

        var oldGr = new GlideRecord('x_mtts_scan_event');
        oldGr.initialize();
        oldGr.setValue('ticket_number', 'TKT-20260615-000001');
        oldGr.setValue('scan_timestamp', oldDate);
        oldGr.setValue('verification_outcome', 'VALID');
        oldGr.setValue('scanner_id', 'OLD_GATE_01');
        var oldId = oldGr.insert();

        var retentionService = new MetroAuditRetentionService();
        var res = retentionService.cleanExpiredScanEvents(false);
        assert.strictEqual(res.deletedCount, 0);

        // Verify record still exists
        var checkGr = new GlideRecord('x_mtts_scan_event');
        assert.ok(checkGr.get(oldId), 'Old scan event must remain preserved while policy is unconfigured');
    });

    // Test 11: An enabled test policy affects only eligible test records (dry-run and active)
    it('An enabled test policy affects only eligible test records under isolated test override (Fix 2)', function() {
        var retentionService = new MetroAuditRetentionService();
        
        // Isolate test configuration
        gs.setProperty('x_mtts.audit.retention_policy_status', 'ACTIVE');
        gs.setProperty('x_mtts.audit.retention_days', '90');

        // Dry-run execution
        var dryRes = retentionService.cleanExpiredScanEvents(true);
        assert.strictEqual(dryRes.success, true);
        assert.strictEqual(dryRes.code, 'DRY_RUN');
        assert.ok(dryRes.eligibleCount >= 1);
        assert.strictEqual(dryRes.deletedCount, 0);

        // Active purge execution
        var runRes = retentionService.cleanExpiredScanEvents(false);
        assert.strictEqual(runRes.success, true);
        assert.strictEqual(runRes.code, 'CLEANUP_EXECUTED');
        assert.ok(runRes.deletedCount >= 1);

        // Reset governance properties to default safety baseline immediately
        gs.setProperty('x_mtts.audit.retention_policy_status', 'UNCONFIGURED');
        gs.setProperty('x_mtts.audit.retention_days', '0');
    });

    // Test 12: Records outside retention window (recent records) are preserved
    it('Records outside the retention window are strictly preserved (Fix 2)', function() {
        var recentDate = new GlideDateTime();
        recentDate.addDaysUTC(-5); // Only 5 days old

        var recentGr = new GlideRecord('x_mtts_scan_event');
        recentGr.initialize();
        recentGr.setValue('ticket_number', 'TKT-20261010-000002');
        recentGr.setValue('scan_timestamp', recentDate);
        recentGr.setValue('verification_outcome', 'VALID');
        recentGr.setValue('scanner_id', 'RECENT_GATE_01');
        var recentId = recentGr.insert();

        // Run retention with 90 days active in isolated test
        gs.setProperty('x_mtts.audit.retention_policy_status', 'ACTIVE');
        gs.setProperty('x_mtts.audit.retention_days', '90');

        var retentionService = new MetroAuditRetentionService();
        retentionService.cleanExpiredScanEvents(false);

        // Verify recent record is NOT deleted
        var checkGr = new GlideRecord('x_mtts_scan_event');
        assert.ok(checkGr.get(recentId), 'Recent record within retention window must NOT be deleted');

        // Reset properties
        gs.setProperty('x_mtts.audit.retention_policy_status', 'UNCONFIGURED');
        gs.setProperty('x_mtts.audit.retention_days', '0');
    });

    // Test 13: Cleanup cannot be invoked by passengers or scanner clients
    it('Security: Cleanup process cannot be invoked by passengers or scanner clients (Fix 2)', function() {
        var retentionService = new MetroAuditRetentionService();

        // Try as commuter
        gs.setUserRoles(['x_mtts.user']);
        var passRes = retentionService.cleanExpiredScanEvents(false);
        assert.strictEqual(passRes.success, false);
        assert.strictEqual(passRes.code, 'UNAUTHORIZED');

        // Try as turnstile scanner
        gs.setUserRoles(['x_mtts.scanner']);
        var scanRes = retentionService.cleanExpiredScanEvents(false);
        assert.strictEqual(scanRes.success, false);
        assert.strictEqual(scanRes.code, 'UNAUTHORIZED');

        // Reset roles to admin
        gs.setUserRoles(['x_mtts.admin']);
    });

    // Test 14: Operation logs safe administrative audit information
    it('Audit trail: Retention operation logs safe administrative audit info (Fix 2)', function() {
        var retentionService = new MetroAuditRetentionService();
        gs.setProperty('x_mtts.audit.retention_policy_status', 'ACTIVE');
        gs.setProperty('x_mtts.audit.retention_days', '30');

        var initLogCount = _logs.info.length;
        retentionService.cleanExpiredScanEvents(false);

        var foundAdminLog = false;
        for (var i = initLogCount; i < _logs.info.length; i++) {
            if (_logs.info[i].indexOf('Administrative cleanup executed') !== -1 ||
                _logs.info[i].indexOf('MetroAuditRetentionService') !== -1) {
                foundAdminLog = true;
                break;
            }
        }
        assert.ok(foundAdminLog, 'Expected administrative audit log entry upon retention execution');

        // Reset properties
        gs.setProperty('x_mtts.audit.retention_policy_status', 'UNCONFIGURED');
        gs.setProperty('x_mtts.audit.retention_days', '0');
    });

    console.log('Result: ' + passed + ' Passed, 0 Failed.\n');
    return { passed: passed, failed: 0 };
}

if (require.main === module) {
    runTurnstileAuditLoggingTests();
}

module.exports = { runTests: runTurnstileAuditLoggingTests };
