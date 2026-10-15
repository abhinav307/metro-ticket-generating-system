(function executeRule(current, previous /*null when async*/) {
    // Business Rule: Station Referential Integrity
    // Table: x_mtts_station
    // When: before delete

    var logPrefix = '[x_mtts.BR_Station_ReferentialIntegrity] ';
    var stationId = current.getUniqueValue();

    // Check 1: Active or existing routes
    var routeGr = new GlideRecord('x_mtts_route');
    routeGr.addQuery('origin_station', stationId).addOrCondition('destination_station', stationId);
    routeGr.query();
    if (routeGr.hasNext()) {
        gs.addErrorMessage('Cannot delete station: Station is referenced by existing routes. Deactivate the station instead.');
        current.setAbortAction(true);
        return;
    }

    // Check 2: Existing bookings
    var bkgGr = new GlideRecord('x_mtts_booking_ticket');
    bkgGr.addQuery('source_station', stationId).addOrCondition('destination_station', stationId);
    bkgGr.query();
    if (bkgGr.hasNext()) {
        gs.addErrorMessage('Cannot delete station: Station is referenced by historic booking records. Deactivate the station instead.');
        current.setAbortAction(true);
        return;
    }
})(current, previous);
