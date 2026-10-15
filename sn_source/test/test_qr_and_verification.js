/**
 * test_qr_and_verification.js
 * Technical Feasibility & Security Test Suite for QR Generator & Verifier (ST-501, ST-404, ST-602)
 * Validates TC-021, TC-022, TC-027
 */
require('./mock_glide_env');
var fs = require('fs');
var vm = require('vm');

var seederCode = fs.readFileSync(__dirname + '/../data/MetroDataSeeder.js', 'utf8');
var calcCode = fs.readFileSync(__dirname + '/../sys_script_include/MetroFareCalculator.js', 'utf8');
var bkgCode = fs.readFileSync(__dirname + '/../sys_script_include/MetroBookingService.js', 'utf8');
var fmtCode = fs.readFileSync(__dirname + '/../sys_script_include/MetroNumberFormatter.js', 'utf8');
var qrCode = fs.readFileSync(__dirname + '/../sys_script_include/MetroQRGenerator.js', 'utf8');
var tktGenCode = fs.readFileSync(__dirname + '/../sys_script_include/MetroTicketGenerator.js', 'utf8');

vm.runInThisContext(seederCode);
vm.runInThisContext(calcCode);
vm.runInThisContext(bkgCode);
vm.runInThisContext(fmtCode);
vm.runInThisContext(qrCode);
vm.runInThisContext(tktGenCode);

function runTests() {
    console.log('--- RUNNING SUITE: QR Generation, Verification & Revocation Tests ---');
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

    // Seed master data
    var seeder = new MetroDataSeeder();
    seeder.runSeed();

    // Test 1: Vector SVG QR Code Generation
    var qrGen = new MetroQRGenerator();
    var samplePayload = JSON.stringify({ v: 1, tkt: 'TKT-20261015-000001', tok: 'abcdef1234567890abcdef1234567890' });
    var svg = qrGen.generateSVG(samplePayload, 300);

    assert(typeof svg === 'string' && svg.length > 500, 'SVG Output generated');
    assert(svg.indexOf('<svg xmlns="http://www.w3.org/2000/svg"') === 0, 'Valid SVG XML declaration header');
    assert(svg.indexOf('viewBox="0 0 300 300"') !== -1, 'Correct SVG viewBox dimensions');
    assert(svg.indexOf('</svg>') !== -1, 'SVG closing tag present');

    // Test 2: Create a booking in Pending, then transition to Approved
    var bkgService = new MetroBookingService();
    var bkgRes = bkgService.createBooking({
        passengerId: 'usr_alice_01',
        requestItemId: 'ritm_001',
        sourceStationId: 'STN-01',
        destStationId: 'STN-05',
        ticketTypeId: 'SINGLE',
        travelDate: '2026-10-15',
        passengerCount: 1
    });
    assert(bkgRes.success === true, 'Booking created in Pending');

    var bkgGr = new GlideRecord('x_mtts_booking_ticket');
    bkgGr.get(bkgRes.bookingId);
    assert(bkgGr.getValue('status') === 'Pending', 'Initial status is Pending');

    // Attempting fulfillment on Pending must fail (Illegal state)
    var tktGen = new MetroTicketGenerator();
    var fulfillPending = tktGen.generateTicket(bkgRes.bookingId);
    assert(fulfillPending.success === false, 'Cannot fulfill Pending booking without Approval');
    assert(fulfillPending.error.code === 'ILLEGAL_STATE', 'Error code ILLEGAL_STATE');

    // Approver approves booking -> transition to Approved
    bkgGr.status = 'Approved';
    bkgGr.update();

    // Test 3: Fulfillment of Approved Booking (TC-021, TC-022)
    var fulfillRes = tktGen.generateTicket(bkgRes.bookingId);
    assert(fulfillRes.success === true, 'Fulfillment succeeds for Approved booking');
    assert(fulfillRes.ticketNumber.indexOf('TKT-20261015-') === 0, 'Issued Ticket Number format correct: ' + fulfillRes.ticketNumber);
    assert(fulfillRes.rawToken.length === 32, '128-bit Random Bearer Token generated (32 hex chars)');
    assert(fulfillRes.attachmentId && fulfillRes.attachmentId.length > 0, 'QR SVG Attachment created: ' + fulfillRes.attachmentId);

    // Verify database record state
    var updatedBkg = new GlideRecord('x_mtts_booking_ticket');
    updatedBkg.get(bkgRes.bookingId);
    assert(updatedBkg.getValue('status') === 'Generated', 'Status transitioned to Generated (TC-022)');
    assert(updatedBkg.getValue('ticket_number') === fulfillRes.ticketNumber, 'Ticket number saved in DB');
    assert(updatedBkg.getValue('qr_attachment') === fulfillRes.attachmentId, 'Attachment sys_id linked in DB');

    // Verify defense-in-depth: Raw token must NOT be stored in DB!
    var storedHash = updatedBkg.getValue('qr_token_hash');
    assert(storedHash.length === 64, 'SHA-256 Hash stored in qr_token_hash (64 hex chars)');
    assert(storedHash !== fulfillRes.rawToken, 'Raw token is NOT stored in qr_token_hash');
    assert(updatedBkg.getValue('qr_payload').indexOf(fulfillRes.rawToken) === -1, 'Raw token is NOT stored in qr_payload');

    // Test 4: Server-Side Token Verification - Valid Token
    var verifyValid = tktGen.verifyTicketToken(fulfillRes.ticketNumber, fulfillRes.rawToken);
    assert(verifyValid.valid === true, 'Authentic token verified successfully');
    assert(verifyValid.code === 'VALID', 'Verification code VALID');

    // Test 5: Server-Side Token Verification - Forged / Altered Token
    var verifyForged = tktGen.verifyTicketToken(fulfillRes.ticketNumber, '00000000000000000000000000000000');
    assert(verifyForged.valid === false, 'Forged token rejected');
    assert(verifyForged.code === 'TOKEN_MISMATCH', 'Verification code TOKEN_MISMATCH');

    // Test 6: Idempotent Fulfillment (Calling fulfill again returns existing ticket)
    var fulfillAgain = tktGen.generateTicket(bkgRes.bookingId);
    assert(fulfillAgain.success === true, 'Idempotent fulfillment call succeeds');
    assert(fulfillAgain.ticketNumber === fulfillRes.ticketNumber, 'Same ticket number returned without duplicate allocation');

    // Test 7: Cancellation Token Invalidation (TC-027)
    // When booking is Cancelled, verifier rejects ticket because status is Cancelled
    updatedBkg.status = 'Cancelled';
    updatedBkg.cancellation_time = new GlideDateTime();
    updatedBkg.update();

    var verifyCancelled = tktGen.verifyTicketToken(fulfillRes.ticketNumber, fulfillRes.rawToken);
    assert(verifyCancelled.valid === false, 'Cancelled ticket rejected by verification (TC-027)');
    assert(verifyCancelled.code === 'TICKET_REVOKED_OR_CANCELLED', 'Code TICKET_REVOKED_OR_CANCELLED');
    assert(updatedBkg.getValue('qr_token_hash') === storedHash, 'Token hash remains unchanged for audit integrity');

    console.log('Result: ' + passed + ' Passed, ' + failed + ' Failed.\n');
    return { passed: passed, failed: failed };
}

module.exports = { runTests: runTests };
if (require.main === module) {
    runTests();
}
