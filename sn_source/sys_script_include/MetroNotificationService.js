/**
 * MetroNotificationService.js
 * 
 * Scoped Application: x_mtts
 * Script Include: MetroNotificationService
 * Client Callable: false
 * Active: true
 * 
 * Centralized service managing event-driven notifications across the Metro Ticket Generating System lifecycle.
 * 
 * Supported Events:
 * 1. x_mtts.booking.submitted     -> Passenger receipt upon initial Pending submission
 * 2. x_mtts.approval.requested    -> Station Duty Approvers review alert
 * 3. x_mtts.booking.approved     -> Passenger advisory (approval granted, fulfillment starting)
 * 4. x_mtts.ticket.generated      -> Passenger pass delivery (issued ticket number + secure portal link + attachment)
 * 5. x_mtts.booking.declined      -> Passenger notification for administrative decline
 * 6. x_mtts.booking.cancelled     -> Passenger cancellation confirmation with refund breakdown
 * 7. x_mtts.operational.failure   -> Administrator alert for fulfillment exceptions
 * 
 * Security & Delivery Rules:
 * - Never includes raw bearer tokens, secrets, or token hashes in email text.
 * - Enforces idempotency to prevent duplicate emails upon workflow retries.
 * - Handles email client SVG limitations via dual-delivery: attached SVG + authenticated portal link.
 */
var MetroNotificationService = Class.create();

// In-memory dispatched event cache for duplicate suppression
MetroNotificationService._dispatchedCache = {};

