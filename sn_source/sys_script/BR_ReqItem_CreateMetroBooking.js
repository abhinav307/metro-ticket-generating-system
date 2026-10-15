(function executeRule(current, previous /*null when async*/) {
    var logPrefix = '[x_mtts.BR_ReqItem_CreateMetroBooking] ';

    // Verify Catalog Item scope
    var catItemName = '';
    if (current.cat_item) {
        catItemName = current.cat_item.name ? current.cat_item.name.toString() : current.cat_item.getDisplayValue();
    }

    if (catItemName !== 'Metro Ticket Booking') {
        return; // Ignore unrelated catalog items
    }

    var ritmId = current.getUniqueValue();

    // Idempotency Check: Verify a booking does not already exist for this request item
    var existingBkg = new GlideRecord('x_mtts_booking_ticket');
    existingBkg.addQuery('request_item', ritmId);
    existingBkg.query();
    if (existingBkg.hasNext()) {
        gs.info(logPrefix + 'Idempotent skip: Booking already exists for RITM ' + current.getValue('number'));
        return;
    }

    try {
        var vars = current.variables;
        var passengerId = current.getValue('opened_by') || gs.getUserID();

        var payload = {
            passengerId: passengerId,
            sourceStationId: vars.source_station ? vars.source_station.toString() : '',
            destinationStationId: vars.destination_station ? vars.destination_station.toString() : '',
            ticketTypeId: vars.ticket_type ? vars.ticket_type.toString() : '',
            travelDate: vars.travel_date ? vars.travel_date.toString() : '',
            passengerCount: parseInt(vars.passenger_count ? vars.passenger_count.toString() : '1', 10),
            requestItemId: ritmId
        };

        var bookingSvc = (typeof x_mtts !== 'undefined' && x_mtts.MetroBookingService) ? new x_mtts.MetroBookingService() : new MetroBookingService();
        var result = bookingSvc.createBooking(payload);

        if (result.success) {
            gs.info(logPrefix + 'Successfully linked booking ' + result.bookingReference + ' to RITM ' + current.getValue('number'));
            current.correlation_id = result.bookingReference;
            current.comments = 'Metro ticket booking submitted successfully. Booking Reference: ' + result.bookingReference + ' (Status: Pending Approval)';
            current.update();
        } else {
            gs.error(logPrefix + 'Booking creation failed for RITM ' + current.getValue('number') + ': ' + result.error.message);
            current.work_notes = 'Warning: Metro booking creation failed: ' + result.error.message;
            current.update();
        }
    } catch (ex) {
        gs.error(logPrefix + 'Unexpected exception during booking linkage: ' + ex.message);
    }
})(current, previous);
