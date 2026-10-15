/**
 * Catalog Client Script: OnSubmit_ValidateBooking
 * Trigger: onSubmit
 * Description: Validates required inputs, boundary conditions, and travel date before submitting.
 */
function onSubmit() {
    g_form.clearMessages();

    var ticketType = g_form.getValue('ticket_type');
    var sourceStation = g_form.getValue('source_station');
    var destinationStation = g_form.getValue('destination_station');
    var travelDate = g_form.getValue('travel_date');
    var passengerCount = parseInt(g_form.getValue('passenger_count') || '1', 10);

    // 1. Validate Headcount
    if (isNaN(passengerCount) || passengerCount < 1 || passengerCount > 6) {
        g_form.addErrorMessage('Passenger count must be between 1 and 6.');
        return false;
    }

    // 2. Validate Travel Date (cannot be in the past)
    if (!travelDate) {
        g_form.addErrorMessage('Please select a valid travel date.');
        return false;
    }

    // 3. Validate Point-to-Point stations for non-pass journeys
    var isPass = g_form.getValue('estimated_distance').indexOf('Pass') !== -1;
    if (!isPass) {
        if (!sourceStation) {
            g_form.addErrorMessage('Please select a departure station.');
            return false;
        }
        if (!destinationStation) {
            g_form.addErrorMessage('Please select a destination station.');
            return false;
        }
        if (sourceStation === destinationStation) {
            g_form.addErrorMessage('Departure and destination stations cannot be identical.');
            return false;
        }
    }

    return true;
}
