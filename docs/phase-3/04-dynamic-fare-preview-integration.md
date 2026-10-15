# Dynamic Fare Preview Integration
## Metro Ticket Generating System in ServiceNow (MTTS)

---

## 1. Architectural Strategy & Design Principles

The dynamic fare preview provides passengers with immediate, transparent pricing feedback as they select travel parameters on the Service Catalog form or Service Portal wizard.

To ensure both a responsive user experience and strict financial integrity:
1. **Asynchronous Non-Blocking Execution:** The client invokes the backend via ServiceNow's standard `GlideAjax` API, preventing UI freezes while pricing calculations execute.
2. **Advisory Status:** Fare preview figures presented in the browser are strictly advisory. The client is never permitted to dictate the final financial snapshot. When the catalog order is placed, `MetroBookingService` re-computes the fare on the server tier.
3. **Encapsulated Client-Callable Wrapper:** Client scripts communicate through `MetroFareCalculatorAjax`, a dedicated Script Include extending `AbstractAjaxProcessor`. This prevents client scripts from directly querying backend tables or executing arbitrary GlideRecord operations.

---

## 2. API Contract: `MetroFareCalculatorAjax.js`

Location: [`sn_source/sys_script_include/MetroFareCalculatorAjax.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/sys_script_include/MetroFareCalculatorAjax.js)

### 2.1 Endpoint: `calculateFareAjax`

#### Inbound Parameters (via `GlideAjax`):
| Parameter Name | Data Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `sysparm_name` | String | **Yes** | Must be `'calculateFareAjax'` |
| `sysparm_source` | String | Conditional | Origin station `sys_id` or `station_code` |
| `sysparm_destination`| String | Conditional | Destination station `sys_id` or `station_code` |
| `sysparm_ticket_type` | String | **Yes** | Ticket type `sys_id` or code (`SINGLE`, `RETURN`, `PASS`) |
| `sysparm_passenger_count`| String | **Yes** | Headcount string (`"1"` to `"6"`) |
| `sysparm_travel_date` | String | No | Date string `YYYY-MM-DD` (defaults to current date if omitted) |
| `sysparm_fare_rule` | String | No | Specific rule override (defaults to active effective tariff) |

#### Outbound JSON Response:
```json
{
  "success": true,
  "distanceKm": 14.20,
  "unitFare": 35.50,
  "totalFare": 71.00,
  "currencyCode": "USD",
  "pricingModel": "DISTANCE_BASED",
  "ticketTypeCode": "SINGLE",
  "ruleId": "FARE-DEFAULT",
  "errorCode": "",
  "errorMessage": ""
}
```

In failure scenarios:
```json
{
  "success": false,
  "distanceKm": 0.00,
  "unitFare": 0.00,
  "totalFare": 0.00,
  "errorCode": "NO_ACTIVE_ROUTE_FOUND",
  "errorMessage": "No active transit route exists between Financial District and Harbour Point."
}
```

---

## 3. Client-Side Integration Sequence

```
[User Changes Variable] (Station / Ticket Type / Passenger Count)
           │
           ▼
[OnChange_CalculateFare.js]
 1. Gathers g_form values
 2. Validates basic completeness
 3. Sets g_form.setValue('estimated_total_fare', 'Calculating fare...')
 4. Dispatches GlideAjax request to x_mtts.MetroFareCalculatorAjax
           │
           ▼
[Server: MetroFareCalculatorAjax.calculateFareAjax()]
 1. Extracts sysparm_* parameters
 2. Delegates to MetroFareCalculator.calculateFare()
 3. Executes distance & multiplier calculation
 4. Serializes structured JSON answer
           │
           ▼
[Callback: ga.getXMLAnswer(function(answer) { ... })]
 1. Parses JSON response
 2. If success:
      - Formats distance (e.g., '14.20 km' or 'N/A (All-Line Pass)')
      - Updates estimated_unit_fare ('$35.50')
      - Updates estimated_total_fare ('$71.00')
      - Clears field error messages
 3. If failure:
      - Sets estimated fields to '--'
      - Displays actionable field error message (e.g., 'No active route found')
```

---

## 4. Test Verification & Evidence

Automated tests in [`sn_source/test/test_phase3_ui_and_integration.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/test/test_phase3_ui_and_integration.js) verify all preview scenarios:
- **Single Journey (TC-012, TC-010):** Distance 14.20 km -> Unit fare $35.50 -> Total fare $71.00 for 2 pax — **PASS**
- **Pass Journey (TC-014):** Distance bypassed -> Fixed fare $50.00 -> Pricing model `FIXED_RATE` — **PASS**
- **Active Stations Lookup (TC-007):** Returns 9 active stations; decommissioned STN-10 excluded — **PASS**
- **Active Ticket Types Lookup:** Returns 3 active ticket types — **PASS**
- **Identical Stations (TC-008):** Handled cleanly with `SAME_STATION` notice — **PASS**
- **Missing Route (TC-030):** Handled cleanly with `NO_ACTIVE_ROUTE_FOUND` notice — **PASS**
