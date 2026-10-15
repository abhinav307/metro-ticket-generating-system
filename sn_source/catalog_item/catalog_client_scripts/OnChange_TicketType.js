/**
 * Catalog Client Script: OnChange_TicketType
 * Trigger: onChange of ticket_type
 * Description: Dynamically adjusts station visibility and mandatory rules based on ticket pricing model.
 */
function onChange(control, oldValue, newValue, isLoading) {
    if (isLoading || !newValue) {
        return;
    }

    // Determine if selected ticket type is PASS (Fixed Rate) or Distance Based
    // In ServiceNow, getReference or GlideAjax can query pricing model
    var ga = new GlideAjax('x_mtts.MetroFareCalculatorAjax');
    ga.addParam('sysparm_name', 'getActiveTicketTypesAjax');
    ga.getXMLAnswer(function(answer) {
        if (!answer) return;
        try {
            var data = JSON.parse(answer);
            var isPass = false;
            for (var i = 0; i < data.ticketTypes.length; i++) {
                var tt = data.ticketTypes[i];
                if ((tt.sys_id === newValue || tt.code === newValue) && tt.pricing_model === 'FIXED_RATE') {
                    isPass = true;
                    break;
                }
            }

            if (isPass) {
                // Pass ticket does not require point-to-point stations
                g_form.setMandatory('source_station', false);
                g_form.setMandatory('destination_station', false);
                g_form.setDisplay('source_station', false);
                g_form.setDisplay('destination_station', false);
                g_form.setValue('source_station', '');
                g_form.setValue('destination_station', '');
                g_form.setValue('estimated_distance', 'N/A (All-Line Unlimited Pass)');
            } else {
                // Single or Return ticket requires origin and destination
                g_form.setDisplay('source_station', true);
                g_form.setDisplay('destination_station', true);
                g_form.setMandatory('source_station', true);
                g_form.setMandatory('destination_station', true);
            }
        } catch (e) {
            // Fallback: keep fields visible
        }
    });
}
