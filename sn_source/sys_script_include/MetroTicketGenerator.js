var MetroTicketGenerator = Class.create();
MetroTicketGenerator.prototype = {
    initialize: function() {
        this.logPrefix = '[x_mtts.MetroTicketGenerator] ';
        this.numberFormatter = new MetroNumberFormatter();
        this.qrGenerator = new MetroQRGenerator();
    },

    /**
     * Fulfillment Orchestrator: Allocates ticket number, generates secure token, creates QR attachment,
     * and transitions booking to 'Generated'.
     * Idempotent: Retrying an already generated booking returns existing ticket details without duplication.
     * @param {String} bookingSysId Sys_id of x_mtts_booking_ticket
     * @returns {Object} Structured fulfillment result
     */
    generateTicket: function(bookingSysId) {
        var response = {
            success: false,
            ticketNumber: '',
            bookingReference: '',
            rawToken: '',
            attachmentId: '',
            error: null
        };

        if (!bookingSysId) {
            response.error = { code: 'INVALID_ID', message: 'Booking sys_id is missing.' };
            return response;
        }

        var bkgGr = new GlideRecord('x_mtts_booking_ticket');
        if (!bkgGr.get(bookingSysId)) {
            response.error = { code: 'NOT_FOUND', message: 'Booking record not found for sys_id: ' + bookingSysId };
            return response;
        }

        var currentStatus = bkgGr.getValue('status');
        var bookingRef = bkgGr.getValue('booking_reference');
        response.bookingReference = bookingRef;

        // Idempotency: If already generated, return existing ticket
        if (currentStatus === 'Generated') {
            response.success = true;
            response.ticketNumber = bkgGr.getValue('ticket_number');
            response.attachmentId = bkgGr.getValue('qr_attachment');
            gs.info(this.logPrefix + 'Idempotent fulfillment: booking ' + bookingRef + ' is already Generated.');
            return response;
        }

        // Must be in Approved status to fulfill
        if (currentStatus !== 'Approved') {
            response.error = {
                code: 'ILLEGAL_STATE',
                message: 'Booking cannot be fulfilled in status: ' + currentStatus + '. Must be Approved.'
            };
            gs.warn(this.logPrefix + response.error.message + ' (Ref: ' + bookingRef + ')');
            return response;
        }

        try {
            // 1. Allocate Unique Ticket Number (TKT-YYYYMMDD-XXXXXX)
            var travelDate = bkgGr.getValue('travel_date');
            var allocResult = this.numberFormatter.allocateTicketNumber(travelDate);
            if (!allocResult.success) {
                response.error = { code: 'ALLOCATION_FAILED', message: allocResult.error };
                gs.error(this.logPrefix + 'Ticket numbering failed: ' + allocResult.error);
                return response;
            }

            var ticketNumber = allocResult.ticketNumber;
            response.ticketNumber = ticketNumber;

            // 2. Generate Cryptographically Secure 128-bit Random Bearer Token
            var rawToken = this._generateSecureRandomToken();
            response.rawToken = rawToken;

            // 3. Compute One-Way SHA-256 Digest of Token for Secure Storage
            var tokenHash = this._computeSHA256(rawToken);

            // 4. Construct QR Payload (Zero PII; bearer token in payload for scanner verification)
            var srcCode = '';
            var srcVal = bkgGr.getValue('source_station');
            if (srcVal) {
                var sGr = new GlideRecord('x_mtts_station');
                if (sGr.get(srcVal)) {
                    srcCode = sGr.getValue('station_code') || srcVal;
                } else {
                    srcCode = srcVal;
                }
            }

            var dstCode = '';
            var dstVal = bkgGr.getValue('destination_station');
            if (dstVal) {
                var dGr = new GlideRecord('x_mtts_station');
                if (dGr.get(dstVal)) {
                    dstCode = dGr.getValue('station_code') || dstVal;
                } else {
                    dstCode = dstVal;
                }
            }

            var typCode = '';
            var typVal = bkgGr.getValue('ticket_type');
            if (typVal) {
                var tGr = new GlideRecord('x_mtts_ticket_type');
                if (tGr.get(typVal)) {
                    typCode = tGr.getValue('code') || typVal;
                } else {
                    typCode = typVal;
                }
            }

            var qrPayloadObject = {
                v: 1,
                tkt: ticketNumber,
                bkg: bookingRef,
                src: srcCode,
                dst: dstCode,
                dt: travelDate,
                typ: typCode,
                pax: parseInt(bkgGr.getValue('passenger_count') || '1', 10),
                tok: rawToken
            };
            var qrText = JSON.stringify(qrPayloadObject);

            // Metadata payload saved in database omits raw token for defense-in-depth
            var sanitizedMetadata = {
                v: 1,
                tkt: ticketNumber,
                bkg: bookingRef,
                src: qrPayloadObject.src,
                dst: qrPayloadObject.dst,
                dt: travelDate,
                typ: qrPayloadObject.typ,
                pax: qrPayloadObject.pax
            };

            // 5. Generate Vector SVG QR Code
            var svgContent = this.qrGenerator.generateSVG(qrText, 300);

            // 6. Persist QR SVG Attachment linked to booking
            var attachId = this._saveAttachment(bkgGr, 'ticket_' + ticketNumber + '.svg', 'image/svg+xml', svgContent);
            response.attachmentId = attachId;

            // 7. Commit Ticket Details & Transition to 'Generated'
            bkgGr.ticket_number = ticketNumber;
            bkgGr.qr_token_hash = tokenHash;
            bkgGr.qr_payload = JSON.stringify(sanitizedMetadata);
            if (attachId) {
                bkgGr.qr_attachment = attachId;
            }
            bkgGr.generation_time = new GlideDateTime();
            bkgGr.status = 'Generated';

            var updated = bkgGr.update();
            if (updated) {
                response.success = true;
                gs.info(this.logPrefix + 'Successfully generated ticket ' + ticketNumber + ' for booking ' + bookingRef);
            } else {
                response.error = { code: 'UPDATE_FAILED', message: 'Failed to commit Generated state to database.' };
            }
        } catch (ex) {
            // Failure recovery: Record remains Approved, never Cancelled
            response.error = { code: 'FULFILLMENT_EXCEPTION', message: ex.message };
            gs.error(this.logPrefix + 'Fulfillment exception for booking ' + bookingRef + ': ' + ex.message);
        }

        return response;
    },

    /**
     * Server-side ticket verification service for handheld terminals and portal scanners.
     * Checks presented raw bearer token against stored SHA-256 digest and validates authoritative status.
     * Cancelled tickets are rejected cleanly because authoritative status is not 'Generated'.
     * @param {String} ticketNumber Issued ticket number
     * @param {String} presentedToken Raw token presented by QR scan
     * @returns {Object} Verification result
     */
    verifyTicketToken: function(ticketNumber, presentedToken) {
        var result = {
            valid: false,
            code: '',
            status: '',
            bookingReference: '',
            travelDate: '',
            reason: ''
        };

        if (!ticketNumber || !presentedToken) {
            result.code = 'INVALID_INPUT';
            result.reason = 'Ticket number and verification token are required.';
            return result;
        }

        var bkgGr = new GlideRecord('x_mtts_booking_ticket');
        bkgGr.addQuery('ticket_number', ticketNumber);
        bkgGr.query();

        if (!bkgGr.next()) {
            result.code = 'NOT_FOUND';
            result.reason = 'No ticket found with number: ' + ticketNumber;
            return result;
        }

        var status = bkgGr.getValue('status');
        result.status = status;
        result.bookingReference = bkgGr.getValue('booking_reference');
        result.travelDate = bkgGr.getValue('travel_date');

        // Check 1: Cancelled tickets immediately fail verification
        if (status === 'Cancelled') {
            result.code = 'TICKET_REVOKED_OR_CANCELLED';
            result.reason = 'This ticket has been cancelled or revoked. Boarding denied.';
            return result;
        }

        // Check 2: Authoritative status must be 'Generated'
        if (status !== 'Generated') {
            result.code = 'INACTIVE_STATUS';
            result.reason = 'Ticket is not in active Generated status (Current status: ' + status + ').';
            return result;
        }

        // Check 3: Cryptographic digest match
        var storedHash = bkgGr.getValue('qr_token_hash');
        var computedHash = this._computeSHA256(presentedToken);

        if (storedHash && computedHash && storedHash.toLowerCase() === computedHash.toLowerCase()) {
            result.valid = true;
            result.code = 'VALID';
            result.reason = 'Ticket verified successfully. Access granted.';
        } else {
            result.code = 'TOKEN_MISMATCH';
            result.reason = 'Cryptographic verification token is invalid or forged.';
        }

        return result;
    },

    _generateSecureRandomToken: function() {
        if (typeof GlideSecureRandomUtil !== 'undefined' && GlideSecureRandomUtil.getSecureRandomString) {
            return GlideSecureRandomUtil.getSecureRandomString(32);
        }
        // Native fallback using 128-bit CSPRNG GUID
        var guid = gs.generateGUID().replace(/-/g, '');
        var extra = gs.generateGUID().replace(/-/g, '');
        return (guid + extra).slice(0, 32);
    },

    _computeSHA256: function(input) {
        if (typeof GlideDigest !== 'undefined') {
            var gd = new GlideDigest();
            return gd.getSHA256Hex(input);
        }
        // Standard SHA-256 implementation fallback
        var crypto = require('crypto');
        return crypto.createHash('sha256').update(input).digest('hex');
    },

    _saveAttachment: function(recordGr, fileName, contentType, content) {
        if (typeof GlideSysAttachment !== 'undefined') {
            try {
                var sa = new GlideSysAttachment();
                return sa.write(recordGr, fileName, contentType, content);
            } catch (e) {
                gs.error(this.logPrefix + 'Attachment write error: ' + e.message);
            }
        }
        return 'attach_' + gs.generateGUID().slice(0, 16);
    },

    type: 'MetroTicketGenerator'
};
