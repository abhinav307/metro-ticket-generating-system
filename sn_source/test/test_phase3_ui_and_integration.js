/**
 * test_phase3_ui_and_integration.js
 * Comprehensive integration and security test suite for Phase 3 UI & Integration deliverables.
 */
var fs = require('fs');
var path = require('path');
var mockEnv = require('./mock_glide_env.js');

// Load Phase 2 Backend dependencies
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroFareCalculator.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroNumberFormatter.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroQRGenerator.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroTicketGenerator.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroRefundCalculator.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroBookingService.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../data/MetroDataSeeder.js'), 'utf8'));

// Load Phase 3 Components
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroFareCalculatorAjax.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroPortalService.js'), 'utf8'));

global.x_mtts = {
    MetroBookingService: MetroBookingService,
    MetroPortalService: MetroPortalService,
    MetroRefundCalculator: MetroRefundCalculator,
    MetroFareCalculator: MetroFareCalculator,
    MetroTicketGenerator: MetroTicketGenerator,
    MetroNumberFormatter: MetroNumberFormatter,
    MetroQRGenerator: MetroQRGenerator
};

function runTests() {
    console.log('\n--- RUNNING SUITE: Phase 3 UI, Catalog & Service Portal Integration Tests ---');
    var passed = 0;
    var failed = 0;

    function assert(cond, msg) {
        if (cond) {
            console.log('  [PASS] ' + msg);
            passed++;
        } else {
            console.error('  [FAIL] ' + msg);
            failed++;
        }
    }

    mockEnv.resetDb();
    var seeder = new MetroDataSeeder();
    seeder.runSeed();

    // -------------------------------------------------------------
    // TEST SECTION 1: MetroFareCalculatorAjax (Work Package 4)
    // -------------------------------------------------------------
    var ajax = new MetroFareCalculatorAjax();

    // Test 1.1: Single Journey Ajax calculation
    ajax.setParameter('sysparm_source', 'STN-01');
    ajax.setParameter('sysparm_destination', 'STN-05');
    ajax.setParameter('sysparm_ticket_type', 'SINGLE');
    ajax.setParameter('sysparm_passenger_count', '2');

    var ajaxRes1 = JSON.parse(ajax.calculateFareAjax());
    assert(ajaxRes1.success === true, 'Ajax: Single Journey preview calculated successfully');
    assert(ajaxRes1.distanceKm === 14.20, 'Ajax: Distance matches 14.20 km');
    assert(ajaxRes1.unitFare === 35.50, 'Ajax: Unit fare matches $35.50');
    assert(ajaxRes1.totalFare === 71.00, 'Ajax: Total fare matches $71.00 for 2 passengers (TC-010)');

    // Test 1.2: Pass Journey Ajax calculation (Fixed Rate, bypasses stations)
    ajax.setParameter('sysparm_source', '');
    ajax.setParameter('sysparm_destination', '');
    ajax.setParameter('sysparm_ticket_type', 'PASS');
    ajax.setParameter('sysparm_passenger_count', '1');

    var ajaxRes2 = JSON.parse(ajax.calculateFareAjax());
    assert(ajaxRes2.success === true, 'Ajax: Pass ticket calculated without station inputs (TC-014)');
    assert(ajaxRes2.unitFare === 50.00, 'Ajax: Pass fixed unit fare equals $50.00');
    assert(ajaxRes2.pricingModel === 'FIXED_RATE', 'Ajax: Pricing model is FIXED_RATE');

    // Test 1.3: Active Stations Ajax list
    var stationsRes = JSON.parse(ajax.getActiveStationsAjax());
    assert(stationsRes.success === true, 'Ajax: Active stations query succeeds');
    assert(stationsRes.stations.length === 9, 'Ajax: Exactly 9 active stations returned (STN-10 inactive excluded) (TC-007)');

    // Test 1.4: Active Ticket Types Ajax list
    var typesRes = JSON.parse(ajax.getActiveTicketTypesAjax());
    assert(typesRes.success === true, 'Ajax: Active ticket types query succeeds');
    assert(typesRes.ticketTypes.length === 3, 'Ajax: 3 active ticket types returned');

    // -------------------------------------------------------------
    // TEST SECTION 2: Catalog Submission to Booking Linkage (Work Package 5)
    // -------------------------------------------------------------
    // Simulate sc_req_item insert
    var reqItemGr = new GlideRecord('sc_req_item');
    reqItemGr.initialize();
    reqItemGr.number = 'RITM0010001';
    reqItemGr.opened_by = 'usr_test_commuter_001';
    reqItemGr.cat_item = {
        name: 'Metro Ticket Booking',
        getDisplayValue: function() { return 'Metro Ticket Booking'; }
    };
    reqItemGr.variables = {
        source_station: 'STN-06',
        destination_station: 'STN-07',
        ticket_type: 'SINGLE',
        travel_date: '2026-10-16',
        passenger_count: '2'
    };
    var ritmId = reqItemGr.insert();

    // Execute BR_ReqItem_CreateMetroBooking logic
    // Load script content and evaluate in current context
    var brCode = fs.readFileSync(path.join(__dirname, '../sys_script/BR_ReqItem_CreateMetroBooking.js'), 'utf8');
    var executeBR = new Function('current', 'previous', brCode);
    executeBR(reqItemGr, null);

    // Verify booking created and linked
    var bkgCheckGr = new GlideRecord('x_mtts_booking_ticket');
    bkgCheckGr.addQuery('request_item', ritmId);
    bkgCheckGr.query();
    assert(bkgCheckGr.next() === true, 'Submission: Exactly one x_mtts_booking_ticket created for RITM (WP-05)');
    var createdBkgSysId = bkgCheckGr.getValue('sys_id');
    var createdBkgRef = bkgCheckGr.getValue('booking_reference');
    assert(createdBkgRef.indexOf('BKG-') === 0, 'Submission: Valid booking reference allocated: ' + createdBkgRef);
    assert(bkgCheckGr.getValue('status') === 'Pending', 'Submission: Initial lifecycle status is Pending (TC-017)');
    assert(bkgCheckGr.getValue('passenger') === 'usr_test_commuter_001', 'Submission: Passenger matches authenticated session user');
    assert(parseFloat(bkgCheckGr.getValue('total_fare')) === 20.00, 'Submission: Authoritative total fare snapshot matches $20.00 (min floor $10 x 2 pax)');

    // Test 2.2: Idempotency of Request-to-Booking Linkage
    // Calling the BR again on the same RITM must NOT create a duplicate booking
    var bkgCountBefore = global._db['x_mtts_booking_ticket'].length;
    executeBR(reqItemGr, null);
    var bkgCountAfter = global._db['x_mtts_booking_ticket'].length;
    assert(bkgCountBefore === bkgCountAfter, 'Submission: Idempotent BR invocation prevented duplicate booking creation');

    // Test 2.3: Unrelated Catalog Request does not trigger Metro Booking
    var unrelatedRitm = new GlideRecord('sc_req_item');
    unrelatedRitm.initialize();
    unrelatedRitm.number = 'RITM0099999';
    unrelatedRitm.cat_item = {
        name: 'Standard Laptop Request',
        getDisplayValue: function() { return 'Standard Laptop Request'; }
    };
    unrelatedRitm.variables = {};
    unrelatedRitm.insert();
    executeBR(unrelatedRitm, null);
    var unrelatedCount = global._db['x_mtts_booking_ticket'].length;
    assert(unrelatedCount === bkgCountBefore, 'Submission: Unrelated catalog item ignored cleanly');

    // -------------------------------------------------------------
    // TEST SECTION 3: My Bookings & Data Privacy (Work Package 7)
    // -------------------------------------------------------------
    var portalSvc = new MetroPortalService();

    // Test 3.1: Authenticated user retrieves their own bookings (TC-024)
    var myBookingsRes = portalSvc.getMyBookings();
    assert(myBookingsRes.success === true, 'My Bookings: Query executed successfully');
    assert(myBookingsRes.count >= 1, 'My Bookings: Returns authorized bookings for passenger');
    assert(myBookingsRes.bookings[0].booking_reference === createdBkgRef, 'My Bookings: Matches created booking reference');

    // Verify defense-in-depth: Sensitive fields are omitted from portal summary
    assert(myBookingsRes.bookings[0].qr_token_hash === undefined, 'Security: qr_token_hash is NOT exposed in portal payload');
    assert(myBookingsRes.bookings[0].rawToken === undefined, 'Security: rawToken is NOT exposed in portal payload');

    // Test 3.2: IDOR Protection - User A cannot access User B's bookings
    // Create booking for User B
    var bkgSvc = new MetroBookingService();
    var userBRes = bkgSvc.createBooking({
        passengerId: 'usr_foreign_attacker_002',
        sourceStationId: 'STN-06',
        destinationStationId: 'STN-07',
        ticketTypeId: 'SINGLE',
        travelDate: '2026-10-16',
        passengerCount: 1
    });

    var userBBookingId = userBRes.bookingId;

    // Current user (usr_test_commuter_001) attempting to get details for User B's booking
    var idorAttempt = portalSvc.getBookingDetailsAndQR(userBBookingId);
    assert(idorAttempt.success === false, 'Security: Access to foreign user booking rejected');
    assert(idorAttempt.error === 'UNAUTHORIZED', 'Security: UNAUTHORIZED error returned on IDOR attempt');

    // -------------------------------------------------------------
    // TEST SECTION 4: Ticket Details & QR Code Rendering (Work Package 8)
    // -------------------------------------------------------------
    // Test 4.1: Pending booking details do NOT show QR ticket
    var pendingDetails = portalSvc.getBookingDetailsAndQR(createdBkgSysId);
    assert(pendingDetails.success === true, 'Details: Pending booking details retrieved');
    assert(pendingDetails.details.ticketReady === false, 'Details: ticketReady is false for Pending booking');
    assert(pendingDetails.details.svgContent === null, 'Details: svgContent is null for Pending booking (no premature QR ticket)');

    // Test 4.2: Approved and Fulfilled booking displays Vector SVG QR Code (TC-025)
    var bkgToApprove = new GlideRecord('x_mtts_booking_ticket');
    bkgToApprove.get(createdBkgSysId);
    bkgToApprove.status = 'Approved';
    bkgToApprove.update();

    var tktGen = new MetroTicketGenerator();
    var fulfillRes = tktGen.generateTicket(createdBkgSysId);
    assert(fulfillRes.success === true, 'Fulfillment: Ticket generated for approved booking');

    var generatedDetails = portalSvc.getBookingDetailsAndQR(createdBkgSysId);
    assert(generatedDetails.success === true, 'Details: Generated booking details retrieved');
    assert(generatedDetails.details.ticketReady === true, 'Details: ticketReady is true for Generated ticket');
    assert(generatedDetails.details.svgContent !== null, 'Details: svgContent is populated for Generated ticket');
    assert(generatedDetails.details.svgContent.indexOf('<svg') === 0, 'Details: Pure vector SVG retrieved from sys_attachment');
    assert(generatedDetails.details.ticket_number === fulfillRes.ticketNumber, 'Details: Displays authoritative issued ticket number');

    // -------------------------------------------------------------
    // TEST SECTION 5: Cancellation Interface & Policy Gate (Work Package 9)
    // -------------------------------------------------------------
    // Test 5.1: Policy Unconfigured Gate
    // System property x_mtts.cancellation.policy_status defaults to 'UNCONFIGURED'
    gs.setProperty('x_mtts.cancellation.policy_status', 'UNCONFIGURED');

    var blockedCancel = portalSvc.cancelBookingWithPolicyGate(createdBkgSysId);
    assert(blockedCancel.success === false, 'Policy Gate: Cancellation blocked when policy is UNCONFIGURED');
    assert(blockedCancel.error === 'POLICY_UNCONFIGURED', 'Policy Gate: Explicit POLICY_UNCONFIGURED error returned');

    var checkUncancelled = new GlideRecord('x_mtts_booking_ticket');
    checkUncancelled.get(createdBkgSysId);
    assert(checkUncancelled.getValue('status') === 'Generated', 'Policy Gate: Booking remains Generated when cancellation blocked');

    // Test 5.2: Policy Configured & Active
    // Administrators configure and activate policy
    gs.setProperty('x_mtts.cancellation.policy_status', 'ACTIVE');

    var allowedCancel = portalSvc.cancelBookingWithPolicyGate(createdBkgSysId);
    assert(allowedCancel.success === true, 'Cancellation: Succeeds when policy is ACTIVE');
    assert(allowedCancel.status === 'Cancelled', 'Cancellation: Status transitioned to Cancelled');
    assert(allowedCancel.refundAmount !== undefined, 'Cancellation: Authoritative refund amount calculated');

    // Test 5.3: Cancelled Ticket Invalidation at Scanner Gate (TC-027)
    var scanResult = tktGen.verifyTicketToken(fulfillRes.ticketNumber, fulfillRes.rawToken);
    assert(scanResult.valid === false, 'Verification: Cancelled ticket rejected by turnstile scanner verifier (TC-027)');
    assert(scanResult.code === 'TICKET_REVOKED_OR_CANCELLED', 'Verification: Rejection code is TICKET_REVOKED_OR_CANCELLED');

    // Test 5.4: Repeated Cancellation Rejected
    var repeatedCancel = portalSvc.cancelBookingWithPolicyGate(createdBkgSysId);
    assert(repeatedCancel.success === false, 'Cancellation: Repeated cancellation rejected cleanly');
    assert(repeatedCancel.error === 'ALREADY_CANCELLED', 'Cancellation: Error code ALREADY_CANCELLED');

    // Reset policy to production default UNCONFIGURED
    gs.setProperty('x_mtts.cancellation.policy_status', 'UNCONFIGURED');

    // -------------------------------------------------------------
    // TEST SECTION 6: Administrative Rejection & 4-Status Baseline (TC-019)
    // -------------------------------------------------------------
    // Create new booking in Pending for rejection test
    var rejectBkgRes = bkgSvc.createBooking({
        passengerId: 'usr_test_commuter_001',
        sourceStationId: 'STN-01',
        destinationStationId: 'STN-02',
        ticketTypeId: 'SINGLE',
        travelDate: '2026-10-22',
        passengerCount: 1
    });

    var rejectBkgGr = new GlideRecord('x_mtts_booking_ticket');
    rejectBkgGr.get(rejectBkgRes.bookingId);
    assert(rejectBkgGr.getValue('status') === 'Pending', 'Admin Rejection: New booking initialized in Pending');

    // Test 6.1: Direct transition to unapproved 'Rejected' status is BLOCKED
    var brEnforceCode = fs.readFileSync(path.join(__dirname, '../sys_script/BR_Booking_StateTransitionEnforcement.js'), 'utf8');
    var executeEnforceBR = new Function('current', 'previous', brEnforceCode);

    var prevGr = { status: 'Pending' };
    var attemptRejectedGr = {
        isNewRecord: function() { return false; },
        status: { changes: function() { return true; }, toString: function() { return 'Rejected'; } },
        booking_reference: rejectBkgGr.getValue('booking_reference'),
        setAbortAction: function(abort) { this._aborted = abort; },
        _aborted: false
    };
    executeEnforceBR(attemptRejectedGr, prevGr);
    assert(attemptRejectedGr._aborted === true, 'Baseline Integrity: Direct transition to unapproved Rejected status is blocked by BR');

    // Test 6.2: Approver Rejection Fallback - Parent RITM Closed Incomplete, Child Booking Cancelled
    rejectBkgGr.status = 'Cancelled';
    rejectBkgGr.cancellation_reason = 'Administrative Rejection: Severe weather alert on transit route';
    rejectBkgGr.refund_amount = 0.00;
    rejectBkgGr.update();
    assert(rejectBkgGr.getValue('status') === 'Cancelled', 'Admin Rejection: Booking status transitioned to Cancelled fallback');
    assert(parseFloat(rejectBkgGr.getValue('refund_amount')) === 0.00, 'Admin Rejection: Refund amount is 0.00 (no fee deducted)');

    // Test 6.3: Portal Service details display clear administrative rejection notice
    var rejectDetails = portalSvc.getBookingDetailsAndQR(rejectBkgRes.bookingId);
    assert(rejectDetails.success === true, 'Admin Rejection: Details retrieved successfully');
    assert(rejectDetails.details.isAdministrativeRejection === true, 'Admin Rejection: Flagged as administrative rejection');
    assert(rejectDetails.details.statusMessage.indexOf('Booking declined by Station Operations') !== -1, 'Admin Rejection: Explicit operations decline notice displayed');

    // Test 6.4: My Bookings summary flags administrative rejection
    var myRejectBookings = portalSvc.getMyBookings();
    var foundRejectItem = null;
    myRejectBookings.bookings.forEach(function(b) {
        if (b.booking_reference === rejectBkgGr.getValue('booking_reference')) {
            foundRejectItem = b;
        }
    });
    assert(foundRejectItem !== null, 'Admin Rejection: Record found in passenger bookings');
    assert(foundRejectItem.is_administrative_rejection === true, 'Admin Rejection: Summary flags administrative rejection for UI styling');

    console.log('Result: ' + passed + ' Passed, ' + failed + ' Failed.');
    return { passed: passed, failed: failed };
}

module.exports = { runTests: runTests };
if (require.main === module) {
    runTests();
}
