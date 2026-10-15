var MetroFareCalculatorAjax = Class.create();
MetroFareCalculatorAjax.prototype = Object.extendsObject(AbstractAjaxProcessor, {

    /**
     * Client-callable endpoint for asynchronous dynamic fare preview.
     * Invoked via GlideAjax from Service Catalog Client Scripts and Service Portal Widgets.
     * @returns {String} JSON string containing calculated fare details or structured error
     */
    calculateFareAjax: function() {
        var sourceStation = this.getParameter('sysparm_source') || '';
        var destinationStation = this.getParameter('sysparm_destination') || '';
        var ticketType = this.getParameter('sysparm_ticket_type') || '';
        var passengerCount = this.getParameter('sysparm_passenger_count') || '1';
        var fareRuleId = this.getParameter('sysparm_fare_rule') || '';

        var calculator = new MetroFareCalculator();
        var result = calculator.calculateFare({
            sourceStationId: sourceStation,
            destStationId: destinationStation,
            ticketTypeId: ticketType,
            passengerCount: passengerCount,
            fareRuleId: fareRuleId
        });

        return JSON.stringify(result);
    },

    /**
     * Returns active metro stations for client-side dropdown filtering.
     * @returns {String} JSON array of active stations
     */
    getActiveStationsAjax: function() {
        var stations = [];
        var gr = new GlideRecord('x_mtts_station');
        gr.addQuery('active', true);
        gr.orderBy('sequence_order');
        gr.query();

        while (gr.next()) {
            stations.push({
                sys_id: gr.getValue('sys_id'),
                code: gr.getValue('station_code'),
                name: gr.getValue('station_name'),
                line: gr.getValue('line_name'),
                zone: gr.getValue('zone'),
                is_interchange: gr.getValue('is_interchange') === true || gr.getValue('is_interchange') === 'true'
            });
        }

        return JSON.stringify({ success: true, stations: stations });
    },

    /**
     * Returns active ticket types for client-side selection.
     * @returns {String} JSON array of active ticket types
     */
    getActiveTicketTypesAjax: function() {
        var types = [];
        var gr = new GlideRecord('x_mtts_ticket_type');
        gr.addQuery('active', true);
        gr.query();

        while (gr.next()) {
            types.push({
                sys_id: gr.getValue('sys_id'),
                code: gr.getValue('code'),
                name: gr.getValue('name'),
                pricing_model: gr.getValue('pricing_model'),
                fixed_fare: parseFloat(gr.getValue('fixed_fare') || '0'),
                multiplier: parseFloat(gr.getValue('fare_multiplier') || '1'),
                validity_hours: parseInt(gr.getValue('validity_hours') || '4', 10)
            });
        }

        return JSON.stringify({ success: true, ticketTypes: types });
    },

    type: 'MetroFareCalculatorAjax'
});
