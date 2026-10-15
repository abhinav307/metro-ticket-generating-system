(function executeRule(current, previous /*null when async*/) {
    // Business Rule: Route Validation (Origin != Destination, Distance > 0)
    // Table: x_mtts_route
    // When: before insert, before update

    var logPrefix = '[x_mtts.BR_Route_Validation] ';

    if (current.origin_station == current.destination_station) {
        gs.addErrorMessage('Origin station and destination station cannot be identical.');
        current.setAbortAction(true);
        return;
    }

    var dist = parseFloat(current.distance_km);
    if (isNaN(dist) || dist <= 0.00 || dist > 500.00) {
        gs.addErrorMessage('Route distance must be greater than 0.00 km and at most 500.00 km.');
        current.setAbortAction(true);
        return;
    }

    // Verify stations are active
    var origGr = new GlideRecord('x_mtts_station');
    if (!origGr.get(current.origin_station) || !origGr.active) {
        gs.addErrorMessage('Origin station must exist and be active.');
        current.setAbortAction(true);
        return;
    }

    var destGr = new GlideRecord('x_mtts_station');
    if (!destGr.get(current.destination_station) || !destGr.active) {
        gs.addErrorMessage('Destination station must exist and be active.');
        current.setAbortAction(true);
        return;
    }
})(current, previous);
