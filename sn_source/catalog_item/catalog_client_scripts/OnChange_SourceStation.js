/**
 * Catalog Client Script: OnChange_SourceStation
 * Trigger: onChange of source_station
 * Description: Validates that destination station is not identical to source station.
 */
function onChange(control, oldValue, newValue, isLoading) {
    if (isLoading || !newValue) {
        return;
    }

    var destinationStation = g_form.getValue('destination_station');
    if (destinationStation && destinationStation === newValue) {
        g_form.setValue('destination_station', '');
        g_form.showFieldMsg('destination_station', 'Destination cannot be identical to departure station. Please choose a different destination.', 'error');
    }
}
