(function executeRule(current, previous /*null when async*/) {
    // Business Rule: Snapshot Immutability & Anti-Tamper Protection
    // Table: x_mtts_booking_ticket
    // When: before insert, before update

    var logPrefix = '[x_mtts.BR_Booking_FinancialSnapshot] ';

    if (current.isNewRecord()) {
        // Enforce authoritative server calculation on insert if unit_fare or total_fare are empty or need verification
        var calc = new x_mtts.MetroFareCalculator();
        var pricing = calc.calculateFare({
            sourceStationId: current.source_station.toString(),
            destStationId: current.destination_station.toString(),
            ticketTypeId: current.ticket_type.toString(),
            travelDate: current.travel_date.toString(),
            passengerCount: current.passenger_count
        });

        if (!pricing.success) {
            gs.error(logPrefix + 'Blocked insert due to invalid calculation: ' + pricing.errorMessage);
            current.setAbortAction(true);
            return;
        }

        // Authoritatively lock snapshots
        current.calculated_distance = pricing.distanceKm;
        current.unit_fare = pricing.unitFare;
        current.total_fare = pricing.totalFare;
        current.currency_code = pricing.currencyCode;
    } else {
        // On update: Protect snapshot fields from any mutation
        if (current.unit_fare.changes() || current.total_fare.changes() || current.calculated_distance.changes() || current.currency_code.changes()) {
            gs.error(logPrefix + 'Illegal modification attempt on immutable financial snapshots for booking ' + current.booking_reference);
            current.unit_fare = previous.unit_fare;
            current.total_fare = previous.total_fare;
            current.calculated_distance = previous.calculated_distance;
            current.currency_code = previous.currency_code;
        }

        // Ticket number once assigned cannot be changed
        if (previous.ticket_number && current.ticket_number.changes() && current.ticket_number != previous.ticket_number) {
            gs.error(logPrefix + 'Illegal modification attempt on issued ticket number: ' + previous.ticket_number);
            current.ticket_number = previous.ticket_number;
        }
    }
})(current, previous);
