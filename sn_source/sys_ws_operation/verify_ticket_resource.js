/**
 * verify_ticket_resource.js
 * 
 * Scripted REST API Resource: Verify Ticket
 * Endpoint: POST /api/x_mtts/scanner/verify-ticket
 * Web Service: Metro Turnstile Scanner API (scanner)
 * Scope: x_mtts
 */
(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
    var verifier = new x_mtts.MetroScannerVerificationService();
    return verifier.processRestRequest(request, response);
})(request, response);
