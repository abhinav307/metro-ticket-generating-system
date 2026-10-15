(function() {
    data.userName = gs.getUserDisplayName();
    data.userId = gs.getUserID();

    // Lookup Catalog Item sys_id for 'Metro Ticket Booking'
    var catGr = new GlideRecord('sc_cat_item');
    catGr.addQuery('name', 'Metro Ticket Booking');
    catGr.query();
    if (catGr.next()) {
        data.catItemSysId = catGr.getUniqueValue();
    } else {
        data.catItemSysId = 'metro_ticket_booking';
    }

    // Active Bookings Count
    var bkgGr = new GlideRecord('x_mtts_booking_ticket');
    bkgGr.addQuery('passenger', data.userId);
    bkgGr.addQuery('status', 'IN', 'Pending,Approved,Generated');
    bkgGr.query();
    data.activeBookingsCount = bkgGr.getRowCount();
})();
