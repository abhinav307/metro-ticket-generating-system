var MetroBookingService = Class.create();
MetroBookingService.prototype = {
    initialize: function() {
        this.logPrefix = '[x_mtts.MetroBookingService] ';
        this.calculator = new MetroFareCalculator();
    },

    /**
     * Creates an authoritative booking record linked to sc_req_item with immutable financial snapshots.
     * @param {Object} input
     *   - passengerId {String} sys_id of passenger (sys_user)
     *   - requestItemId {String} sys_id of parent sc_req_item
     *   - sourceStationId {String} sys_id or code of origin station
     *   - destStationId {String} sys_id or code of destination station
     *   - ticketTypeId {String} sys_id or code of ticket type
     *   - travelDate {String} YYYY-MM-DD
     *   - passengerCount {Number} Commuter count
     * @returns {Object} { success, bookingId, bookingReference, totalFare, currencyCode, error }
     */
    createBooking: function(input) {
        var response = {
            success: false,
            bookingId: '',
            bookingReference: '',
            totalFare: 0.00,
            currencyCode: '',
            error: null
        };

        if (!input || typeof input !== 'object') {
            response.error = { code: 'INVALID_INPUT', message: 'Input parameters are missing.' };
            return response;
        }

        var sourceId = (input.sourceStationId || input.sourceStation || '').toString().trim();
        var destId = (input.destStationId || input.destinationStationId || input.destinationStation || '').toString().trim();
        var typeId = (input.ticketTypeId || input.ticketType || '').toString().trim();

        // 1. Authoritative Server-Side Fare Calculation
        var calcResult = this.calculator.calculateFare({
            sourceStationId: sourceId,
            destStationId: destId,
            ticketTypeId: typeId,
            travelDate: input.travelDate,
            passengerCount: input.passengerCount
        });

        if (!calcResult.success) {
            response.error = { code: calcResult.errorCode, message: calcResult.errorMessage };
            gs.warn(this.logPrefix + 'Booking rejected: ' + calcResult.errorMessage);
            return response;
        }

        // 2. Resolve Station & Ticket Type Records
        var ticketType = this._resolveTicketTypeGr(typeId);
        if (!ticketType) {
            response.error = { code: 'RESOLVE_ERROR', message: 'Unable to resolve ticket type reference.' };
            return response;
        }

        var isPass = (calcResult.pricingModel === 'FIXED_RATE' || ticketType.getValue('code') === 'PASS');
        var sourceStation = isPass ? null : this._resolveStationGr(sourceId);
        var destStation = isPass ? null : this._resolveStationGr(destId);

        if (!isPass && (!sourceStation || !destStation)) {
            response.error = { code: 'RESOLVE_ERROR', message: 'Unable to resolve station references.' };
            return response;
        }

        // 3. Generate Unique Booking Reference: BKG-YYYYMMDD-XXXX
        var dateKey = (input.travelDate || '').replace(/-/g, '');
        if (!dateKey || dateKey.length !== 8) {
            var now = new GlideDate();
            dateKey = now.getByFormat('yyyyMMdd');
        }
        var randomSuffix = ('0000' + Math.floor(Math.random() * 10000)).slice(-4);
        var bookingRef = 'BKG-' + dateKey + '-' + randomSuffix;

        // 4. Insert Authoritative Booking Record
        try {
            var bkgGr = new GlideRecord('x_mtts_booking_ticket');
            bkgGr.initialize();
            bkgGr.booking_reference = bookingRef;
            bkgGr.passenger = input.passengerId || gs.getUserID();
            bkgGr.request_item = input.requestItemId;
            bkgGr.source_station = sourceStation ? sourceStation.getUniqueValue() : '';
            bkgGr.destination_station = destStation ? destStation.getUniqueValue() : '';
            bkgGr.ticket_type = ticketType.getUniqueValue();
            bkgGr.travel_date = input.travelDate;
            bkgGr.passenger_count = parseInt(input.passengerCount, 10);

            // Snapshot Fields (Immutable)
            bkgGr.calculated_distance = calcResult.distanceKm;
            bkgGr.calculated_unit_fare = calcResult.unitFare;
            bkgGr.unit_fare = calcResult.unitFare;
            bkgGr.total_fare = calcResult.totalFare;
            bkgGr.currency_code = calcResult.currencyCode;

            // Lifecycle Initial State
            bkgGr.status = 'Pending';

            var newSysId = bkgGr.insert();
            if (newSysId) {
                response.success = true;
                response.bookingId = newSysId;
                response.bookingReference = bookingRef;
                response.totalFare = calcResult.totalFare;
                response.currencyCode = calcResult.currencyCode;
                gs.info(this.logPrefix + 'Created booking ' + bookingRef + ' for passenger ' + bkgGr.passenger);
            } else {
                response.error = { code: 'INSERT_FAILED', message: 'Failed to insert booking record.' };
            }
        } catch (ex) {
            response.error = { code: 'EXECUTION_EXCEPTION', message: ex.message };
            gs.error(this.logPrefix + 'Exception during booking insert: ' + ex.message);
        }

        return response;
    },

    _resolveStationGr: function(id) {
        var gr = new GlideRecord('x_mtts_station');
        if (id.length === 32 && /^[0-9a-f]{32}$/i.test(id)) {
            if (gr.get(id)) return gr;
        }
        gr.initialize();
        gr.addQuery('station_code', id);
        gr.query();
        if (gr.next()) return gr;
        return null;
    },

    _resolveTicketTypeGr: function(id) {
        var gr = new GlideRecord('x_mtts_ticket_type');
        if (id.length === 32 && /^[0-9a-f]{32}$/i.test(id)) {
            if (gr.get(id)) return gr;
        }
        gr.initialize();
        gr.addQuery('code', id);
        gr.query();
        if (gr.next()) return gr;
        return null;
    },

    type: 'MetroBookingService'
};
