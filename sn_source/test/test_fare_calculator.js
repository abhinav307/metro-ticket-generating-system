/**
 * test_fare_calculator.js
 * Automated Unit Test Suite for MetroFareCalculator (ST-301)
 * Validates TC-012, TC-013, TC-014, TC-015, TC-030, TC-008
 */
require('./mock_glide_env');
var fs = require('fs');
var vm = require('vm');

// Load Script Includes into current execution context
var seederCode = fs.readFileSync(__dirname + '/../data/MetroDataSeeder.js', 'utf8');
var calcCode = fs.readFileSync(__dirname + '/../sys_script_include/MetroFareCalculator.js', 'utf8');

vm.runInThisContext(seederCode);
vm.runInThisContext(calcCode);

function runTests() {
    console.log('--- RUNNING SUITE: MetroFareCalculator Tests ---');
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

    // Seed development master data
    var seeder = new MetroDataSeeder();
    var seedReport = seeder.runSeed();
    assert(seedReport.stations.inserted === 10, 'Seed 10 Stations', 'Inserted: ' + seedReport.stations.inserted);
    assert(seedReport.routes.inserted === 17, 'Seed 17 Routes', 'Inserted: ' + seedReport.routes.inserted);
    assert(seedReport.ticketTypes.inserted === 3, 'Seed 3 Ticket Types', 'Inserted: ' + seedReport.ticketTypes.inserted);
    assert(seedReport.fareRules.inserted === 4, 'Seed 4 Fare Rules', 'Inserted: ' + seedReport.fareRules.inserted);

    var calc = new MetroFareCalculator();

    // Test 1: Single Journey Standard Calculation (TC-012)
    // STN-01 to STN-05: 14.20 km * $2.50 = $35.50 (max($10.00, $35.50) = $35.50)
    var resSingle = calc.calculateFare({
        sourceStationId: 'STN-01',
        destStationId: 'STN-05',
        ticketTypeId: 'SINGLE',
        travelDate: '2026-10-15',
        passengerCount: 2
    });
    assert(resSingle.success === true, 'Single Journey Success (TC-012)');
    assert(resSingle.distanceKm === 14.20, 'Distance matches 14.20 km', 'Got: ' + resSingle.distanceKm);
    assert(resSingle.unitFare === 35.50, 'Unit fare equals $35.50', 'Got: ' + resSingle.unitFare);
    assert(resSingle.totalFare === 71.00, 'Total fare equals $71.00 for 2 pax (TC-015)', 'Got: ' + resSingle.totalFare);

    // Test 2: Single Journey Minimum Fare Floor (TC-012)
    // STN-06 to STN-07: 3.50 km * $2.50 = $8.75 -> Minimum fare $10.00 applied!
    var resMin = calc.calculateFare({
        sourceStationId: 'STN-06',
        destStationId: 'STN-07',
        ticketTypeId: 'SINGLE',
        travelDate: '2026-10-15',
        passengerCount: 1
    });
    assert(resMin.success === true, 'Single Journey Min Floor Success');
    assert(resMin.distanceKm === 3.50, 'Distance matches 3.50 km');
    assert(resMin.unitFare === 10.00, 'Minimum floor $10.00 enforced over $8.75', 'Got: ' + resMin.unitFare);
    assert(resMin.totalFare === 10.00, 'Total fare equals $10.00 for 1 pax');

    // Test 3: Return Ticket Pricing Algorithm (TC-013)
    // STN-01 to STN-05: Single = $35.50 * 1.80 = $63.90
    var resReturn = calc.calculateFare({
        sourceStationId: 'STN-01',
        destStationId: 'STN-05',
        ticketTypeId: 'RETURN',
        travelDate: '2026-10-15',
        passengerCount: 1
    });
    assert(resReturn.success === true, 'Return Ticket Success (TC-013)');
    assert(resReturn.unitFare === 63.90, 'Return fare equals $35.50 * 1.80 = $63.90', 'Got: ' + resReturn.unitFare);
    assert(resReturn.totalFare === 63.90, 'Total return fare matches unit fare for 1 pax');

    // Test 4: Pass Ticket Fixed Fare & Route Bypass (TC-014)
    // Fixed fare = $50.00, distance must be 0.00, route lookup bypassed!
    var resPass = calc.calculateFare({
        sourceStationId: 'STN-01',
        destStationId: 'STN-08',
        ticketTypeId: 'PASS',
        travelDate: '2026-10-15',
        passengerCount: 3
    });
    assert(resPass.success === true, 'Pass Ticket Success (TC-014)');
    assert(resPass.distanceKm === 0.00, 'Pass distance calculation bypassed (0.00 km)', 'Got: ' + resPass.distanceKm);
    assert(resPass.unitFare === 50.00, 'Pass unit fare equals fixed fare $50.00', 'Got: ' + resPass.unitFare);
    assert(resPass.totalFare === 150.00, 'Pass total fare equals $50.00 * 3 = $150.00', 'Got: ' + resPass.totalFare);

    // Test 5: Missing Route Error Handling (TC-030)
    // STN-04 to STN-09: Unmapped route pair
    var resNoRoute = calc.calculateFare({
        sourceStationId: 'STN-04',
        destStationId: 'STN-09',
        ticketTypeId: 'SINGLE',
        travelDate: '2026-10-15',
        passengerCount: 1
    });
    assert(resNoRoute.success === false, 'Missing Route Aborts Gracefully (TC-030)');
    assert(resNoRoute.errorCode === 'NO_ACTIVE_ROUTE_FOUND', 'Correct error code NO_ACTIVE_ROUTE_FOUND', 'Got: ' + resNoRoute.errorCode);

    // Test 6: Inactive Station Handling (TC-002 / TC-030)
    // STN-99 is decommissioned
    var resInactStn = calc.calculateFare({
        sourceStationId: 'STN-01',
        destStationId: 'STN-99',
        ticketTypeId: 'SINGLE',
        travelDate: '2026-10-15',
        passengerCount: 1
    });
    assert(resInactStn.success === false, 'Inactive Station Aborted');
    assert(resInactStn.errorCode === 'INVALID_STATIONS', 'Error code INVALID_STATIONS');

    // Test 7: Identical Origin and Destination Blocking (TC-008)
    var resSame = calc.calculateFare({
        sourceStationId: 'STN-01',
        destStationId: 'STN-01',
        ticketTypeId: 'SINGLE',
        travelDate: '2026-10-15',
        passengerCount: 1
    });
    assert(resSame.success === false, 'Identical Stations Blocked (TC-008)');
    assert(resSame.errorCode === 'SAME_STATION', 'Error code SAME_STATION');

    // Test 8: Invalid Passenger Count
    var resPaxZero = calc.calculateFare({
        sourceStationId: 'STN-01',
        destStationId: 'STN-02',
        ticketTypeId: 'SINGLE',
        travelDate: '2026-10-15',
        passengerCount: 0
    });
    assert(resPaxZero.success === false, 'Zero Passenger Count Blocked');
    assert(resPaxZero.errorCode === 'INVALID_PASSENGER_COUNT', 'Error code INVALID_PASSENGER_COUNT');

    var resPaxHigh = calc.calculateFare({
        sourceStationId: 'STN-01',
        destStationId: 'STN-02',
        ticketTypeId: 'SINGLE',
        travelDate: '2026-10-15',
        passengerCount: 7
    });
    assert(resPaxHigh.success === false, 'Passenger Count Exceeding Max (6) Blocked');
    assert(resPaxHigh.errorCode === 'INVALID_PASSENGER_COUNT', 'Error code INVALID_PASSENGER_COUNT');

    console.log('Result: ' + passed + ' Passed, ' + failed + ' Failed.\n');
    return { passed: passed, failed: failed };
}

module.exports = { runTests: runTests };
if (require.main === module) {
    runTests();
}
