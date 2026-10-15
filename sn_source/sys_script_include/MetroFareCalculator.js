var MetroFareCalculator = Class.create();
MetroFareCalculator.prototype = {
    initialize: function() {
        this.logPrefix = '[x_mtts.MetroFareCalculator] ';
    },

    /**
     * Authoritative Server-Side Fare Calculation Engine
     * @param {Object} params Input parameters
     *   - sourceStationId {String} sys_id or code of origin station
     *   - destStationId {String} sys_id or code of destination station
     *   - ticketTypeId {String} sys_id or code of ticket type (SINGLE, RETURN, PASS)
     *   - travelDate {String} Date string YYYY-MM-DD
     *   - passengerCount {Number|String} Number of passengers (integer)
     * @returns {Object} Structured pricing payload
     */
    calculateFare: function(params) {
        if (arguments.length > 1 || typeof params === 'string') {
            params = {
                sourceStationId: arguments[0],
                destStationId: arguments[1] || arguments[0],
                ticketTypeId: arguments[2],
                passengerCount: arguments[3],
                fareRuleId: arguments[4],
                travelDate: arguments[5]
            };
        }

        var result = {
            success: false,
            distanceKm: 0.00,
            unitFare: 0.00,
            totalFare: 0.00,
            currencyCode: '',
            ruleId: '',
            errorCode: '',
            errorMessage: ''
        };

        if (!params || typeof params !== 'object') {
            return this._fail(result, 'INVALID_INPUT', 'Calculation parameters are missing or invalid.');
        }

        var sourceId = (params.sourceStationId || params.sourceStation || '').toString().trim();
        var destId = (params.destStationId || params.destinationStationId || params.destinationStation || '').toString().trim();
        var typeId = (params.ticketTypeId || params.ticketType || '').toString().trim();
        var travelDateStr = (params.travelDate || '').toString().trim();
        var paxRaw = params.passengerCount;

        // 1. Validate Passenger Count
        var pax = parseInt(paxRaw, 10);
        var maxPax = parseInt(gs.getProperty('x_mtts.max_passengers_per_booking', '6'), 10);
        if (isNaN(pax) || pax < 1 || pax > maxPax) {
            return this._fail(result, 'INVALID_PASSENGER_COUNT', 'Passenger count must be an integer between 1 and ' + maxPax + '.');
        }

        // 2. Validate Travel Date (defaults to today if omitted)
        if (!travelDateStr) {
            travelDateStr = new GlideDate().toString();
        }
        if (!this._isValidDate(travelDateStr)) {
            return this._fail(result, 'INVALID_TRAVEL_DATE', 'A valid travel date in YYYY-MM-DD format is required.');
        }

        // 3. Resolve & Validate Ticket Type
        var ticketType = this._resolveTicketType(typeId);
        if (!ticketType) {
            return this._fail(result, 'INVALID_INPUT', 'Selected ticket type is invalid or inactive.');
        }

        var isPass = (ticketType.code === 'PASS' || ticketType.pricing_model === 'Fixed' || ticketType.pricing_model === 'FIXED_RATE');

        // 4. Validate Stations (required for Single/Return; optional/bypassed for Pass)
        var sourceStation = null;
        var destStation = null;

        if (!isPass) {
            if (!sourceId || !destId) {
                return this._fail(result, 'INVALID_STATIONS', 'Origin and destination stations are required.');
            }

            if (sourceId === destId) {
                return this._fail(result, 'SAME_STATION', 'Origin and destination stations cannot be identical.');
            }

            sourceStation = this._resolveStation(sourceId);
            destStation = this._resolveStation(destId);

            if (!sourceStation || !sourceStation.active || !destStation || !destStation.active) {
                return this._fail(result, 'INVALID_STATIONS', 'One or more selected stations are inactive or do not exist.');
            }
        } else {
            if (sourceId) sourceStation = this._resolveStation(sourceId);
            if (destId) destStation = this._resolveStation(destId);
        }

        // 5. Query Applicable Active Fare Rule
        var currencyCode = gs.getProperty('x_mtts.default_currency', 'USD');
        var fareRule = this._resolveFareRule(ticketType.sys_id, travelDateStr, currencyCode);
        if (!fareRule) {
            return this._fail(result, 'NO_ACTIVE_FARE_RULE', 'No active fare rule found for ticket type ' + ticketType.name + ' on ' + travelDateStr + '.');
        }

        result.currencyCode = fareRule.currency || currencyCode;
        result.ruleId = fareRule.rule_id;

        // 6. Execute Pricing Calculation
        if (isPass) {
            // Pass tickets bypass route lookup and distance calculation
            if (fareRule.fixed_fare === null || fareRule.fixed_fare === undefined || parseFloat(fareRule.fixed_fare) <= 0) {
                return this._fail(result, 'INVALID_FARE_CONFIGURATION', 'Active pass fare rule lacks a valid fixed fare.');
            }
            result.distanceKm = 0.00;
            result.unitFare = this._roundCurrency(parseFloat(fareRule.fixed_fare));
        } else {
            // Single and Return require route matrix lookup
            var route = this._resolveRoute(sourceStation.sys_id, destStation.sys_id);
            if (!route || !route.active) {
                return this._fail(result, 'NO_ACTIVE_ROUTE_FOUND', 'No active transit route exists between ' + sourceStation.name + ' and ' + destStation.name + '.');
            }

            var dist = parseFloat(route.distance_km);
            if (isNaN(dist) || dist <= 0.00) {
                return this._fail(result, 'INVALID_FARE_CONFIGURATION', 'Route distance is invalid or non-positive.');
            }
            result.distanceKm = dist;

            var ratePerKm = parseFloat(fareRule.rate_per_km);
            var minFare = parseFloat(fareRule.minimum_fare || 0.00);

            if (isNaN(ratePerKm) || ratePerKm <= 0.00) {
                return this._fail(result, 'INVALID_FARE_CONFIGURATION', 'Fare rule has an invalid rate per kilometer.');
            }

            var distanceFare = dist * ratePerKm;
            var singleUnitFare = Math.max(minFare, distanceFare);

            if (ticketType.code === 'RETURN') {
                var multiplier = parseFloat(fareRule.return_multiplier);
                if (isNaN(multiplier) || multiplier <= 0.00) {
                    return this._fail(result, 'INVALID_FARE_CONFIGURATION', 'Return ticket fare rule lacks a valid return multiplier.');
                }
                result.unitFare = this._roundCurrency(singleUnitFare * multiplier);
            } else {
                result.unitFare = this._roundCurrency(singleUnitFare);
            }
        }

        // 7. Calculate Total Fare
        result.pricingModel = isPass ? 'FIXED_RATE' : 'DISTANCE_BASED';
        result.ticketTypeCode = ticketType.code;
        result.totalFare = this._roundCurrency(result.unitFare * pax);
        result.success = true;

        return result;
    },

    _resolveStation: function(identifier) {
        var gr = new GlideRecord('x_mtts_station');
        if (identifier.length === 32 && /^[0-9a-f]{32}$/i.test(identifier)) {
            if (gr.get(identifier)) {
                return { sys_id: gr.getUniqueValue(), station_code: gr.getValue('station_code'), name: gr.getValue('name'), active: gr.getValue('active') == '1' || gr.getValue('active') === true };
            }
        }
        gr.initialize();
        gr.addQuery('station_code', identifier);
        gr.query();
        if (gr.next()) {
            return { sys_id: gr.getUniqueValue(), station_code: gr.getValue('station_code'), name: gr.getValue('name'), active: gr.getValue('active') == '1' || gr.getValue('active') === true };
        }
        return null;
    },

    _resolveTicketType: function(identifier) {
        var gr = new GlideRecord('x_mtts_ticket_type');
        if (identifier.length === 32 && /^[0-9a-f]{32}$/i.test(identifier)) {
            if (gr.get(identifier)) {
                return { sys_id: gr.getUniqueValue(), code: gr.getValue('code'), name: gr.getValue('name'), pricing_model: gr.getValue('pricing_model'), active: gr.getValue('active') == '1' || gr.getValue('active') === true };
            }
        }
        gr.initialize();
        gr.addQuery('code', identifier);
        gr.query();
        if (gr.next()) {
            return { sys_id: gr.getUniqueValue(), code: gr.getValue('code'), name: gr.getValue('name'), pricing_model: gr.getValue('pricing_model'), active: gr.getValue('active') == '1' || gr.getValue('active') === true };
        }
        return null;
    },

    _resolveRoute: function(originSysId, destSysId) {
        var gr = new GlideRecord('x_mtts_route');
        gr.addQuery('origin_station', originSysId);
        gr.addQuery('destination_station', destSysId);
        gr.addQuery('active', true);
        gr.query();
        if (gr.next()) {
            return {
                sys_id: gr.getUniqueValue(),
                route_id: gr.getValue('route_id'),
                distance_km: gr.getValue('distance_km'),
                active: gr.getValue('active') == '1' || gr.getValue('active') === true
            };
        }
        return null;
    },

    _resolveFareRule: function(ticketTypeSysId, travelDateStr, currencyCode) {
        var gr = new GlideRecord('x_mtts_fare_rule');
        gr.addQuery('ticket_type', ticketTypeSysId);
        gr.addQuery('active', true);
        gr.addQuery('currency', currencyCode);
        gr.addQuery('effective_start', '<=', travelDateStr);
        gr.query();

        while (gr.next()) {
            var endStr = gr.getValue('effective_end');
            if (!endStr || endStr >= travelDateStr) {
                return {
                    sys_id: gr.getUniqueValue(),
                    rule_id: gr.getValue('rule_id'),
                    rate_per_km: gr.getValue('rate_per_km'),
                    minimum_fare: gr.getValue('minimum_fare'),
                    return_multiplier: gr.getValue('return_multiplier'),
                    fixed_fare: gr.getValue('fixed_fare'),
                    currency: gr.getValue('currency')
                };
            }
        }
        return null;
    },

    _isValidDate: function(dateStr) {
        var regex = /^\d{4}-\d{2}-\d{2}$/;
        if (!regex.test(dateStr)) return false;
        var parts = dateStr.split('-');
        var year = parseInt(parts[0], 10);
        var month = parseInt(parts[1], 10);
        var day = parseInt(parts[2], 10);
        if (month < 1 || month > 12) return false;
        if (day < 1 || day > 31) return false;
        return true;
    },

    _roundCurrency: function(value) {
        // High-precision decimal half-up rounding to two decimal places
        return Math.round((value + Number.EPSILON) * 100) / 100;
    },

    _fail: function(result, code, message) {
        result.success = false;
        result.errorCode = code;
        result.errorMessage = message;
        return result;
    },

    type: 'MetroFareCalculator'
};
