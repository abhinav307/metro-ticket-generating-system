var MetroPortalService = Class.create();
MetroPortalService.prototype = {
    initialize: function() {
        this.logPrefix = '[x_mtts.MetroPortalService] ';
        this.refundCalculator = new MetroRefundCalculator();
    },

    /**
     * Retrieves the authenticated passenger's bookings.
     * Enforces strict IDOR protection by filtering exclusively on gs.getUserID().
     * @param {Object} options Search, limit, and offset parameters
     * @returns {Object} List of sanitized booking records
     */
    getMyBookings: function(options) {
        options = options || {};
        var userId = gs.getUserID();
        var bookings = [];

        var bkgGr = new GlideRecord('x_mtts_booking_ticket');
        bkgGr.addQuery('passenger', userId);

        if (options.search) {
            var searchStr = options.search.trim();
            var qc = bkgGr.addQuery('booking_reference', 'CONTAINS', searchStr);
            qc.addOrCondition('ticket_number', 'CONTAINS', searchStr);
        }

        bkgGr.orderByDesc('sys_created_on');
        if (options.limit) {
            bkgGr.setLimit(parseInt(options.limit, 10));
        }
        bkgGr.query();

        while (bkgGr.next()) {
            bookings.push(this._formatBookingSummary(bkgGr));
        }

        return {
            success: true,
            count: bookings.length,
            bookings: bookings
        };
    },

    /**
     * Retrieves full booking details and generated vector QR ticket for modal display.
     * Strictly validates ownership: A user cannot view another user's ticket details or QR.
     * Never exposes qr_token_hash or bearer tokens.
     * @param {String} bookingSysId Sys_id of x_mtts_booking_ticket
     * @returns {Object} Secure booking details with vector SVG attachment if Generated
     */
    getBookingDetailsAndQR: function(bookingSysId) {
        if (!bookingSysId) {
            return { success: false, error: 'MISSING_ID', message: 'Booking ID is required.' };
        }

        var bkgGr = new GlideRecord('x_mtts_booking_ticket');
        if (!bkgGr.get(bookingSysId)) {
            return { success: false, error: 'NOT_FOUND', message: 'Booking record not found.' };
        }

        // Strict Ownership Enforcement
        var currentUserId = gs.getUserID();
        var bookingPassenger = bkgGr.getValue('passenger');
        if (bookingPassenger !== currentUserId && !gs.hasRole('x_mtts.admin')) {
            gs.warn(this.logPrefix + 'Unauthorized access attempt to booking ' + bookingSysId + ' by user ' + currentUserId);
            return { success: false, error: 'UNAUTHORIZED', message: 'You are not authorized to view this booking.' };
        }

        var details = this._formatBookingSummary(bkgGr);
        var status = bkgGr.getValue('status');
        details.svgContent = null;
        details.ticketReady = false;

        if (status === 'Generated') {
            details.ticketReady = true;
            var attachId = bkgGr.getValue('qr_attachment');
            if (attachId) {
                var sa = new GlideSysAttachment();
                var attachGr = new GlideRecord('sys_attachment');
                if (attachGr.get(attachId)) {
                    details.svgContent = sa.getContent(attachGr) || sa.getContentStream(attachId);
                }
            }
        } else if (status === 'Pending') {
            details.statusMessage = 'Your booking request is pending supervisor approval. Your digital ticket will be generated upon approval.';
        } else if (status === 'Approved') {
            details.statusMessage = 'Your booking has been approved. Ticket issuance is in progress.';
        } else if (status === 'Cancelled') {
            var cancelReason = bkgGr.getValue('cancellation_reason');
            if (cancelReason && cancelReason.indexOf('Administrative Rejection') === 0) {
                details.statusMessage = 'Booking declined by Station Operations. ' + cancelReason;
                details.isAdministrativeRejection = true;
            } else {
                details.statusMessage = 'This booking has been cancelled and is invalid for transit passage.';
                details.isAdministrativeRejection = false;
            }
        }

        return {
            success: true,
            details: details
        };
    },

    /**
     * Evaluates and applies booking cancellation with explicit governance policy gating.
     * If the cancellation policy is not configured, blocks cancellation safely.
     * @param {String} bookingSysId Sys_id of x_mtts_booking_ticket
     * @returns {Object} Cancellation outcome and refund breakdown
     */
    cancelBookingWithPolicyGate: function(bookingSysId) {
        if (!bookingSysId) {
            return { success: false, error: 'MISSING_ID', message: 'Booking ID is required.' };
        }

        var bkgGr = new GlideRecord('x_mtts_booking_ticket');
        if (!bkgGr.get(bookingSysId)) {
            return { success: false, error: 'NOT_FOUND', message: 'Booking record not found.' };
        }

        // Strict Ownership Check
        var currentUserId = gs.getUserID();
        if (bkgGr.getValue('passenger') !== currentUserId && !gs.hasRole('x_mtts.admin')) {
            return { success: false, error: 'UNAUTHORIZED', message: 'Unauthorized cancellation request.' };
        }

        var currentStatus = bkgGr.getValue('status');
        if (currentStatus === 'Cancelled') {
            return {
                success: false,
                error: 'ALREADY_CANCELLED',
                message: 'This booking has already been cancelled.'
            };
        }

        // Policy Gate Check: System property x_mtts.cancellation.policy_status
        // Candidate policy must be explicitly configured as 'ACTIVE' by administrators/stakeholders
        var policyStatus = gs.getProperty('x_mtts.cancellation.policy_status', 'UNCONFIGURED');
        if (policyStatus !== 'ACTIVE') {
            gs.warn(this.logPrefix + 'Cancellation blocked for booking ' + bkgGr.getValue('booking_reference') + ': Policy is ' + policyStatus);
            return {
                success: false,
                policyConfigured: false,
                error: 'POLICY_UNCONFIGURED',
                message: 'Cancellation is unavailable because the cancellation policy has not been configured or approved by stakeholders.'
            };
        }

        // Policy is ACTIVE: Calculate authoritative refund quote
        var refundCalc = this.refundCalculator.calculateRefund(bkgGr);
        var refundAmount = (refundCalc && refundCalc.eligible) ? refundCalc.refundAmount : 0.00;

        // Transition booking to Cancelled
        bkgGr.status = 'Cancelled';
        bkgGr.cancellation_time = new GlideDateTime();
        bkgGr.refund_amount = refundAmount;

        var updated = bkgGr.update();
        if (updated) {
            gs.info(this.logPrefix + 'Booking ' + bkgGr.getValue('booking_reference') + ' cancelled successfully. Refund: $' + refundAmount);
            return {
                success: true,
                policyConfigured: true,
                status: 'Cancelled',
                bookingReference: bkgGr.getValue('booking_reference'),
                refundAmount: refundAmount,
                refundPercentage: refundCalc.refundPercentage || 0,
                policyApplied: refundCalc.policyApplied || 'ACTIVE_TIERED_POLICY',
                message: 'Booking cancelled successfully.'
            };
        } else {
            return {
                success: false,
                error: 'DATABASE_ERROR',
                message: 'Failed to update booking status in database.'
            };
        }
    },

    /**
     * Sanitizes and formats booking fields for portal presentation.
     * @private
     */
    _formatBookingSummary: function(bkgGr) {
        var srcName = 'All Stations (Pass)';
        var dstName = 'All Stations (Pass)';

        var srcId = bkgGr.getValue('source_station');
        if (srcId) {
            var sGr = new GlideRecord('x_mtts_station');
            if (sGr.get(srcId)) {
                srcName = sGr.getValue('station_name') + ' (' + sGr.getValue('station_code') + ')';
            }
        }

        var dstId = bkgGr.getValue('destination_station');
        if (dstId) {
            var dGr = new GlideRecord('x_mtts_station');
            if (dGr.get(dstId)) {
                dstName = dGr.getValue('station_name') + ' (' + dGr.getValue('station_code') + ')';
            }
        }

        var typeName = 'Standard';
        var typeId = bkgGr.getValue('ticket_type');
        if (typeId) {
            var tGr = new GlideRecord('x_mtts_ticket_type');
            if (tGr.get(typeId)) {
                typeName = tGr.getValue('name');
            }
        }

        return {
            sys_id: bkgGr.getValue('sys_id'),
            booking_reference: bkgGr.getValue('booking_reference'),
            ticket_number: bkgGr.getValue('ticket_number') || 'Pending Issuance',
            source_station: srcName,
            destination_station: dstName,
            ticket_type: typeName,
            travel_date: bkgGr.getValue('travel_date'),
            passenger_count: parseInt(bkgGr.getValue('passenger_count') || '1', 10),
            calculated_distance: parseFloat(bkgGr.getValue('calculated_distance') || '0').toFixed(2),
            calculated_unit_fare: parseFloat(bkgGr.getValue('calculated_unit_fare') || '0').toFixed(2),
            total_fare: parseFloat(bkgGr.getValue('total_fare') || '0').toFixed(2),
            status: bkgGr.getValue('status'),
            refund_amount: parseFloat(bkgGr.getValue('refund_amount') || '0').toFixed(2),
            cancellation_reason: bkgGr.getValue('cancellation_reason') || null,
            is_administrative_rejection: (bkgGr.getValue('cancellation_reason') || '').indexOf('Administrative Rejection') === 0,
            created_on: bkgGr.getValue('sys_created_on'),
            generation_time: bkgGr.getValue('generation_time') || null,
            cancellation_time: bkgGr.getValue('cancellation_time') || null
        };
    },

    type: 'MetroPortalService'
};
