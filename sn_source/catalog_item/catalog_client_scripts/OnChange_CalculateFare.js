/**
 * Catalog Client Script: OnChange_CalculateFare
 * Trigger: onChange of source_station, destination_station, ticket_type, passenger_count
 * Type: Client Script (Service Catalog / Service Portal)
 * Description: Invokes client-callable MetroFareCalculatorAjax to calculate dynamic fare preview.
 */
function onChange(control, oldValue, newValue, isLoading) {
    if (isLoading) {
        return;
    }

    var ticketType = g_form.getValue('ticket_type');
    var sourceStation = g_form.getValue('source_station');
    var destinationStation = g_form.getValue('destination_station');
    var passengerCount = g_form.getValue('passenger_count') || '1';

    // If ticket type is not selected, clear preview
    if (!ticketType) {
        g_form.setValue('estimated_distance', '');
        g_form.setValue('estimated_unit_fare', '');
        g_form.setValue('estimated_total_fare', '');
        return;
    }

    // For distance-based tickets (Single/Return), both stations must be selected
    // Note: If Pass is selected, station checks are bypassed
    if (!sourceStation && !destinationStation) {
        // Will be evaluated by ticket type logic or wait for input
    }

    // Show loading state in total fare
    g_form.setValue('estimated_total_fare', 'Calculating fare...');

    var ga = new GlideAjax('x_mtts.MetroFareCalculatorAjax');
    ga.addParam('sysparm_name', 'calculateFareAjax');
    ga.addParam('sysparm_source', sourceStation);
    ga.addParam('sysparm_destination', destinationStation);
    ga.addParam('sysparm_ticket_type', ticketType);
    ga.addParam('sysparm_passenger_count', passengerCount);

    ga.getXMLAnswer(function(answer) {
        if (!answer) {
            g_form.setValue('estimated_total_fare', 'Calculation error');
            return;
        }

        try {
            var result = JSON.parse(answer);
            if (result.success) {
                g_form.clearMessages();
                if (result.pricingModel === 'FIXED_RATE') {
                    g_form.setValue('estimated_distance', 'N/A (All-Line Pass)');
                } else {
                    g_form.setValue('estimated_distance', parseFloat(result.distanceKm).toFixed(2) + ' km');
                }
                g_form.setValue('estimated_unit_fare', '$' + parseFloat(result.unitFare).toFixed(2));
                g_form.setValue('estimated_total_fare', '$' + parseFloat(result.totalFare).toFixed(2));
            } else {
                g_form.setValue('estimated_distance', '--');
                g_form.setValue('estimated_unit_fare', '--');
                g_form.setValue('estimated_total_fare', '--');

                var msg = result.error ? result.error.message : 'Unable to calculate fare for selected options.';
                g_form.showFieldMsg('estimated_total_fare', msg, 'error');
            }
        } catch (e) {
            g_form.setValue('estimated_total_fare', 'Error reading fare response');
        }
    });
}
