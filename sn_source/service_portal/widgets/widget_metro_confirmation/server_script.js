(function() {
    var bookingRef = $sp.getParameter('booking_ref') || $sp.getParameter('sysparm_booking_ref');
    var bookingId = $sp.getParameter('sys_id') || $sp.getParameter('bkg_id');

    var bkgGr = new GlideRecord('x_mtts_booking_ticket');
    var found = false;

    if (bookingId) {
        found = bkgGr.get(bookingId);
    } else if (bookingRef) {
        bkgGr.addQuery('booking_reference', bookingRef);
        bkgGr.query();
        found = bkgGr.next();
    } else {
        // Find most recent booking for user
        bkgGr.addQuery('passenger', gs.getUserID());
        bkgGr.orderByDesc('sys_created_on');
        bkgGr.setLimit(1);
        bkgGr.query();
        found = bkgGr.next();
    }

    // Ownership Verification
    if (found && (bkgGr.getValue('passenger') === gs.getUserID() || gs.hasRole('x_mtts.admin'))) {
        var portalSvc = new x_mtts.MetroPortalService();
        data.booking = portalSvc._formatBookingSummary(bkgGr);
    } else {
        data.booking = {
            booking_reference: 'BKG-PENDING',
            source_station: 'Pending Registration',
            destination_station: 'Pending Registration',
            travel_date: new GlideDate().toString(),
            ticket_type: 'Single Journey',
            passenger_count: 1,
            total_fare: '0.00'
        };
    }

    // Catalog Item sys_id
    var catGr = new GlideRecord('sc_cat_item');
    catGr.addQuery('name', 'Metro Ticket Booking');
    catGr.query();
    data.catItemSysId = catGr.next() ? catGr.getUniqueValue() : 'metro_ticket_booking';
})();
