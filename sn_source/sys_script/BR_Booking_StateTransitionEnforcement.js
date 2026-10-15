(function executeRule(current, previous /*null when async*/) {
    // Business Rule: Lifecycle State Machine Transition Enforcement
    // Table: x_mtts_booking_ticket
    // When: before insert, before update

    var logPrefix = '[x_mtts.BR_Booking_StateTransitionEnforcement] ';

    if (current.isNewRecord()) {
        // Enforce initial status MUST be 'Pending'
        if (current.status != 'Pending') {
            gs.error(logPrefix + 'Illegal initial state: ' + current.status + '. All new bookings must initialize as Pending.');
            current.status = 'Pending';
        }
        return;
    }

    if (!current.status.changes()) {
        return;
    }

    var fromState = previous.status.toString();
    var toState = current.status.toString();

    // Define legal state transition map for baseline 4-status lifecycle
    // (Pending, Approved, Generated, Cancelled)
    // 'Rejected' remains a proposed 5th status requiring formal stakeholder sign-off
    var enableRejected = (gs.getProperty('x_mtts.lifecycle.enable_rejected_status', 'false') === 'true');
    var legalTransitions = {
        'Pending': enableRejected ? ['Approved', 'Cancelled', 'Rejected'] : ['Approved', 'Cancelled'],
        'Approved': ['Generated', 'Approved', 'Cancelled'], // Allows retry in Approved state or cancellation
        'Generated': ['Cancelled'],
        'Cancelled': [], // Terminal
        'Rejected': []   // Terminal if enabled
    };

    var allowedTargets = legalTransitions[fromState] || [];
    var isLegal = false;
    for (var i = 0; i < allowedTargets.length; i++) {
        if (allowedTargets[i] === toState) {
            isLegal = true;
            break;
        }
    }

    if (!isLegal) {
        var msg = 'Illegal state transition attempted from ' + fromState + ' to ' + toState + ' for booking ' + current.booking_reference;
        gs.error(logPrefix + msg);
        gs.addErrorMessage(msg);
        current.setAbortAction(true);
        return;
    }

    // Specific state transition enforcement
    if (toState === 'Generated') {
        if (!current.ticket_number || !current.qr_token_hash) {
            gs.error(logPrefix + 'Cannot transition to Generated without an issued ticket_number and qr_token_hash.');
            current.setAbortAction(true);
            return;
        }
    } else if (toState === 'Cancelled') {
        // Enforce cancellation timestamp
        current.cancellation_time = new GlideDateTime();

        // Distinguish administrative rejection from passenger ticket cancellation
        var isAdminRejection = (fromState === 'Pending') ||
            (current.cancellation_reason && current.cancellation_reason.toString().indexOf('Administrative Rejection') === 0);

        if (isAdminRejection) {
            // Administrative rejection before fulfillment: No passenger refund fee applies
            current.refund_amount = 0.00;
        } else {
            // Passenger ticket cancellation requires active cancellation policy
            var policyStatus = gs.getProperty('x_mtts.cancellation.policy_status', 'UNCONFIGURED');
            if (policyStatus !== 'ACTIVE' && !gs.hasRole('x_mtts.admin')) {
                var abortMsg = 'Cancellation blocked: Cancellation policy is UNCONFIGURED. Status transition aborted.';
                gs.error(logPrefix + abortMsg);
                gs.addErrorMessage(abortMsg);
                current.setAbortAction(true);
                return;
            }

            // Calculate and snapshot audit refund if not already set
            if (!current.refund_amount || parseFloat(current.refund_amount) === 0) {
                var refundCalc = new x_mtts.MetroRefundCalculator();
                var refundResult = refundCalc.calculateRefund(current, current.cancellation_time);
                current.refund_amount = refundResult.refundAmount;
            }
        }
    }
})(current, previous);
