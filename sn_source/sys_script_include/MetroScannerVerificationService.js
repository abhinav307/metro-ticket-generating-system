/**
 * MetroScannerVerificationService.js
 * 
 * Scoped Application: x_mtts
 * Script Include: MetroScannerVerificationService
 * Client Callable: false
 * Active: true
 * 
 * Authoritative backend service handling digital metro ticket verification requests
 * submitted by physical turnstiles, handheld inspector devices, and automated gate readers.
 * 
 * Security Controls:
 * 1. Requires scanner role (x_mtts.scanner or x_mtts.admin).
 * 2. Validates JSON payload schema and input formats (regex constraints).
 * 3. Enforces rate-limiting / brute-force abuse protection per client/scanner.
 * 4. Verifies bearer token against server-side SHA-256 hash without leaking secrets.
 * 5. Rejects non-Generated tickets (Pending, Approved, Cancelled, Used) failing closed.
 * 6. Records structured audit logs into x_mtts_scan_event (zero raw token leakage).
 * 7. Returns minimal safe payload without passenger PII or financial details.
 */
var MetroScannerVerificationService = Class.create();

// Static rate limiting tracker across service invocations
MetroScannerVerificationService._failedAttempts = {};

MetroScannerVerificationService.prototype = {
    initialize: function() {
        this.logPrefix = '[x_mtts:MetroScannerVerificationService] ';
    },

    /**
     * Primary entry point for processing a Scripted REST API request.
     * @param {Object} request ServiceNow Scripted REST API request object (sn_ws.RESTAPIRequest)
     * @param {Object} response ServiceNow Scripted REST API response object (sn_ws.RESTAPIResponse)
     * @returns {Object} Response payload
     */
    processRestRequest: function(request, response) {
        var startTime = new Date().getTime();
        var correlationId = gs.generateGUID();
        var clientIp = this._extractClientIp(request);

        // 1. Authentication & Authorization Check
        var isAuthorized = this._isAuthorizedScanner(request);
        if (!isAuthorized) {
            this._logScanEvent({
                ticketNumber: null,
                bookingGr: null,
                stationCode: null,
                scannerId: 'UNAUTHORIZED_CALLER',
                outcome: 'UNAUTHORIZED',
                errorCode: 'AUTH_REQUIRED',
                correlationId: correlationId,
                clientIp: clientIp,
                startTime: startTime
            });

            if (response && response.setStatus) {
                response.setStatus(401);
            }
            return {
                result: 'REJECTED',
                code: 'UNAUTHORIZED',
                message: 'Scanner client is not authenticated or lacks the required x_mtts.scanner role.',
                correlation_id: correlationId
            };
        }

        // 2. Parse & Validate Request Body
        var bodyData = this._extractRequestBody(request);
        if (!bodyData || typeof bodyData !== 'object') {
            this._logScanEvent({
                ticketNumber: null,
                bookingGr: null,
                stationCode: null,
                scannerId: 'MALFORMED_REQUEST',
                outcome: 'INVALID_REQUEST',
                errorCode: 'INVALID_JSON',
                correlationId: correlationId,
                clientIp: clientIp,
                startTime: startTime
            });

            if (response && response.setStatus) response.setStatus(400);
            return {
                result: 'REJECTED',
                code: 'INVALID_REQUEST',
                message: 'Request body must be a valid JSON object.',
                correlation_id: correlationId
            };
        }

        var scannerId = (bodyData.scanner_id || request.getHeader('X-Scanner-ID') || 'UNKNOWN_SCANNER').toString().trim();
        var stationCode = (bodyData.station_code || request.getHeader('X-Station-Code') || '').toString().trim();
        var ticketNumber = (bodyData.ticket_number || '').toString().trim();
        var bearerToken = (bodyData.token || '').toString().trim();

        // 3. Strict Schema & Whitelist Validation
        var validationError = this._validatePayloadSchema(bodyData, ticketNumber, bearerToken);
        if (validationError) {
            this._logScanEvent({
                ticketNumber: ticketNumber || null,
                bookingGr: null,
                stationCode: stationCode,
                scannerId: scannerId,
                outcome: 'INVALID_REQUEST',
                errorCode: validationError.code,
                correlationId: correlationId,
                clientIp: clientIp,
                startTime: startTime
            });

            if (response && response.setStatus) response.setStatus(400);
            return {
                result: 'REJECTED',
                code: 'INVALID_REQUEST',
                message: validationError.message,
                correlation_id: correlationId
            };
        }

        // 4. Rate Limiting & Abuse Detection
        var rateLimitKey = scannerId + '_' + clientIp;
        if (this._isRateLimited(rateLimitKey)) {
            this._logScanEvent({
                ticketNumber: ticketNumber,
                bookingGr: null,
                stationCode: stationCode,
                scannerId: scannerId,
                outcome: 'RATE_LIMITED',
                errorCode: 'EXCEEDED_FAILED_LIMIT',
                correlationId: correlationId,
                clientIp: clientIp,
                startTime: startTime
            });

            if (response && response.setStatus) response.setStatus(429);
            return {
                result: 'REJECTED',
                code: 'RATE_LIMITED',
                message: 'Too many failed verification attempts. Temporary lockout active.',
                correlation_id: correlationId
            };
        }

        // 5. Authoritative Ticket Lookup
        var bkgGr = new GlideRecord('x_mtts_booking_ticket');
        bkgGr.addQuery('ticket_number', ticketNumber);
        bkgGr.query();

        if (!bkgGr.next()) {
            this._recordFailedAttempt(rateLimitKey);
            this._logScanEvent({
                ticketNumber: ticketNumber,
                bookingGr: null,
                stationCode: stationCode,
                scannerId: scannerId,
                outcome: 'TICKET_NOT_FOUND',
                errorCode: 'RECORD_NOT_FOUND',
                correlationId: correlationId,
                clientIp: clientIp,
                startTime: startTime
            });

            if (response && response.setStatus) response.setStatus(404);
            return {
                result: 'REJECTED',
                code: 'TICKET_NOT_FOUND',
                message: 'No ticket record found matching the presented ticket number.',
                correlation_id: correlationId
            };
        }

        var authoritativeStatus = bkgGr.getValue('status');

        // 6. Cancellation Invalidation & State Verification
        // If ticket is Cancelled, fail closed immediately
        if (authoritativeStatus === 'Cancelled') {
            this._logScanEvent({
                ticketNumber: ticketNumber,
                bookingGr: bkgGr,
                stationCode: stationCode,
                scannerId: scannerId,
                outcome: 'TICKET_CANCELLED_OR_INVALID',
                errorCode: 'TICKET_REVOKED_OR_CANCELLED',
                correlationId: correlationId,
                clientIp: clientIp,
                startTime: startTime
            });

            if (response && response.setStatus) response.setStatus(403);
            return {
                result: 'REJECTED',
                code: 'TICKET_CANCELLED_OR_INVALID',
                ticket_number: ticketNumber,
                status: 'Cancelled',
                message: 'Ticket has been cancelled or revoked. Access denied.',
                correlation_id: correlationId
            };
        }

        // Non-Generated states (e.g., Pending, Approved) cannot pass turnstiles
        if (authoritativeStatus !== 'Generated') {
            this._logScanEvent({
                ticketNumber: ticketNumber,
                bookingGr: bkgGr,
                stationCode: stationCode,
                scannerId: scannerId,
                outcome: 'TICKET_CANCELLED_OR_INVALID',
                errorCode: 'TICKET_NOT_YET_FULFILLED',
                correlationId: correlationId,
                clientIp: clientIp,
                startTime: startTime
            });

            if (response && response.setStatus) response.setStatus(403);
            return {
                result: 'REJECTED',
                code: 'TICKET_CANCELLED_OR_INVALID',
                ticket_number: ticketNumber,
                status: authoritativeStatus,
                message: 'Ticket is not in active Generated status. Current status: ' + authoritativeStatus,
                correlation_id: correlationId
            };
        }

        // 7. Cryptographic Bearer Token Digest Verification
        var storedHash = bkgGr.getValue('qr_token_hash');
        var presentedDigest = this._computeSHA256(bearerToken);

        if (!storedHash || !this._safeCompare(storedHash, presentedDigest)) {
            this._recordFailedAttempt(rateLimitKey);
            this._logScanEvent({
                ticketNumber: ticketNumber,
                bookingGr: bkgGr,
                stationCode: stationCode,
                scannerId: scannerId,
                outcome: 'TOKEN_MISMATCH',
                errorCode: 'FORGED_OR_INVALID_TOKEN',
                correlationId: correlationId,
                clientIp: clientIp,
                startTime: startTime
            });

            if (response && response.setStatus) response.setStatus(401);
            return {
                result: 'REJECTED',
                code: 'TOKEN_MISMATCH',
                ticket_number: ticketNumber,
                message: 'Presented token does not match cryptographic verification record.',
                correlation_id: correlationId
            };
        }

        // 8. Successful Verification
        this._clearFailedAttempts(rateLimitKey);
        this._logScanEvent({
            ticketNumber: ticketNumber,
            bookingGr: bkgGr,
            stationCode: stationCode,
            scannerId: scannerId,
            outcome: 'VALID',
            errorCode: null,
            correlationId: correlationId,
            clientIp: clientIp,
            startTime: startTime
        });

        if (response && response.setStatus) response.setStatus(200);
        return {
            result: 'VALID',
            code: 'VALID',
            ticket_number: ticketNumber,
            status: 'Generated',
            station_code: stationCode || null,
            message: 'Ticket verified successfully. Gate open.',
            correlation_id: correlationId,
            scan_timestamp: new GlideDateTime().toString()
        };
    },

    /**
     * Validates input payload schema, required keys, formatting, and forbidden properties.
     */
    _validatePayloadSchema: function(bodyData, ticketNumber, bearerToken) {
        if (!ticketNumber) {
            return { code: 'MISSING_TICKET_NUMBER', message: 'Field ticket_number is required.' };
        }
        if (!bearerToken) {
            return { code: 'MISSING_TOKEN', message: 'Field token is required.' };
        }

        // Regex for ticket number: TKT-YYYYMMDD-XXXXXX
        var tktRegex = /^TKT-\d{8}-\d{6}$/;
        if (!tktRegex.test(ticketNumber)) {
            return { code: 'INVALID_TICKET_FORMAT', message: 'Field ticket_number format invalid. Expected TKT-YYYYMMDD-XXXXXX.' };
        }

        // Regex for bearer token: 32 hex chars
        var tokenRegex = /^[a-fA-F0-9]{32}$/;
        if (!tokenRegex.test(bearerToken)) {
            return { code: 'INVALID_TOKEN_FORMAT', message: 'Field token format invalid. Expected 32-character hex bearer token.' };
        }

        // Disallow unexpected fields that might influence verification
        var allowedKeys = {
            'ticket_number': true,
            'token': true,
            'scanner_id': true,
            'station_code': true,
            'scan_timestamp': true
        };
        for (var k in bodyData) {
            if (bodyData.hasOwnProperty(k) && !allowedKeys[k]) {
                return { code: 'UNEXPECTED_FIELD', message: 'Payload contains unexpected field: ' + k };
            }
        }

        return null;
    },

    /**
     * Checks if caller is authorized with scanner or admin role.
     */
    _isAuthorizedScanner: function(request) {
        // If simulated or test context passes explicit credentials
        if (request && request._mockUserRoles) {
            return request._mockUserRoles.indexOf('x_mtts.scanner') !== -1 ||
                   request._mockUserRoles.indexOf('x_mtts.admin') !== -1;
        }
        return gs.hasRole('x_mtts.scanner') || gs.hasRole('x_mtts.admin');
    },

    /**
     * Extracts request body data safely from Scripted REST API request.
     */
    _extractRequestBody: function(request) {
        if (!request) return null;
        if (request.body && request.body.data) {
            return request.body.data;
        }
        if (request.body && typeof request.body.dataString === 'string') {
            try {
                return JSON.parse(request.body.dataString);
            } catch (e) {
                return null;
            }
        }
        if (typeof request.body === 'object' && !request.body.data) {
            return request.body;
        }
        return null;
    },

    /**
     * Extracts client network IP address safely.
     */
    _extractClientIp: function(request) {
        if (!request) return '127.0.0.1';
        if (typeof request.getClientIP === 'function') {
            return request.getClientIP() || '127.0.0.1';
        }
        if (request.getHeader) {
            return request.getHeader('X-Forwarded-For') || request.getHeader('X-Real-IP') || '127.0.0.1';
        }
        return '127.0.0.1';
    },

    /**
     * Calculates SHA-256 digest of presented raw bearer token using exact method compatible with ticket issuance.
     * Prefers native scoped GlideDigest in ServiceNow; falls back to Node.js crypto in local testing.
     */
    _computeSHA256: function(str) {
        if (!str) return '';
        if (typeof GlideDigest !== 'undefined') {
            try {
                var digest = new GlideDigest();
                return digest.getSHA256Hex(str);
            } catch (e) {
                gs.error(this.logPrefix + 'GlideDigest error: ' + e.message);
            }
        }
        if (typeof crypto !== 'undefined' && crypto.createHash) {
            return crypto.createHash('sha256').update(str).digest('hex');
        }
        return '';
    },

    /**
     * Compares fixed-format 64-character SHA-256 hexadecimal digests.
     * 
     * Security Properties:
     * 1. Fails closed (returns false) if either digest is not exactly 64 hexadecimal characters.
     * 2. In Node.js environments (test harness), uses crypto.timingSafeEqual for constant-time buffer comparison.
     * 3. In ServiceNow server-side scoped JavaScript (Rhino / Nashorn), crypto.timingSafeEqual is not available.
     *    A fixed-length 64-iteration XOR loop is executed without early termination.
     * 4. Note on residual risk: In ServiceNow Rhino/Nashorn runtime, JIT and bytecode interpretation
     *    cannot guarantee true hardware-level constant time. Full timing-attack immunity in production
     *    is contingent on ServiceNow platform cryptographic services or edge-gateway verification.
     */
    _safeCompare: function(storedHash, candidateHash) {
        if (typeof storedHash !== 'string' || typeof candidateHash !== 'string') {
            return false;
        }
        // Strict 64-character hex digest validation (fail closed on malformed or wrong-length hash)
        var hex64Regex = /^[0-9a-fA-F]{64}$/;
        if (!hex64Regex.test(storedHash) || !hex64Regex.test(candidateHash)) {
            return false;
        }

        var strA = storedHash.toLowerCase();
        var strB = candidateHash.toLowerCase();

        // Environment check: Node.js runtime supporting crypto.timingSafeEqual
        if (typeof crypto !== 'undefined' && typeof crypto.timingSafeEqual === 'function') {
            try {
                var bufA = Buffer.from(strA, 'utf8');
                var bufB = Buffer.from(strB, 'utf8');
                if (bufA.length === bufB.length) {
                    return crypto.timingSafeEqual(bufA, bufB);
                }
            } catch (ex) {
                // Fall through to fixed-length loop if buffer conversion fails
            }
        }

        // Target ServiceNow Scoped JavaScript Runtime: fixed 64-iteration XOR loop
        var diff = 0;
        for (var i = 0; i < 64; i++) {
            diff |= (strA.charCodeAt(i) ^ strB.charCodeAt(i));
        }
        return diff === 0;
    },

    /**
     * Tracks failed attempts for abuse detection and rate limiting.
     */
    _recordFailedAttempt: function(key) {
        var now = new Date().getTime();
        var windowMs = parseInt(gs.getProperty('x_mtts.scanner.rate_limit_window_sec', '60'), 10) * 1000;
        var record = MetroScannerVerificationService._failedAttempts[key] || { count: 0, firstAttempt: now };

        if (now - record.firstAttempt > windowMs) {
            record = { count: 1, firstAttempt: now };
        } else {
            record.count++;
        }
        MetroScannerVerificationService._failedAttempts[key] = record;
    },

    /**
     * Clears failed attempts counter upon successful verification.
     */
    _clearFailedAttempts: function(key) {
        delete MetroScannerVerificationService._failedAttempts[key];
    },

    /**
     * Checks if a client/scanner key is currently rate-limited.
     */
    _isRateLimited: function(key) {
        var record = MetroScannerVerificationService._failedAttempts[key];
        if (!record) return false;
        var now = new Date().getTime();
        var windowMs = parseInt(gs.getProperty('x_mtts.scanner.rate_limit_window_sec', '60'), 10) * 1000;
        var maxAttempts = parseInt(gs.getProperty('x_mtts.scanner.max_failed_attempts', '5'), 10);

        if (now - record.firstAttempt > windowMs) {
            delete MetroScannerVerificationService._failedAttempts[key];
            return false;
        }
        return record.count >= maxAttempts;
    },

    /**
     * Records a structured scan audit event into x_mtts_scan_event.
     * Guaranteed zero raw bearer token leakage, zero password hash leakage, zero PII leakage.
     */
    _logScanEvent: function(params) {
        try {
            if (gs.getProperty('x_mtts.scanner.audit_logging_enabled', 'true') !== 'true') {
                return;
            }

            var eventGr = new GlideRecord('x_mtts_scan_event');
            eventGr.initialize();
            if (params.ticketNumber) {
                eventGr.setValue('ticket_number', params.ticketNumber);
            }
            if (params.bookingGr) {
                eventGr.setValue('booking_ticket', params.bookingGr.getUniqueValue());
            }
            if (params.stationCode) {
                eventGr.setValue('station_code', params.stationCode);
            }
            eventGr.setValue('scanner_id', params.scannerId || 'UNKNOWN');
            eventGr.setValue('verification_outcome', params.outcome);
            if (params.errorCode) {
                eventGr.setValue('error_code', params.errorCode);
            }
            eventGr.setValue('correlation_id', params.correlationId);
            eventGr.setValue('client_ip', params.clientIp || '127.0.0.1');
            eventGr.setValue('scan_timestamp', new GlideDateTime());

            if (params.startTime) {
                var duration = new Date().getTime() - params.startTime;
                eventGr.setValue('processing_duration_ms', duration);
            }

            eventGr.insert();
        } catch (ex) {
            gs.error(this.logPrefix + 'Failed to write scan event audit log: ' + ex.message);
        }
    },

    type: 'MetroScannerVerificationService'
};

if (typeof module !== 'undefined') {
    module.exports = MetroScannerVerificationService;
}
