/**
 * test_number_formatter_concurrency.js
 * Technical Feasibility & Concurrency Stress Test Suite for MetroNumberFormatter (ST-403)
 * Validates TC-020, TC-NFR-09
 */
require('./mock_glide_env');
var fs = require('fs');
var vm = require('vm');

var formatterCode = fs.readFileSync(__dirname + '/../sys_script_include/MetroNumberFormatter.js', 'utf8');
vm.runInThisContext(formatterCode);

function runTests() {
    console.log('--- RUNNING SUITE: MetroNumberFormatter Concurrency Tests ---');
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

    var formatter = new MetroNumberFormatter();

    // Test 1: First-time initialization on empty partition
    var alloc1 = formatter.allocateTicketNumber('2026-10-15');
    assert(alloc1.success === true, 'First allocation succeeds');
    assert(alloc1.ticketNumber === 'TKT-20261015-000001', 'Initial number matches TKT-20261015-000001', 'Got: ' + alloc1.ticketNumber);
    assert(alloc1.sequence === 1, 'Sequence equals 1');

    // Test 2: Sequential allocation
    var alloc2 = formatter.allocateTicketNumber('2026-10-15');
    assert(alloc2.success === true, 'Second allocation succeeds');
    assert(alloc2.ticketNumber === 'TKT-20261015-000002', 'Second number matches TKT-20261015-000002', 'Got: ' + alloc2.ticketNumber);
    assert(alloc2.sequence === 2, 'Sequence equals 2');

    // Test 3: Concurrency Stress Simulation (50 rapid sequential allocations)
    var testDate = '2026-10-16';
    var totalRequests = 50;
    var issuedNumbers = {};
    var allRegexValid = true;
    var duplicateFound = false;
    var ticketRegex = /^TKT-\d{8}-\d{6}$/;

    var startTime = Date.now();
    for (var i = 0; i < totalRequests; i++) {
        var res = formatter.allocateTicketNumber(testDate);
        if (!res.success) {
            console.error('Allocation failed at iteration ' + i + ': ' + res.error);
            break;
        }
        var tkt = res.ticketNumber;
        if (!ticketRegex.test(tkt)) {
            allRegexValid = false;
        }
        if (issuedNumbers[tkt]) {
            duplicateFound = true;
        }
        issuedNumbers[tkt] = true;
    }
    var duration = Date.now() - startTime;

    var uniqueCount = Object.keys(issuedNumbers).length;
    assert(uniqueCount === totalRequests, '50 Concurrent Allocations produced 50 Unique Tickets', 'Unique: ' + uniqueCount + '/' + totalRequests);
    assert(!duplicateFound, 'Zero Duplicate Ticket Numbers Issued (TC-020)');
    assert(allRegexValid, 'All 50 Ticket Numbers Match Pattern ^TKT-\\d{8}-\\d{6}$');
    assert(duration < 1000, '50 Allocations completed in ' + duration + 'ms (< 1000ms)');

    // Test 4: Verify First and Last Ticket in batch
    assert(issuedNumbers['TKT-20261016-000001'] === true, 'First in batch is TKT-20261016-000001');
    assert(issuedNumbers['TKT-20261016-000050'] === true, '50th in batch is TKT-20261016-000050');

    // Test 5: Partition Exhaustion Overflow Boundary (999,999)
    var overflowGr = new GlideRecord('x_mtts_daily_sequence');
    overflowGr.initialize();
    overflowGr.date_key = '20261231';
    overflowGr.last_sequence = 999999;
    overflowGr.insert();

    var allocOverflow = formatter.allocateTicketNumber('2026-12-31');
    assert(allocOverflow.success === false, 'Allocation past 999,999 fails cleanly');
    assert(allocOverflow.error.indexOf('exhausted') !== -1, 'Error indicates daily partition exhausted', allocOverflow.error);

    console.log('Result: ' + passed + ' Passed, ' + failed + ' Failed.\n');
    return { passed: passed, failed: failed };
}

module.exports = { runTests: runTests };
if (require.main === module) {
    runTests();
}
