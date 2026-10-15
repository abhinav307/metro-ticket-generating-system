/**
 * run_all_tests.js
 * Master Automated Test Runner for Metro Ticket Generating System (x_mtts)
 * Executes all 11 unit, integration, concurrency, security, optical decoding, and end-to-end test suites across Phases 2, 3, and 4.
 */
var suiteFare = require('./test_fare_calculator');
var suiteNumber = require('./test_number_formatter_concurrency');
var suiteQr = require('./test_qr_and_verification');
var suiteBooking = require('./test_booking_and_lifecycle');
var suitePhase3 = require('./test_phase3_ui_and_integration');
var suiteQrDecoder = require('./test_qr_decoder_and_verification');
var suiteScannerApi = require('./test_scanner_api');
var suiteAuditLogging = require('./test_turnstile_audit_logging');
var suiteNotifications = require('./test_notifications');
var suiteDataMigration = require('./test_data_migration');
var suiteSecurityE2E = require('./test_phase4_security_and_e2e');
var suitePhase5 = require('./test_phase5_deployment_and_smoke');

console.log('===============================================================');
console.log('  METRO TICKET GENERATING SYSTEM IN SERVICENOW (x_mtts)');
console.log('  Master Automated Comprehensive Test Runner (Suites 1 - 12)');
console.log('===============================================================\n');

var startTime = Date.now();

var r1 = suiteFare.runTests();
var r2 = suiteNumber.runTests();
var r3 = suiteQr.runTests();
var r4 = suiteBooking.runTests();
var r5 = suitePhase3.runTests();
var r6 = suiteQrDecoder.runTests();
var r7 = suiteScannerApi.runTests();
var r8 = suiteAuditLogging.runTests();
var r9 = suiteNotifications.runTests();
var r10 = suiteDataMigration.runTests();
var r11 = suiteSecurityE2E.runTests();
var r12 = suitePhase5.runTests();

var totalPassed = r1.passed + r2.passed + r3.passed + r4.passed + r5.passed + r6.passed +
                  r7.passed + r8.passed + r9.passed + r10.passed + r11.passed + r12.passed;
var totalFailed = r1.failed + r2.failed + r3.failed + r4.failed + r5.failed + r6.failed +
                  r7.failed + r8.failed + r9.failed + r10.failed + r11.failed + r12.failed;
var totalTests = totalPassed + totalFailed;
var totalDuration = Date.now() - startTime;

console.log('\n===============================================================');
console.log('  MASTER AUTOMATED TEST SUITE SUMMARY (PHASES 2 - 5)');
console.log('===============================================================');
console.log('  Suite 1 : MetroFareCalculator Unit Tests          : ' + r1.passed + ' passed');
console.log('  Suite 2 : Number Formatter & Sequence Tests       : ' + r2.passed + ' passed');
console.log('  Suite 3 : QR Generator & Verification Logic       : ' + r3.passed + ' passed');
console.log('  Suite 4 : Booking, Lifecycle & Refund Tests       : ' + r4.passed + ' passed');
console.log('  Suite 5 : Phase 3 UI, Catalog & Portal Tests      : ' + r5.passed + ' passed');
console.log('  Suite 6 : Real Optical QR Decoding (jsQR)         : ' + r6.passed + ' passed');
console.log('  Suite 7 : Secure Scanner REST API Tests           : ' + r7.passed + ' passed');
console.log('  Suite 8 : Turnstile Audit Logging (Scan Events)   : ' + r8.passed + ' passed');
console.log('  Suite 9 : Automated Email Notifications           : ' + r9.passed + ' passed');
console.log('  Suite 10: Master Data Migration & Validation      : ' + r10.passed + ' passed');
console.log('  Suite 11: Security Controls & Full E2E Acceptance : ' + r11.passed + ' passed');
console.log('  Suite 12: Phase 5 Controlled Deployment & Smoke   : ' + r12.passed + ' passed');
console.log('---------------------------------------------------------------');
console.log('  Total Test Suites Executed     : 12');
console.log('  Total Test Assertions Executed : ' + totalTests);
console.log('  Passed Assertions              : ' + totalPassed + ' (' + ((totalPassed / totalTests) * 100).toFixed(1) + '%)');
console.log('  Failed Assertions              : ' + totalFailed + ' (0%)');
console.log('  Total Execution Time           : ' + totalDuration + 'ms');
console.log('  Overall Test Result            : ' + (totalFailed === 0 ? 'SUCCESS / ALL TESTS PASSED' : 'FAILURE'));
console.log('===============================================================\n');

if (totalFailed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
