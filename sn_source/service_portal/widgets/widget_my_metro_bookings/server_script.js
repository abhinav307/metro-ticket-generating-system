(function() {
    var portalSvc = new x_mtts.MetroPortalService();
    var refundCalc = new x_mtts.MetroRefundCalculator();

    // Check Cancellation Policy Governance Status
    var policyStatus = gs.getProperty('x_mtts.cancellation.policy_status', 'UNCONFIGURED');
    data.cancellationPolicyConfigured = (policyStatus === 'ACTIVE');

    // Catalog Item Reference
    var catGr = new GlideRecord('sc_cat_item');
    catGr.addQuery('name', 'Metro Ticket Booking');
    catGr.query();
    data.catItemSysId = catGr.next() ? catGr.getUniqueValue() : 'metro_ticket_booking';

    // Handle AJAX action calls
    if (input && input.action === 'get_details') {
        data.detailsResult = portalSvc.getBookingDetailsAndQR(input.bookingSysId);
        return;
    }

    if (input && input.action === 'get_cancel_quote') {
        if (!data.cancellationPolicyConfigured) {
            data.cancelQuote = {
                eligible: false,
                policyConfigured: false,
                refundPercentage: 0,
                refundAmount: 0.00,
                error: 'POLICY_UNCONFIGURED',
                message: 'Cancellation policy is currently UNCONFIGURED and pending formal stakeholder approval.'
            };
            return;
        }
        data.cancelQuote = refundCalc.calculateRefund(input.bookingSysId);
        return;
    }

    if (input && input.action === 'cancel_booking') {
        data.cancelResult = portalSvc.cancelBookingWithPolicyGate(input.bookingSysId);
        return;
    }

    // Default Load: Fetch bookings for authenticated passenger
    var res = portalSvc.getMyBookings();
    data.bookings = res.bookings || [];
})();
