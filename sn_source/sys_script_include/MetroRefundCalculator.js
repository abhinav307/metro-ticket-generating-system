var MetroRefundCalculator = Class.create();
MetroRefundCalculator.prototype = {
    initialize: function() {
        this.logPrefix = '[x_mtts.MetroRefundCalculator] ';
    },

    /**
     * Calculates audit refund amount based on configurable platform cancellation tiers.
     * Note: This calculation is for audit record tracking only; no automated monetary banking transfers are performed.
     * @param {Object} bookingGr GlideRecord of x_mtts_booking_ticket
     * @param {GlideDateTime} [cancellationDateTime] Cancellation timestamp. Defaults to now.
     * @returns {Object} { eligible, refundPercentage, refundAmount, policyRef, reason }
     */
    calculateRefund: function(bookingGr, cancellationDateTime) {
        var result = {
            eligible: false,
            refundPercentage: 0,
            refundAmount: 0.00,
            currencyCode: '',
            policyRef: '',
            reason: ''
        };

        if (!bookingGr) {
            result.reason = 'Booking record reference is null.';
            return result;
        }

        if (typeof bookingGr === 'string') {
            var gr = new GlideRecord('x_mtts_booking_ticket');
            if (gr.get(bookingGr)) {
                bookingGr = gr;
            } else {
                result.reason = 'Booking record not found for id: ' + bookingGr;
                return result;
            }
        }

        var totalFare = parseFloat(bookingGr.getValue('total_fare') || '0.00');
        var currencyCode = bookingGr.getValue('currency_code') || 'USD';
        result.currencyCode = currencyCode;

        if (isNaN(totalFare) || totalFare <= 0.00) {
            result.reason = 'Total booking fare is zero or invalid.';
            return result;
        }

        var travelDateStr = bookingGr.getValue('travel_date'); // YYYY-MM-DD
        if (!travelDateStr) {
            result.reason = 'Booking travel date is missing.';
            return result;
        }

        // Policy Gate Check: System property x_mtts.cancellation.policy_status
        // The default must remain UNCONFIGURED. The provisional refund tiers must not execute
        // as an approved operational policy unless explicitly configured as ACTIVE by authorized stakeholders.
        var policyStatus = gs.getProperty('x_mtts.cancellation.policy_status', 'UNCONFIGURED');
        if (policyStatus !== 'ACTIVE') {
            result.eligible = false;
            result.refundPercentage = 0;
            result.refundAmount = 0.00;
            result.policyRef = 'POLICY_UNCONFIGURED';
            result.reason = 'Cancellation and refund policy is currently UNCONFIGURED and pending formal stakeholder approval.';
            gs.warn(this.logPrefix + 'Refund calculation blocked: Policy status is ' + policyStatus);
            return result;
        }

        // Compute hours remaining until scheduled travel date (assumed start of travel date 00:00:00)
        var travelTimeMs = new Date(travelDateStr + 'T00:00:00').getTime();
        var cancelTimeMs = cancellationDateTime ? new Date(cancellationDateTime).getTime() : new Date().getTime();
        var hoursRemaining = (travelTimeMs - cancelTimeMs) / (1000 * 60 * 60);

        if (hoursRemaining < 0) {
            result.eligible = false;
            result.refundPercentage = 0;
            result.refundAmount = 0.00;
            result.policyRef = 'POLICY_PAST_TRAVEL_DATE';
            result.reason = 'Cancellation requested after scheduled travel date. No refund applicable.';
            return result;
        }

        // Read and validate configurable policy percentage properties
        var pctOver24h = parseInt(gs.getProperty('x_mtts.cancellation_tier_greater_24h_pct', '90'), 10);
        var pct2to24h = parseInt(gs.getProperty('x_mtts.cancellation_tier_2_to_24h_pct', '75'), 10);
        var pctUnder2h = parseInt(gs.getProperty('x_mtts.cancellation_tier_less_2h_pct', '0'), 10);

        if (isNaN(pctOver24h) || isNaN(pct2to24h) || isNaN(pctUnder2h) ||
            pctOver24h < 0 || pctOver24h > 100 ||
            pct2to24h < 0 || pct2to24h > 100 ||
            pctUnder2h < 0 || pctUnder2h > 100) {
            result.eligible = false;
            result.refundPercentage = 0;
            result.refundAmount = 0.00;
            result.policyRef = 'POLICY_CONFIG_ERROR';
            result.reason = 'Invalid refund percentage configuration detected.';
            gs.error(this.logPrefix + result.reason);
            return result;
        }

        if (hoursRemaining > 24) {
            result.refundPercentage = pctOver24h;
            result.policyRef = 'TIER_GREATER_24H';
        } else if (hoursRemaining >= 2) {
            result.refundPercentage = pct2to24h;
            result.policyRef = 'TIER_2_TO_24H';
        } else {
            result.refundPercentage = pctUnder2h;
            result.policyRef = 'TIER_LESS_2H';
        }

        var rawRefund = totalFare * (result.refundPercentage / 100.0);
        result.refundAmount = Math.round((rawRefund + Number.EPSILON) * 100) / 100;
        result.eligible = result.refundPercentage > 0;
        result.reason = 'Calculated ' + result.refundPercentage + '% refund under policy tier ' + result.policyRef;

        gs.info(this.logPrefix + result.reason + ' for booking ' + bookingGr.getValue('booking_reference') + ': ' + result.refundAmount + ' ' + currencyCode);
        return result;
    },

    type: 'MetroRefundCalculator'
};
