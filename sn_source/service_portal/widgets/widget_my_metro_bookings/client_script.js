api.controller = function($scope, $sce, spUtil) {
    var c = this;

    c.searchQuery = '';
    c.selectedStatus = 'ALL';
    c.activeModal = null;
    c.modalItem = null;
    c.modalSvg = null;
    c.trustedSvg = null;
    c.cancelTarget = null;
    c.cancelQuote = null;
    c.cancelError = null;
    c.cancellingInProgress = false;

    // Filter local bookings
    c.applyFilter = function() {
        var list = c.data.bookings || [];
        var q = (c.searchQuery || '').toLowerCase().trim();
        var status = c.selectedStatus;

        c.filteredBookings = list.filter(function(item) {
            var matchesStatus = (status === 'ALL') || (item.status === status);
            var matchesSearch = !q ||
                (item.booking_reference && item.booking_reference.toLowerCase().indexOf(q) !== -1) ||
                (item.ticket_number && item.ticket_number.toLowerCase().indexOf(q) !== -1) ||
                (item.source_station && item.source_station.toLowerCase().indexOf(q) !== -1) ||
                (item.destination_station && item.destination_station.toLowerCase().indexOf(q) !== -1);

            return matchesStatus && matchesSearch;
        });
    };

    c.onSearchChange = function() {
        c.applyFilter();
    };

    c.setStatusFilter = function(status) {
        c.selectedStatus = status;
        c.applyFilter();
    };

    // Open Digital Ticket Modal
    c.openDetails = function(item) {
        c.modalItem = item;
        c.modalSvg = null;
        c.trustedSvg = null;
        c.activeModal = 'TICKET';

        c.server.get({
            action: 'get_details',
            bookingSysId: item.sys_id
        }).then(function(r) {
            if (r.data.detailsResult && r.data.detailsResult.success) {
                c.modalItem = r.data.detailsResult.details;
                if (c.modalItem.svgContent) {
                    c.modalSvg = c.modalItem.svgContent;
                    c.trustedSvg = $sce.trustAsHtml(c.modalItem.svgContent);
                }
            }
        });
    };

    // Open Cancellation Dialog with Policy Gate
    c.openCancel = function(item) {
        c.cancelTarget = item;
        c.cancelQuote = null;
        c.cancelError = null;
        c.cancellingInProgress = false;
        c.activeModal = 'CANCEL';

        c.server.get({
            action: 'get_cancel_quote',
            bookingSysId: item.sys_id
        }).then(function(r) {
            if (r.data.cancelQuote) {
                c.cancelQuote = r.data.cancelQuote;
            }
        });
    };

    // Execute Cancellation
    c.executeCancellation = function() {
        if (!c.cancelTarget) return;

        c.cancellingInProgress = true;
        c.cancelError = null;

        c.server.get({
            action: 'cancel_booking',
            bookingSysId: c.cancelTarget.sys_id
        }).then(function(r) {
            c.cancellingInProgress = false;
            var res = r.data.cancelResult;
            if (res && res.success) {
                c.closeModal();
                // Refresh full list
                c.server.update().then(function() {
                    c.applyFilter();
                });
            } else {
                c.cancelError = res ? res.message : 'Cancellation failed.';
            }
        });
    };

    c.closeModal = function() {
        c.activeModal = null;
        c.modalItem = null;
        c.cancelTarget = null;
        c.cancelError = null;
    };

    // Initial filter apply
    c.applyFilter();
};
