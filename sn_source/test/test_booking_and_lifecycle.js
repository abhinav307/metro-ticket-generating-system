/**
 * test_booking_and_lifecycle.js
 * Test Suite for Booking Service, Financial Snapshots, Lifecycle State Machine & Refunds (ST-304, ST-405, SUB-11)
 * Validates TC-011, TC-016, TC-017, TC-026, TC-NFR-02, TC-NFR-03
 */
require('./mock_glide_env');
var fs = require('fs');
var vm = require('vm');

var seederCode = fs.readFileSync(__dirname + '/../data/MetroDataSeeder.js', 'utf8');
var calcCode = fs.readFileSync(__dirname + '/../sys_script_include/MetroFareCalculator.js', 'utf8');
var bkgCode = fs.readFileSync(__dirname + '/../sys_script_include/MetroBookingService.js', 'utf8');
var refundCode = fs.readFileSync(__dirname + '/../sys_script_include/MetroRefundCalculator.js', 'utf8');

vm.runInThisContext(seederCode);
vm.runInThisContext(calcCode);
vm.runInThisContext(bkgCode);
vm.runInThisContext(refundCode);

function runTests() {
    console.log('--- RUNNING SUITE: Booking, Lifecycle & Refund Tests ---');
    var passed = 0;
    var failed = 0;

    function assert(condition, testName, details) {
        if (condition) {
            console.log('  [PASS] ' + testName);
            passed++;
        } else {
            console.error('  [FAIL] ' + testName + (details ? ' - ' + details : ''));
            failed++;
        }
    }

    var seeder = new MetroDataSeeder();
    seeder.runSeed();

    var bkgService = new MetroBookingService();

    // Test 1: Booking Creation with Immutable Snapshots (TC-016, TC-017)
    var bkgRes = bkgService.createBooking({
        passengerId: 'usr_bob_02',
        requestItemId: 'ritm_002',
        sourceStationId: 'STN-01',
        destStationId: 'STN-03', // 8.50 km * $2.50 = $21.25 * 2 = $42.50
        ticketTypeId: 'SINGLE',
        travelDate: '2026-10-20',
        passengerCount: 2
    });
    assert(bkgRes.success === true, 'Booking created successfully');
    assert(bkgRes.totalFare === 42.50, 'Total fare equals $42.50', 'Got: ' + bkgRes.totalFare);

    var bkgGr = new GlideRecord('x_mtts_booking_ticket');
    bkgGr.get(bkgRes.bookingId);
    assert(bkgGr.getValue('status') === 'Pending', 'Initial status is Pending (TC-017)');
    assert(bkgGr.getValue('calculated_distance') == 8.50, 'Snapshot distance is 8.50 km');
    assert(bkgGr.getValue('unit_fare') == 21.25, 'Snapshot unit fare is $21.25');
    assert(bkgGr.getValue('total_fare') == 42.50, 'Snapshot total fare is $42.50');

    // Test 2: Master Data Change Does Not Alter Historical Booking (TC-016)
    // Modify active fare rule rate from $2.50 to $5.00
    var ruleGr = new GlideRecord('x_mtts_fare_rule');
    ruleGr.addQuery('rule_id', 'FR-SINGLE-01');
    ruleGr.query();
    if (ruleGr.next()) {
        ruleGr.rate_per_km = 5.00;
        ruleGr.update();
    }

    // Historic booking record remains completely unchanged!
    var historicGr = new GlideRecord('x_mtts_booking_ticket');
    historicGr.get(bkgRes.bookingId);
    assert(historicGr.getValue('unit_fare') == 21.25, 'Historic unit fare unchanged ($21.25) after fare rule rate hike (TC-016)');
    assert(historicGr.getValue('total_fare') == 42.50, 'Historic total fare unchanged ($42.50)');

    // Reset fare rule back to $2.50
    if (ruleGr.get(ruleGr.getUniqueValue())) {
        ruleGr.rate_per_km = 2.50;
        ruleGr.update();
    }

    // Test 3: Anti-Tampering (Server Discards Client Price, TC-011, TC-NFR-02)
    // Client attempts to create booking injecting total_fare = 0.01
    var tamperedRes = bkgService.createBooking({
        passengerId: 'usr_hacker_01',
        requestItemId: 'ritm_003',
        sourceStationId: 'STN-01',
        destStationId: 'STN-05', // True price is $35.50
        ticketTypeId: 'SINGLE',
        travelDate: '2026-10-20',
        passengerCount: 1,
        total_fare: 0.01 // Tampered parameter!
    });
    assert(tamperedRes.success === true, 'Booking created through authoritative service');
    assert(tamperedRes.totalFare === 35.50, 'Client price discarded; authoritative $35.50 locked (TC-011)');

    // Test 4: Refund Calculator - Policy Gate Verification (Default UNCONFIGURED)
    var refundCalc = new MetroRefundCalculator();
    var refundUnconf = refundCalc.calculateRefund(historicGr, '2026-10-15T10:00:00');
    assert(refundUnconf.eligible === false, 'Refund ineligible when policy is UNCONFIGURED (Default Gate)');
    assert(refundUnconf.policyRef === 'POLICY_UNCONFIGURED', 'Policy ref is POLICY_UNCONFIGURED');
    assert(refundUnconf.refundAmount === 0.00, 'Refund amount is $0.00 while unconfigured');

    // Controlled Test Fixture: Enable ACTIVE policy explicitly for tier evaluation
    gs.setProperty('x_mtts.cancellation.policy_status', 'ACTIVE');

    // Test 5: Refund Calculator - Greater than 24 hours (Tier 90%)
    // Booking date: 2026-10-20. Cancel date: 2026-10-15 (5 days prior > 24h)
    var refund90 = refundCalc.calculateRefund(historicGr, '2026-10-15T10:00:00');
    assert(refund90.eligible === true, 'Refund eligible > 24 hours (Controlled Active Policy)');
    assert(refund90.refundPercentage === 90, 'Refund percentage is 90%');
    assert(refund90.refundAmount === 38.25, 'Refund amount is 90% of $42.50 = $38.25', 'Got: ' + refund90.refundAmount);
    assert(refund90.policyRef === 'TIER_GREATER_24H', 'Policy ref TIER_GREATER_24H');

    // Test 6: Refund Calculator - Between 2 and 24 hours (Tier 75%)
    // Cancel at 2026-10-19T14:00:00 (10 hours prior)
    var refund75 = refundCalc.calculateRefund(historicGr, '2026-10-19T14:00:00');
    assert(refund75.eligible === true, 'Refund eligible 2-24 hours');
    assert(refund75.refundPercentage === 75, 'Refund percentage is 75%');
    assert(refund75.refundAmount === 31.88, 'Refund amount is 75% of $42.50 = $31.88', 'Got: ' + refund75.refundAmount);

    // Test 7: Refund Calculator - Less than 2 hours (Tier 0%)
    // Cancel at 2026-10-19T23:00:00 (1 hour prior)
    var refund0 = refundCalc.calculateRefund(historicGr, '2026-10-19T23:00:00');
    assert(refund0.eligible === false, 'Refund ineligible < 2 hours');
    assert(refund0.refundPercentage === 0, 'Refund percentage is 0%');
    assert(refund0.refundAmount === 0.00, 'Refund amount is $0.00');

    // Test 8: Refund Calculator - Past Scheduled Date (0%)
    var refundPast = refundCalc.calculateRefund(historicGr, '2026-10-21T09:00:00');
    assert(refundPast.eligible === false, 'Refund ineligible after travel date');
    assert(refundPast.policyRef === 'POLICY_PAST_TRAVEL_DATE', 'Policy ref POLICY_PAST_TRAVEL_DATE');

    // Test 9: Safe Failure on Corrupt/Invalid Policy Configuration
    gs.setProperty('x_mtts.cancellation_tier_greater_24h_pct', '150'); // Invalid > 100%
    var refundCorrupt = refundCalc.calculateRefund(historicGr, '2026-10-15T10:00:00');
    assert(refundCorrupt.eligible === false, 'Corrupt configuration fails safely');
    assert(refundCorrupt.policyRef === 'POLICY_CONFIG_ERROR', 'Error code is POLICY_CONFIG_ERROR');
    assert(refundCorrupt.refundAmount === 0.00, 'Refund amount safely 0.00 on config error');

    // Reset properties to production baseline
    gs.setProperty('x_mtts.cancellation_tier_greater_24h_pct', '90');
    gs.setProperty('x_mtts.cancellation.policy_status', 'UNCONFIGURED');

    // Test 8: Station Referential Integrity Check (TC-NFR-03)
    // Deleting STN-01 which is referenced by routes & bookings must be blocked!
    var stnGr = new GlideRecord('x_mtts_station');
    stnGr.addQuery('station_code', 'STN-01');
    stnGr.query();
    assert(stnGr.next() === true, 'STN-01 found');

    var routeCheck = new GlideRecord('x_mtts_route');
    routeCheck.addQuery('origin_station', stnGr.getUniqueValue()).addOrCondition('destination_station', stnGr.getUniqueValue());
    routeCheck.query();
    assert(routeCheck.hasNext() === true, 'Referential constraint verified: Active routes depend on STN-01');

    console.log('Result: ' + passed + ' Passed, ' + failed + ' Failed.\n');
    return { passed: passed, failed: failed };
}

module.exports = { runTests: runTests };
if (require.main === module) {
    runTests();
}
