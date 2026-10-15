/**
 * test_notifications.js
 * 
 * Test Suite 9: Automated Event-Driven Email Notifications Tests
 * Validates Work Package 3: All 7 lifecycle events, duplicate suppression, HTML rendering, zero token leakage.
 */
require('./mock_glide_env');
var fs = require('fs');
var path = require('path');
var assert = require('assert');

eval(fs.readFileSync(path.join(__dirname, '../data/MetroDataSeeder.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroNotificationService.js'), 'utf8'));

function runNotificationTests() {
    console.log('\n--- RUNNING SUITE: Automated Email Notifications Tests ---');
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

    var service = new MetroNotificationService();

    // Helper booking
    var bkgGr = new GlideRecord('x_mtts_booking_ticket');
    bkgGr.initialize();
    bkgGr.setValue('booking_reference', 'BKG-20261015-9901');
    bkgGr.setValue('travel_date', '2026-10-15');
    bkgGr.setValue('passenger_count', 2);
    bkgGr.setValue('total_fare', 40.00);
    bkgGr.setValue('status', 'Pending');
    bkgGr.setValue('sys_created_by', 'passenger.john');
    var bkgId = bkgGr.insert();
    bkgGr.get(bkgId);

    // Test 0: Default Safety State - Outbound Notifications Disabled
    it('Master property switch x_mtts.notifications.enabled=false halts dispatching by default (Fix 3 Baseline)', function() {
        service.clearDispatchCache();
        global._events = [];

        assert.strictEqual(gs.getProperty('x_mtts.notifications.enabled'), 'false', 'Default property must be false');
        var res = service.dispatch('x_mtts.booking.submitted', bkgGr);
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.code, 'NOTIFICATIONS_DISABLED');
        assert.strictEqual(global._events.length, 0);

        // Enable temporarily for isolated test execution
        gs.setProperty('x_mtts.notifications.enabled', 'true');
    });

    // Test 1: Booking Submitted Event (Under Isolated Test Enablement)
    it('Booking submitted queues x_mtts.booking.submitted without premature ticket number (Isolated Test)', function() {
        service.clearDispatchCache();
        global._events = [];

        var res = service.dispatch('x_mtts.booking.submitted', bkgGr);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.code, 'EVENT_QUEUED');

        assert.strictEqual(global._events.length, 1);
        var evt = global._events[0];
        assert.strictEqual(evt.name, 'x_mtts.booking.submitted');
        assert.strictEqual(evt.parm1, 'passenger.john');

        var payload = JSON.parse(evt.parm2);
        assert.strictEqual(payload.booking_reference, 'BKG-20261015-9901');
        assert.strictEqual(parseFloat(payload.total_fare), 40.00);
        assert.strictEqual(payload.currency, 'USD');
        assert.strictEqual(payload.ticket_number, undefined, 'Ticket number must NOT be present in submitted event');
    });

    // Test 2: Approval Requested Event
    it('Approval requested queues x_mtts.approval.requested targeting Metro Station Approvers', function() {
        service.clearDispatchCache();
        global._events = [];

        var res = service.dispatch('x_mtts.approval.requested', bkgGr, { approvalId: 'appr_12345' });
        assert.strictEqual(res.success, true);

        var evt = global._events[0];
        assert.strictEqual(evt.name, 'x_mtts.approval.requested');
        assert.strictEqual(evt.parm1, 'Metro Station Approvers');

        var payload = JSON.parse(evt.parm2);
        assert.ok(payload.approval_url.indexOf('appr_12345') !== -1);
    });

    // Test 3: Booking Approved Event
    it('Booking approved queues x_mtts.booking.approved advising fulfillment in progress', function() {
        service.clearDispatchCache();
        global._events = [];

        var res = service.dispatch('x_mtts.booking.approved', bkgGr);
        assert.strictEqual(res.success, true);

        var evt = global._events[0];
        assert.strictEqual(evt.name, 'x_mtts.booking.approved');
        var payload = JSON.parse(evt.parm2);
        assert.ok(payload.notice.indexOf('in progress') !== -1);
    });

    // Test 4: Ticket Generated Event
    it('Ticket generated queues x_mtts.ticket.generated with issued ticket number and attachment reference', function() {
        service.clearDispatchCache();
        global._events = [];

        bkgGr.setValue('status', 'Generated');
        bkgGr.setValue('ticket_number', 'TKT-20261015-000001');
        bkgGr.setValue('qr_attachment', 'att_qr_556677');
        bkgGr.update();

        var res = service.dispatch('x_mtts.ticket.generated', bkgGr);
        assert.strictEqual(res.success, true);

        var evt = global._events[0];
        assert.strictEqual(evt.name, 'x_mtts.ticket.generated');
        var payload = JSON.parse(evt.parm2);
        assert.strictEqual(payload.ticket_number, 'TKT-20261015-000001');
        assert.strictEqual(payload.attachment_id, 'att_qr_556677');
        assert.ok(payload.portal_url.indexOf(bkgId) !== -1);
    });

    // Test 5: Booking Declined Event (Administrative Rejection)
    it('Booking declined queues x_mtts.booking.declined with operational decline notice', function() {
        service.clearDispatchCache();
        global._events = [];

        bkgGr.setValue('status', 'Cancelled');
        bkgGr.setValue('cancellation_reason', 'Administrative Rejection: Station closure for maintenance');
        bkgGr.update();

        var res = service.dispatch('x_mtts.booking.declined', bkgGr, { reason: 'Station closure for maintenance' });
        assert.strictEqual(res.success, true);

        var evt = global._events[0];
        assert.strictEqual(evt.name, 'x_mtts.booking.declined');
        var payload = JSON.parse(evt.parm2);
        assert.strictEqual(payload.decline_reason, 'Station closure for maintenance');
        assert.ok(payload.notice.indexOf('declined by Station Operations') !== -1);
    });

    // Test 6: Booking Cancelled Event
    it('Booking cancelled queues x_mtts.booking.cancelled with refund status details', function() {
        service.clearDispatchCache();
        global._events = [];

        bkgGr.setValue('cancellation_reason', 'Passenger schedule conflict');
        bkgGr.setValue('refund_amount', 0.00);
        bkgGr.update();

        var res = service.dispatch('x_mtts.booking.cancelled', bkgGr);
        assert.strictEqual(res.success, true);

        var evt = global._events[0];
        assert.strictEqual(evt.name, 'x_mtts.booking.cancelled');
        var payload = JSON.parse(evt.parm2);
        assert.strictEqual(payload.cancellation_reason, 'Passenger schedule conflict');
        assert.strictEqual(payload.refund_status, 'POLICY_UNCONFIGURED');
    });

    // Test 7: Operational Failure Event
    it('Operational failure queues x_mtts.operational.failure to Metro Operations Administrators', function() {
        service.clearDispatchCache();
        global._events = [];

        var res = service.dispatch('x_mtts.operational.failure', bkgGr, {
            errorCode: 'SEQUENCE_EXHAUSTION',
            errorMessage: 'Daily ticket sequence exceeded max bounds.'
        });
        assert.strictEqual(res.success, true);

        var evt = global._events[0];
        assert.strictEqual(evt.name, 'x_mtts.operational.failure');
        assert.strictEqual(evt.parm1, 'Metro Operations Administrators');
        var payload = JSON.parse(evt.parm2);
        assert.strictEqual(payload.error_code, 'SEQUENCE_EXHAUSTION');
    });

    // Test 8: Idempotency & duplicate suppression
    it('Idempotency: Repeated notification dispatches for same event and booking are suppressed', function() {
        service.clearDispatchCache();
        global._events = [];

        var res1 = service.dispatch('x_mtts.booking.submitted', bkgGr);
        assert.strictEqual(res1.code, 'EVENT_QUEUED');

        var res2 = service.dispatch('x_mtts.booking.submitted', bkgGr);
        assert.strictEqual(res2.code, 'SUPPRESSED_DUPLICATE');
        assert.strictEqual(global._events.length, 1, 'Duplicate event must not be added to event queue');
    });

    // Test 9: Master property switch disables notifications
    it('Master property switch x_mtts.notifications.enabled=false halts dispatching', function() {
        service.clearDispatchCache();
        global._events = [];
        gs.setProperty('x_mtts.notifications.enabled', 'false');

        var res = service.dispatch('x_mtts.booking.submitted', bkgGr);
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.code, 'NOTIFICATIONS_DISABLED');
        assert.strictEqual(global._events.length, 0);

        gs.setProperty('x_mtts.notifications.enabled', 'true');
    });

    // Test 10: HTML email rendering contains zero raw tokens, hashes, or passwords
    it('HTML email rendering renders valid markup with zero raw token or secret leakage', function() {
        var samplePayload = {
            booking_reference: 'BKG-20261015-9901',
            ticket_number: 'TKT-20261015-000001',
            travel_date: '2026-10-15',
            passenger_count: '2',
            total_fare: '40.00',
            portal_url: '/metro?id=my_metro_bookings&sys_id=12345'
        };

        var html = service.renderEmailBody('x_mtts.ticket.generated', samplePayload);
        assert.ok(html.indexOf('Metro Transit Authority') !== -1);
        assert.ok(html.indexOf('TKT-20261015-000001') !== -1);
        assert.ok(html.indexOf('View Ticket in Portal') !== -1);
        assert.strictEqual(html.indexOf('qr_token_hash'), -1);
        assert.strictEqual(html.indexOf('bearer_token'), -1);
        assert.strictEqual(html.indexOf('password'), -1);
    });

    // Test 11: Multi-client delivery compatibility notice in generated email
    it('Delivery compatibility: Ticket ready email includes dual-delivery (attachment + portal link)', function() {
        var samplePayload = {
            booking_reference: 'BKG-20261015-9901',
            ticket_number: 'TKT-20261015-000001',
            portal_url: '/metro?id=my_metro_bookings&sys_id=12345'
        };
        var html = service.renderEmailBody('x_mtts.ticket.generated', samplePayload);
        assert.ok(html.indexOf('Attached directly to this email as a vector SVG file') !== -1);
        assert.ok(html.indexOf('Available anytime on your mobile device via the Service Portal') !== -1);

        // Teardown: Restore default baseline setting (disabled)
        gs.setProperty('x_mtts.notifications.enabled', 'false');
    });

    console.log('Result: ' + passed + ' Passed, 0 Failed.\n');
    return { passed: passed, failed: 0 };
}

if (require.main === module) {
    runNotificationTests();
}

module.exports = { runTests: runNotificationTests };
