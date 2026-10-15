(function() {
    // Find Catalog Item sys_id
    var catGr = new GlideRecord('sc_cat_item');
    catGr.addQuery('name', 'Metro Ticket Booking');
    catGr.query();
    data.catItemSysId = catGr.next() ? catGr.getUniqueValue() : 'metro_ticket_booking';

    // Active stations count
    var stnGr = new GlideRecord('x_mtts_station');
    stnGr.addQuery('active', true);
    stnGr.query();
    data.stationCount = stnGr.getRowCount();

    // Base fare from active rule
    var fareGr = new GlideRecord('x_mtts_fare_rule');
    fareGr.addQuery('active', true);
    fareGr.query();
    if (fareGr.next()) {
        data.baseFare = parseFloat(fareGr.getValue('base_fare') || '10.00').toFixed(2);
    } else {
        data.baseFare = '10.00';
    }
})();
