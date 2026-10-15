var MetroDataSeeder = Class.create();
MetroDataSeeder.prototype = {
    initialize: function() {
        this.logPrefix = '[x_mtts.MetroDataSeeder] ';
    },

    /**
     * Executes idempotent seed operations for development master data fixtures.
     * Safe to run repeatedly; uses unique keys to update or insert.
     * @returns {Object} Seeding execution report counts.
     */
    runSeed: function() {
        var report = {
            stations: { inserted: 0, updated: 0 },
            ticketTypes: { inserted: 0, updated: 0 },
            fareRules: { inserted: 0, updated: 0 },
            routes: { inserted: 0, updated: 0 },
            errors: []
        };

        try {
            this._seedStations(report);
            this._seedTicketTypes(report);
            this._seedFareRules(report);
            this._seedRoutes(report);
            gs.info(this.logPrefix + 'Master data seeding completed successfully. Summary: ' + JSON.stringify(report));
        } catch (ex) {
            gs.error(this.logPrefix + 'Fatal error during master data seeding: ' + ex.message);
            report.errors.push(ex.message);
        }

        return report;
    },

    _seedStations: function(report) {
        var stationFixtures = [
            { station_code: 'STN-01', name: 'Central Terminus', line_zone: 'Blue Line', active: true, order: 1 },
            { station_code: 'STN-02', name: 'Market Square', line_zone: 'Blue Line', active: true, order: 2 },
            { station_code: 'STN-03', name: 'Tech Park North', line_zone: 'Blue Line', active: true, order: 3 },
            { station_code: 'STN-04', name: 'Financial District', line_zone: 'Blue Line', active: true, order: 4 },
            { station_code: 'STN-05', name: 'Airport Junction', line_zone: 'Blue Line', active: true, order: 5 },
            { station_code: 'STN-06', name: 'West University', line_zone: 'Red Line', active: true, order: 1 },
            { station_code: 'STN-07', name: 'Civic Center', line_zone: 'Red Line', active: true, order: 2 },
            { station_code: 'STN-08', name: 'Grand Interchange', line_zone: 'Red Line', active: true, order: 3 },
            { station_code: 'STN-09', name: 'Harbor View', line_zone: 'Red Line', active: true, order: 4 },
            { station_code: 'STN-99', name: 'Heritage Depot (Decommissioned)', line_zone: 'Red Line', active: false, order: 99 }
        ];

        for (var i = 0; i < stationFixtures.length; i++) {
            var data = stationFixtures[i];
            var gr = new GlideRecord('x_mtts_station');
            gr.addQuery('station_code', data.station_code);
            gr.query();
            if (gr.next()) {
                gr.name = data.name;
                gr.line_zone = data.line_zone;
                gr.active = data.active;
                gr.order = data.order;
                gr.update();
                report.stations.updated++;
            } else {
                gr.initialize();
                gr.station_code = data.station_code;
                gr.name = data.name;
                gr.line_zone = data.line_zone;
                gr.active = data.active;
                gr.order = data.order;
                gr.insert();
                report.stations.inserted++;
            }
        }
    },

    _seedTicketTypes: function(report) {
        var typeFixtures = [
            { code: 'SINGLE', name: 'Single Journey', pricing_model: 'Distance_Based', validity_hours: 4, active: true },
            { code: 'RETURN', name: 'Return Ticket', pricing_model: 'Distance_Based', validity_hours: 24, active: true },
            { code: 'PASS', name: 'Daily Pass', pricing_model: 'Fixed', validity_hours: 24, active: true }
        ];

        for (var i = 0; i < typeFixtures.length; i++) {
            var data = typeFixtures[i];
            var gr = new GlideRecord('x_mtts_ticket_type');
            gr.addQuery('code', data.code);
            gr.query();
            if (gr.next()) {
                gr.name = data.name;
                gr.pricing_model = data.pricing_model;
                gr.validity_hours = data.validity_hours;
                gr.active = data.active;
                gr.update();
                report.ticketTypes.updated++;
            } else {
                gr.initialize();
                gr.code = data.code;
                gr.name = data.name;
                gr.pricing_model = data.pricing_model;
                gr.validity_hours = data.validity_hours;
                gr.active = data.active;
                gr.insert();
                report.ticketTypes.inserted++;
            }
        }
    },

    _seedFareRules: function(report) {
        var ruleFixtures = [
            {
                rule_id: 'FR-SINGLE-01',
                ticket_type_code: 'SINGLE',
                rate_per_km: 2.50,
                minimum_fare: 10.00,
                return_multiplier: null,
                fixed_fare: null,
                currency: 'USD',
                effective_start: '2026-01-01',
                effective_end: null,
                active: true
            },
            {
                rule_id: 'FR-RETURN-01',
                ticket_type_code: 'RETURN',
                rate_per_km: 2.50,
                minimum_fare: 10.00,
                return_multiplier: 1.80,
                fixed_fare: null,
                currency: 'USD',
                effective_start: '2026-01-01',
                effective_end: null,
                active: true
            },
            {
                rule_id: 'FR-PASS-01',
                ticket_type_code: 'PASS',
                rate_per_km: null,
                minimum_fare: null,
                return_multiplier: null,
                fixed_fare: 50.00,
                currency: 'USD',
                effective_start: '2026-01-01',
                effective_end: null,
                active: true
            },
            {
                rule_id: 'FR-EXPIRED-01',
                ticket_type_code: 'SINGLE',
                rate_per_km: 2.00,
                minimum_fare: 8.00,
                return_multiplier: null,
                fixed_fare: null,
                currency: 'USD',
                effective_start: '2025-01-01',
                effective_end: '2025-12-31',
                active: false
            }
        ];

        for (var i = 0; i < ruleFixtures.length; i++) {
            var data = ruleFixtures[i];
            var typeGr = new GlideRecord('x_mtts_ticket_type');
            typeGr.addQuery('code', data.ticket_type_code);
            typeGr.query();
            if (!typeGr.next()) {
                report.errors.push('Ticket type missing for rule: ' + data.rule_id);
                continue;
            }

            var gr = new GlideRecord('x_mtts_fare_rule');
            gr.addQuery('rule_id', data.rule_id);
            gr.query();
            if (gr.next()) {
                gr.ticket_type = typeGr.getUniqueValue();
                if (data.rate_per_km !== null) gr.rate_per_km = data.rate_per_km;
                if (data.minimum_fare !== null) gr.minimum_fare = data.minimum_fare;
                if (data.return_multiplier !== null) gr.return_multiplier = data.return_multiplier;
                if (data.fixed_fare !== null) gr.fixed_fare = data.fixed_fare;
                gr.currency = data.currency;
                gr.effective_start = data.effective_start;
                if (data.effective_end) gr.effective_end = data.effective_end;
                gr.active = data.active;
                gr.update();
                report.fareRules.updated++;
            } else {
                gr.initialize();
                gr.rule_id = data.rule_id;
                gr.ticket_type = typeGr.getUniqueValue();
                if (data.rate_per_km !== null) gr.rate_per_km = data.rate_per_km;
                if (data.minimum_fare !== null) gr.minimum_fare = data.minimum_fare;
                if (data.return_multiplier !== null) gr.return_multiplier = data.return_multiplier;
                if (data.fixed_fare !== null) gr.fixed_fare = data.fixed_fare;
                gr.currency = data.currency;
                gr.effective_start = data.effective_start;
                if (data.effective_end) gr.effective_end = data.effective_end;
                gr.active = data.active;
                gr.insert();
                report.fareRules.inserted++;
            }
        }
    },

    _seedRoutes: function(report) {
        var routeFixtures = [
            { route_id: 'RT-001', orig: 'STN-01', dest: 'STN-02', dist: 4.20, line: 'Blue Line', active: true },
            { route_id: 'RT-002', orig: 'STN-02', dest: 'STN-01', dist: 4.20, line: 'Blue Line', active: true },
            { route_id: 'RT-003', orig: 'STN-01', dest: 'STN-03', dist: 8.50, line: 'Blue Line', active: true },
            { route_id: 'RT-004', orig: 'STN-03', dest: 'STN-01', dist: 8.50, line: 'Blue Line', active: true },
            { route_id: 'RT-005', orig: 'STN-01', dest: 'STN-05', dist: 14.20, line: 'Blue Line', active: true },
            { route_id: 'RT-006', orig: 'STN-05', dest: 'STN-01', dist: 14.20, line: 'Blue Line', active: true },
            { route_id: 'RT-007', orig: 'STN-02', dest: 'STN-04', dist: 7.80, line: 'Blue Line', active: true },
            { route_id: 'RT-008', orig: 'STN-04', dest: 'STN-02', dist: 7.80, line: 'Blue Line', active: true },
            { route_id: 'RT-009', orig: 'STN-06', dest: 'STN-07', dist: 3.50, line: 'Red Line', active: true },
            { route_id: 'RT-010', orig: 'STN-07', dest: 'STN-06', dist: 3.50, line: 'Red Line', active: true },
            { route_id: 'RT-011', orig: 'STN-06', dest: 'STN-08', dist: 9.10, line: 'Red Line', active: true },
            { route_id: 'RT-012', orig: 'STN-08', dest: 'STN-06', dist: 9.10, line: 'Red Line', active: true },
            { route_id: 'RT-013', orig: 'STN-07', dest: 'STN-09', dist: 11.40, line: 'Red Line', active: true },
            { route_id: 'RT-014', orig: 'STN-09', dest: 'STN-07', dist: 11.40, line: 'Red Line', active: true },
            { route_id: 'RT-015', orig: 'STN-01', dest: 'STN-08', dist: 18.60, line: 'Inter-Line Transfer', active: true },
            { route_id: 'RT-INACT-01', orig: 'STN-03', dest: 'STN-04', dist: 6.00, line: 'Blue Line', active: false },
            { route_id: 'RT-INACT-STN', orig: 'STN-01', dest: 'STN-99', dist: 5.00, line: 'Special Line', active: true }
        ];

        for (var i = 0; i < routeFixtures.length; i++) {
            var data = routeFixtures[i];
            var origGr = new GlideRecord('x_mtts_station');
            origGr.addQuery('station_code', data.orig);
            origGr.query();
            if (!origGr.next()) {
                report.errors.push('Origin station not found: ' + data.orig);
                continue;
            }

            var destGr = new GlideRecord('x_mtts_station');
            destGr.addQuery('station_code', data.dest);
            destGr.query();
            if (!destGr.next()) {
                report.errors.push('Destination station not found: ' + data.dest);
                continue;
            }

            var gr = new GlideRecord('x_mtts_route');
            gr.addQuery('route_id', data.route_id);
            gr.query();
            if (gr.next()) {
                gr.origin_station = origGr.getUniqueValue();
                gr.destination_station = destGr.getUniqueValue();
                gr.distance_km = data.dist;
                gr.line_name = data.line;
                gr.active = data.active;
                gr.update();
                report.routes.updated++;
            } else {
                gr.initialize();
                gr.route_id = data.route_id;
                gr.origin_station = origGr.getUniqueValue();
                gr.destination_station = destGr.getUniqueValue();
                gr.distance_km = data.dist;
                gr.line_name = data.line;
                gr.active = data.active;
                gr.insert();
                report.routes.inserted++;
            }
        }
    },

    type: 'MetroDataSeeder'
};
