/**
 * test_qr_decoder_and_verification.js
 * End-to-End Real QR Image Decoding, Scanning & Verification Test Suite (ST-501, ST-404, ST-602)
 *
 * Requirements Verified:
 * - TC-021: Cryptographically secure random token generated and embedded into QR matrix.
 * - TC-022: Successful fulfillment generates standard scannable vector SVG attachment.
 * - Real Scanning Verification: Decodes the actual rendered QR image using jsQR.
 * - Zero Token Leakage: Verifies qr_token_hash is NOT present in decoded payload.
 * - Server Verification: Submits decoded bearer token to MetroTicketGenerator.verifyTicketToken().
 * - Tamper Rejection: Altered/forged bearer token rejected with TOKEN_MISMATCH.
 * - Cancellation Invalidation: Revoked ticket rejected with TICKET_REVOKED_OR_CANCELLED.
 * - Audit Integrity: Stored token hash remains immutable across cancellations.
 */

var fs = require('fs');
var path = require('path');
var mockEnv = require('./mock_glide_env.js');
var jsQR = require('jsqr');

// Load backend dependencies
eval(fs.readFileSync(path.join(__dirname, '../data/MetroDataSeeder.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroFareCalculator.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroNumberFormatter.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroQRGenerator.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroTicketGenerator.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroRefundCalculator.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroBookingService.js'), 'utf8'));
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
    console.log('\n--- RUNNING SUITE: End-to-End Real QR Code Decoding & Verification Tests ---');
    var passed = 0;
    var failed = 0;

    function assert(cond, name, details) {
        if (cond) {
            console.log('  [PASS] ' + name);
            passed++;
        } else {
            console.error('  [FAIL] ' + name + (details ? ' - ' + details : ''));
            failed++;
        }
    }

    mockEnv.resetDb();
    var seeder = new MetroDataSeeder();
    seeder.runSeed();

    // 1. Create controlled test booking
    var bkgSvc = new MetroBookingService();
    var bkgRes = bkgSvc.createBooking({
        passengerId: 'usr_qr_scanner_test',
        requestItemId: 'ritm_qr_001',
        sourceStationId: 'STN-01',
        destinationStationId: 'STN-05',
        ticketTypeId: 'SINGLE',
        travelDate: '2026-10-25',
        passengerCount: 1
    });

    assert(bkgRes.success === true, 'Controlled test booking created successfully');
    var bookingId = bkgRes.bookingId;

    // 2. Transition booking to Approved state
    var bkgGr = new GlideRecord('x_mtts_booking_ticket');
    bkgGr.get(bookingId);
    bkgGr.status = 'Approved';
    bkgGr.update();
    assert(bkgGr.getValue('status') === 'Approved', 'Booking transitioned to Approved');

    // 3. Fulfill approved booking using actual implementation
    var tktGen = new MetroTicketGenerator();
    var fulfillRes = tktGen.generateTicket(bookingId);
    assert(fulfillRes.success === true, 'Actual QR fulfillment engine executed successfully');
    assert(fulfillRes.ticketNumber.indexOf('TKT-20261025-') === 0, 'Sequential ticket number allocated: ' + fulfillRes.ticketNumber);
    assert(typeof fulfillRes.rawToken === 'string' && fulfillRes.rawToken.length === 32, '128-bit random bearer token generated');
    assert(fulfillRes.attachmentId && fulfillRes.attachmentId.length > 0, 'Attachment created with ID: ' + fulfillRes.attachmentId);

    // 4. Retrieve generated SVG attachment from sys_attachment
    var sa = new GlideSysAttachment();
    var attachGr = new GlideRecord('sys_attachment');
    attachGr.get(fulfillRes.attachmentId);
    var svgXml = sa.getContent(attachGr);
    assert(typeof svgXml === 'string' && svgXml.length > 1000, 'SVG attachment retrieved from sys_attachment (length: ' + svgXml.length + ' chars)');
    assert(svgXml.indexOf('<svg xmlns="http://www.w3.org/2000/svg"') === 0, 'Valid SVG XML declaration header present');
    assert(svgXml.indexOf('viewBox="0 0 300 300"') !== -1, 'Correct SVG viewBox dimensions (300x300)');

    // 5. Convert / Render vector SVG into pixel buffer for QR decoding
    var pathMatches = svgXml.match(/M([0-9\.]+),([0-9\.]+)h([0-9\.]+)v([0-9\.]+)h-([0-9\.]+)z/g);
    assert(pathMatches && pathMatches.length > 100, 'Parsed vector module paths from SVG (' + (pathMatches ? pathMatches.length : 0) + ' modules)');

    var size = 300;
    var scale = 2; // Render at 600x600 px for crisp decoding
    var imgW = size * scale;
    var imgH = size * scale;
    var imgData = new Uint8ClampedArray(imgW * imgH * 4);
    imgData.fill(255); // White background

    pathMatches.forEach(function(p) {
        var m = p.match(/M([0-9\.]+),([0-9\.]+)h([0-9\.]+)v([0-9\.]+)h-([0-9\.]+)z/);
        var x = parseFloat(m[1]) * scale;
        var y = parseFloat(m[2]) * scale;
        var w = parseFloat(m[3]) * scale;
        var h = parseFloat(m[4]) * scale;

        var startX = Math.round(x);
        var startY = Math.round(y);
        var endX = Math.round(x + w);
        var endY = Math.round(y + h);

        for (var py = startY; py < endY && py < imgH; py++) {
            for (var px = startX; px < endX && px < imgW; px++) {
                var idx = (py * imgW + px) * 4;
                imgData[idx] = 0;     // R
                imgData[idx + 1] = 0; // G
                imgData[idx + 2] = 0; // B
                imgData[idx + 3] = 255; // A
            }
        }
    });

    // 6. Decode actual rendered QR image using jsQR decoder
    var decodedQr = jsQR(imgData, imgW, imgH);
    assert(decodedQr !== null, 'Actual QR image decoded successfully by jsQR scanner');

    var decodedPayloadText = decodedQr ? decodedQr.data : '';
    assert(decodedPayloadText.length > 0, 'Decoded QR payload is non-empty');

    var decodedPayload = null;
    try {
        decodedPayload = JSON.parse(decodedPayloadText);
    } catch (e) {
        decodedPayload = null;
    }
    assert(decodedPayload !== null, 'Decoded QR payload is valid JSON');

    // 7. Compare decoded payload with expected parameters
    assert(decodedPayload.tkt === fulfillRes.ticketNumber, 'Decoded ticket number matches issued ticket number: ' + decodedPayload.tkt);
    assert(decodedPayload.tok === fulfillRes.rawToken, 'Decoded bearer token matches issued raw bearer token');
    assert(decodedPayload.bkg === bkgRes.bookingReference, 'Decoded booking reference matches booking: ' + decodedPayload.bkg);
    assert(decodedPayload.src === 'STN-01', 'Decoded source station code matches: ' + decodedPayload.src);
    assert(decodedPayload.dst === 'STN-05', 'Decoded destination station code matches: ' + decodedPayload.dst);
    assert(decodedPayload.dt === '2026-10-25', 'Decoded travel date matches: ' + decodedPayload.dt);

    // 8. Security verification: Verify payload does NOT expose qr_token_hash or secret material
    assert(decodedPayload.qr_token_hash === undefined, 'Security: qr_token_hash is NOT leaked in QR payload');
    assert(decodedPayload.secret === undefined, 'Security: Secret keys are NOT present in QR payload');
    assert(decodedPayload.passenger_name === undefined, 'Privacy: Commuter personal data (PII) is NOT in QR payload');

    // 9. Submit decoded verification token to actual server-side verification service
    var verifyResult = tktGen.verifyTicketToken(decodedPayload.tkt, decodedPayload.tok);
    assert(verifyResult.valid === true, 'Server Verification: Authentic decoded QR token accepted');
    assert(verifyResult.code === 'VALID', 'Server Verification: Verification code is VALID');
    assert(verifyResult.status === 'Generated', 'Server Verification: Confirmed active Generated status');

    // 10. Confirm that a forged or altered token is rejected
    var alteredToken = '00000000000000000000000000000000'; // Forged 32-char token
    var forgedResult = tktGen.verifyTicketToken(decodedPayload.tkt, alteredToken);
    assert(forgedResult.valid === false, 'Security: Forged/tampered bearer token rejected');
    assert(forgedResult.code === 'TOKEN_MISMATCH', 'Security: Rejection code is TOKEN_MISMATCH');

    // 11. Cancellation invalidation test
    // Retrieve stored hash before cancellation
    var bkgCheck = new GlideRecord('x_mtts_booking_ticket');
    bkgCheck.get(bookingId);
    var storedHashBefore = bkgCheck.getValue('qr_token_hash');
    assert(storedHashBefore && storedHashBefore.length === 64, 'SHA-256 digest verified in database (64 hex chars)');

    // Execute cancellation (using controlled active policy test fixture)
    gs.setProperty('x_mtts.cancellation.policy_status', 'ACTIVE');
    var portalSvc = new x_mtts.MetroPortalService();
    // Simulate passenger session
    gs.setUserID('usr_qr_scanner_test');
    var cancelRes = portalSvc.cancelBookingWithPolicyGate(bookingId);
    assert(cancelRes.success === true, 'Booking cancelled successfully under active policy fixture');
    assert(cancelRes.status === 'Cancelled', 'Booking status transitioned to Cancelled');

    // 12. Confirm authentic token is now REJECTED after cancellation
    var postCancelVerify = tktGen.verifyTicketToken(decodedPayload.tkt, decodedPayload.tok);
    assert(postCancelVerify.valid === false, 'Turnstile Scanner: Cancelled ticket rejected by scanner gate (TC-027)');
    assert(postCancelVerify.code === 'TICKET_REVOKED_OR_CANCELLED', 'Turnstile Scanner: Rejection code is TICKET_REVOKED_OR_CANCELLED');

    // 13. Audit integrity: Confirm original stored token digest remains unchanged
    var bkgPostCancel = new GlideRecord('x_mtts_booking_ticket');
    bkgPostCancel.get(bookingId);
    var storedHashAfter = bkgPostCancel.getValue('qr_token_hash');
    assert(storedHashBefore === storedHashAfter, 'Audit Integrity: Token digest remains immutable after cancellation');

    // Reset policy to production default UNCONFIGURED
    gs.setProperty('x_mtts.cancellation.policy_status', 'UNCONFIGURED');
    gs.setUserID('usr_test_commuter_001');

    console.log('Result: ' + passed + ' Passed, ' + failed + ' Failed.\n');
    return { passed: passed, failed: failed };
}

module.exports = { runTests: runTests };
if (require.main === module) {
    runTests();
}