MetroNotificationService.prototype = {
    initialize: function() {
        this.logPrefix = '[x_mtts:MetroNotificationService] ';
    },

    /**
     * Dispatches an event-driven notification with deduplication checks.
     * @param {String} eventName The sysevent name
     * @param {GlideRecord} bookingGr The x_mtts_booking_ticket record
     * @param {Object} extraParams Optional parameters (comments, refundInfo, errorInfo)
     * @returns {Object} Dispatch result { success: boolean, eventId: string, message: string }
     */
    dispatch: function(eventName, bookingGr, extraParams) {
        if (!eventName || !bookingGr) {
            return { success: false, code: 'INVALID_PARAMETERS', message: 'Event name and booking record are required.' };
        }

        // Global master switch check
        if (gs.getProperty('x_mtts.notifications.enabled', 'true') !== 'true') {
            return { success: false, code: 'NOTIFICATIONS_DISABLED', message: 'Outbound notifications globally disabled by property.' };
        }

        var bookingId = bookingGr.getUniqueValue();
        var bookingRef = bookingGr.getValue('booking_reference') || bookingId;
        var idempotencyKey = eventName + '_' + bookingId;

        // Duplicate prevention check
        if (this._isDuplicate(idempotencyKey)) {
            gs.info(this.logPrefix + 'Duplicate event suppressed for ' + idempotencyKey);
            return { success: true, code: 'SUPPRESSED_DUPLICATE', message: 'Duplicate event suppressed.' };
        }

        extraParams = extraParams || {};
        var parm1 = extraParams.recipient || this._resolveRecipient(eventName, bookingGr);
        var parm2 = JSON.stringify(this._buildEventPayload(eventName, bookingGr, extraParams));

        try {
            // Queue ServiceNow native platform event
            gs.eventQueue(eventName, bookingGr, parm1, parm2);
            this._recordDispatch(idempotencyKey);

            gs.info(this.logPrefix + 'Successfully queued event ' + eventName + ' for booking ' + bookingRef);
            return {
                success: true,
                code: 'EVENT_QUEUED',
                eventName: eventName,
                recipient: parm1,
                bookingReference: bookingRef
            };
        } catch (ex) {
            gs.error(this.logPrefix + 'Failed to queue event ' + eventName + ': ' + ex.message);
            return { success: false, code: 'QUEUE_ERROR', message: ex.message };
        }
    },

    /**
     * Resolves default recipient based on event type.
     */
    _resolveRecipient: function(eventName, bookingGr) {
        if (eventName === 'x_mtts.approval.requested') {
            return 'Metro Station Approvers';
        }
        if (eventName === 'x_mtts.operational.failure') {
            return 'Metro Operations Administrators';
        }

        // For passenger events, resolve passenger email from sys_user or passenger field
        var passengerId = bookingGr.getValue('passenger');
        if (passengerId) {
            var userGr = new GlideRecord('sys_user');
            if (userGr.get(passengerId)) {
                return userGr.getValue('email') || userGr.getValue('user_name');
            }
        }
        return bookingGr.getValue('sys_created_by') || 'commuter@metro.local';
    },

    /**
     * Builds safe, sanitized JSON payload for the notification parm2.
     * Absolutely zero raw tokens, token hashes, or secret passwords.
     */
    _buildEventPayload: function(eventName, bookingGr, extraParams) {
        var base = {
            booking_reference: bookingGr.getValue('booking_reference'),
            travel_date: bookingGr.getValue('travel_date'),
            passenger_count: bookingGr.getValue('passenger_count') || '1',
            status: bookingGr.getValue('status'),
            portal_url: '/metro?id=my_metro_bookings&sys_id=' + bookingGr.getUniqueValue()
        };

        if (eventName === 'x_mtts.booking.submitted') {
            base.total_fare = bookingGr.getValue('total_fare');
            base.currency = gs.getProperty('x_mtts.default_currency', 'USD');
            base.notice = 'Your booking request has been submitted and is currently Pending station approval.';
        } else if (eventName === 'x_mtts.approval.requested') {
            base.total_fare = bookingGr.getValue('total_fare');
            base.approval_url = '/nav_to.do?uri=sysapproval_approver.do?sys_id=' + (extraParams.approvalId || '');
        } else if (eventName === 'x_mtts.booking.approved') {
            base.notice = 'Booking approved. Digital ticket generation and QR issuance is currently in progress.';
        } else if (eventName === 'x_mtts.ticket.generated') {
            base.ticket_number = bookingGr.getValue('ticket_number');
            base.attachment_id = bookingGr.getValue('qr_attachment');
            base.notice = 'Your digital ticket is ready! Present the attached QR pass or open your ticket in the Service Portal.';
        } else if (eventName === 'x_mtts.booking.declined') {
            base.decline_reason = extraParams.reason || bookingGr.getValue('cancellation_reason') || 'Administrative Rejection by Station Operations';
            base.notice = 'Your booking request was declined by Station Operations. No charges were incurred.';
        } else if (eventName === 'x_mtts.booking.cancelled') {
            base.cancellation_reason = bookingGr.getValue('cancellation_reason') || 'Passenger cancellation';
            base.refund_amount = bookingGr.getValue('refund_amount') || '0.00';
            base.refund_status = extraParams.refundStatus || (gs.getProperty('x_mtts.cancellation.policy_status', 'UNCONFIGURED') === 'ACTIVE' ? 'CALCULATED' : 'POLICY_UNCONFIGURED');
        } else if (eventName === 'x_mtts.operational.failure') {
            base.error_code = extraParams.errorCode || 'UNKNOWN_ERROR';
            base.error_message = extraParams.errorMessage || 'An operational exception occurred.';
        }

        return base;
    },

    /**
     * Renders an HTML email body conforming to transit accessibility and branding standards.
     * Evaluates client compatibility (offering both SVG attachment guidance and portal link).
     */
    renderEmailBody: function(eventName, payload) {
        var sender = gs.getProperty('x_mtts.notifications.sender_display_name', 'Metro Transit Operations');
        var html = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden;">';
        
        // Header
        html += '<div style="background-color: #0F172A; color: #FFFFFF; padding: 20px; text-align: center;">';
        html += '<h2 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">Metro Transit Authority</h2>';
        html += '<p style="margin: 5px 0 0 0; font-size: 13px; color: #94A3B8;">' + sender + '</p>';
        html += '</div>';

        // Body Content
        html += '<div style="padding: 24px; color: #334155; line-height: 1.5;">';

        if (eventName === 'x_mtts.booking.submitted') {
            html += '<h3 style="color: #0F172A; margin-top: 0;">Booking Submitted (Pending Approval)</h3>';
            html += '<p>Thank you for booking with Metro Transit. Your booking reference is <strong>' + payload.booking_reference + '</strong>.</p>';
            html += '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">';
            html += '<tr><td style="padding: 8px; border-bottom: 1px solid #F1F5F9; color: #64748B;">Travel Date:</td><td style="padding: 8px; border-bottom: 1px solid #F1F5F9; font-weight: bold;">' + payload.travel_date + '</td></tr>';
            html += '<tr><td style="padding: 8px; border-bottom: 1px solid #F1F5F9; color: #64748B;">Passengers:</td><td style="padding: 8px; border-bottom: 1px solid #F1F5F9; font-weight: bold;">' + payload.passenger_count + '</td></tr>';
            html += '<tr><td style="padding: 8px; border-bottom: 1px solid #F1F5F9; color: #64748B;">Total Fare:</td><td style="padding: 8px; border-bottom: 1px solid #F1F5F9; font-weight: bold; color: #0284C7;">' + (payload.currency || '$') + ' ' + (payload.total_fare || '0.00') + '</td></tr>';
            html += '<tr><td style="padding: 8px; color: #64748B;">Status:</td><td style="padding: 8px; font-weight: bold; color: #D97706;">Pending</td></tr>';
            html += '</table>';
            html += '<p style="font-size: 13px; color: #64748B;"><em>Note: Digital tickets with QR codes are issued only after station operational approval.</em></p>';
        } else if (eventName === 'x_mtts.ticket.generated') {
            html += '<h3 style="color: #059669; margin-top: 0;">Your Metro Pass is Ready!</h3>';
            html += '<p>Booking <strong>' + payload.booking_reference + '</strong> has been fulfilled.</p>';
            html += '<div style="background-color: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 6px; padding: 16px; text-align: center; margin: 16px 0;">';
            html += '<div style="font-size: 12px; color: #64748B; text-transform: uppercase;">Ticket Number</div>';
            html += '<div style="font-size: 20px; font-weight: bold; color: #0F172A; letter-spacing: 1px; margin: 4px 0;">' + payload.ticket_number + '</div>';
            html += '<div style="font-size: 13px; color: #059669; font-weight: bold;">Status: Generated / Active</div>';
            html += '</div>';
            html += '<p><strong>QR Delivery Notice:</strong> Due to email client image restrictions on vector SVGs (e.g. in Outlook or Gmail), your scannable QR ticket is provided in two ways:</p>';
            html += '<ol style="padding-left: 20px; color: #475569;">';
            html += '<li>Attached directly to this email as a vector SVG file.</li>';
            html += '<li>Available anytime on your mobile device via the Service Portal.</li>';
            html += '</ol>';
            html += '<div style="text-align: center; margin: 24px 0;">';
            html += '<a href="' + payload.portal_url + '" style="background-color: #0284C7; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Ticket in Portal</a>';
            html += '</div>';
        } else if (eventName === 'x_mtts.booking.declined') {
            html += '<h3 style="color: #BE123C; margin-top: 0;">Booking Request Declined</h3>';
            html += '<p>Your metro ticket booking request (Reference: <strong>' + payload.booking_reference + '</strong>) was declined by Station Operations.</p>';
            html += '<div style="background-color: #FFF1F2; border: 1px solid #FECDD3; border-radius: 6px; padding: 16px; margin: 16px 0; color: #9F1239;">';
            html += '<strong>Reason for Decline:</strong> ' + payload.decline_reason;
            html += '</div>';
            html += '<p style="font-size: 13px; color: #64748B;">No charges were incurred. If you believe this was in error, please submit a new booking or visit the station helpdesk.</p>';
        } else if (eventName === 'x_mtts.booking.cancelled') {
            html += '<h3 style="color: #475569; margin-top: 0;">Booking Cancellation Confirmation</h3>';
            html += '<p>Booking reference <strong>' + payload.booking_reference + '</strong> has been cancelled.</p>';
            html += '<p><strong>Cancellation Reason:</strong> ' + payload.cancellation_reason + '</p>';
            if (payload.refund_status === 'CALCULATED') {
                html += '<p><strong>Calculated Refund Amount:</strong> $' + payload.refund_amount + '</p>';
            } else {
                html += '<div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px; border-radius: 6px; font-size: 13px; color: #64748B;">';
                html += 'Notice: Standard automated refund policies are currently unconfigured by the transit authority. A customer service agent will review this cancellation.';
                html += '</div>';
            }
        } else if (eventName === 'x_mtts.approval.requested') {
            html += '<h3 style="color: #0F172A; margin-top: 0;">Station Approval Required</h3>';
            html += '<p>A new metro ticket booking requires operational validation.</p>';
            html += '<p><strong>Booking Reference:</strong> ' + payload.booking_reference + '</p>';
            html += '<p><strong>Travel Date:</strong> ' + payload.travel_date + ' | <strong>Passengers:</strong> ' + payload.passenger_count + '</p>';
            html += '<div style="margin: 20px 0;"><a href="' + payload.approval_url + '" style="background-color: #0F172A; color: #FFFFFF; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Review Approval Request</a></div>';
        } else if (eventName === 'x_mtts.operational.failure') {
            html += '<h3 style="color: #DC2626; margin-top: 0;">Operational Fulfillment Alert</h3>';
            html += '<p>An operational exception occurred during booking fulfillment.</p>';
            html += '<p><strong>Record Reference:</strong> ' + payload.booking_reference + '</p>';
            html += '<p><strong>Error Code:</strong> ' + payload.error_code + '</p>';
            html += '<p><strong>Diagnostic:</strong> ' + payload.error_message + '</p>';
        }

        html += '</div>';

        // Footer
        html += '<div style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 16px; text-align: center; font-size: 12px; color: #94A3B8;">';
        html += '<p style="margin: 0;">Metro Ticket Generating System &bull; Automated Transit Notification</p>';
        html += '</div>';
        html += '</div>';

        return html;
    },

    /**
     * Checks if key has already been dispatched.
     */
    _isDuplicate: function(key) {
        return !!MetroNotificationService._dispatchedCache[key];
    },

    /**
     * Records dispatch in cache.
     */
    _recordDispatch: function(key) {
        MetroNotificationService._dispatchedCache[key] = new Date().getTime();
    },

    /**
     * Clears cache (useful for test isolation).
     */
    clearDispatchCache: function() {
        MetroNotificationService._dispatchedCache = {};
    },

    type: 'MetroNotificationService'
};

if (typeof module !== 'undefined') {
    module.exports = MetroNotificationService;
}
