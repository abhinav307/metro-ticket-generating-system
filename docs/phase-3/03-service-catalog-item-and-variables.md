# Service Catalog Item & Variable Dictionary
## Metro Ticket Generating System in ServiceNow (MTTS)

---

## 1. Catalog Item Configuration

The self-service booking entry point is realized as a dedicated Service Catalog Item within the application scope `x_mtts`.

- **Item Name:** Metro Ticket Booking
- **System Table:** `sc_cat_item`
- **Application Scope:** `x_mtts`
- **Category:** Transportation Services
- **Catalogs:** Service Catalog
- **Associated Workflow:** `x_mtts.MetroBookingApprovalAndFulfillmentFlow` (Flow Designer)
- **Role Permissions:** `x_mtts.user`, `snc_internal`
- **Configuration JSON:** [`sn_source/catalog_item/MetroTicketBooking_CatItem.json`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/catalog_item/MetroTicketBooking_CatItem.json)

---

## 2. Variable Dictionary & Specifications

The catalog item defines 8 variables: 5 user-input fields and 3 read-only dynamic fare preview fields.

Configuration File: [`sn_source/catalog_item/variables.json`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/catalog_item/variables.json)

| Variable Name | Label | Type | Mandatory | Read-Only | Default Value | Reference Table / Qualifier |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `source_station` | Departure Station (Origin) | Reference | **Yes** | No | — | `x_mtts_station`<br>`active=true^ORDERBYsequence_order` |
| `destination_station` | Arrival Station (Destination) | Reference | **Yes** | No | — | `x_mtts_station`<br>`active=true^ORDERBYsequence_order` |
| `travel_date` | Travel Date | Date | **Yes** | No | `javascript:gs.now()` | — |
| `ticket_type` | Ticket Type | Reference | **Yes** | No | — | `x_mtts_ticket_type`<br>`active=true` |
| `passenger_count` | Number of Passengers | Select Box | **Yes** | No | `1` | Choices: `1` to `6` |
| `estimated_distance` | Calculated Distance (km) | Single Line Text | No | **Yes** | — | Advisory read-only calculation |
| `estimated_unit_fare` | Unit Fare ($) | Single Line Text | No | **Yes** | — | Advisory read-only calculation |
| `estimated_total_fare` | Total Estimated Fare ($) | Single Line Text | No | **Yes** | — | Advisory read-only calculation |

---

## 3. Catalog Variable to Database Field Mapping

To ensure seamless server-side processing, catalog variables are mapped directly to corresponding fields in `x_mtts_booking_ticket`:

| Catalog Variable Name | Database Field (`x_mtts_booking_ticket`) | Type Alignment | Transformation / Snapshot Rule |
| :--- | :--- | :--- | :--- |
| `source_station` | `source_station` | Reference (`x_mtts_station`) | Foreign key sys_id; null/empty for Pass tickets |
| `destination_station`| `destination_station` | Reference (`x_mtts_station`) | Foreign key sys_id; null/empty for Pass tickets |
| `travel_date` | `travel_date` | `glide_date` | Verified not in past; within advance booking window |
| `ticket_type` | `ticket_type` | Reference (`x_mtts_ticket_type`) | Foreign key sys_id |
| `passenger_count` | `passenger_count` | `integer` | Parsed to integer; bounded between 1 and 6 |
| `estimated_distance` | `calculated_distance` | `decimal(8,2)` | **Client value discarded**; recalculated server-side |
| `estimated_unit_fare`| `calculated_unit_fare` | `decimal(10,2)` | **Client value discarded**; recalculated server-side |
| `estimated_total_fare`| `total_fare` | `decimal(10,2)` | **Client value discarded**; recalculated server-side |
| *(Session context)* | `passenger` | Reference (`sys_user`) | Derived strictly from `gs.getUserID()` / `opened_by` |
| *(Server generated)*| `booking_reference` | `string(30)` | Allocated via `MetroNumberFormatter` |
| *(Lifecycle initial)*| `status` | `choice(20)` | Set strictly to `Pending` |

---

## 4. Catalog Client Scripts & UI Policies

### 4.1 `OnChange_CalculateFare`
- **File:** [`sn_source/catalog_item/catalog_client_scripts/OnChange_CalculateFare.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/catalog_item/catalog_client_scripts/OnChange_CalculateFare.js)
- **Execution:** Triggered `onChange` of `source_station`, `destination_station`, `ticket_type`, or `passenger_count`.
- **Logic:** Invokes client-callable `MetroFareCalculatorAjax` via asynchronous `GlideAjax`. Updates read-only preview fields (`estimated_distance`, `estimated_unit_fare`, `estimated_total_fare`). Displays field error message if no route exists or if an invalid passenger count is entered.

### 4.2 `OnChange_TicketType`
- **File:** [`sn_source/catalog_item/catalog_client_scripts/OnChange_TicketType.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/catalog_item/catalog_client_scripts/OnChange_TicketType.js)
- **Execution:** Triggered `onChange` of `ticket_type`.
- **Logic:**
  - If selected ticket type has `pricing_model === 'FIXED_RATE'` (All-Day Pass):
    - Sets `source_station` and `destination_station` mandatory = `false`.
    - Hides `source_station` and `destination_station`.
    - Clears values in station inputs.
    - Displays `N/A (All-Line Unlimited Pass)` in `estimated_distance`.
  - If Single Journey or Return Ticket:
    - Sets `source_station` and `destination_station` display = `true`.
    - Sets mandatory = `true`.

### 4.3 `OnChange_SourceStation`
- **File:** [`sn_source/catalog_item/catalog_client_scripts/OnChange_SourceStation.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/catalog_item/catalog_client_scripts/OnChange_SourceStation.js)
- **Execution:** Triggered `onChange` of `source_station`.
- **Logic:** Compares `source_station` against `destination_station`. If equal, clears `destination_station` and displays: *"Destination cannot be identical to departure station. Please choose a different destination."* (TC-008).

### 4.4 `OnSubmit_ValidateBooking`
- **File:** [`sn_source/catalog_item/catalog_client_scripts/OnSubmit_ValidateBooking.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/catalog_item/catalog_client_scripts/OnSubmit_ValidateBooking.js)
- **Execution:** Triggered `onSubmit` before cart submission.
- **Logic:** Validates travel date format and presence, verifies passenger count is an integer between 1 and 6, and checks that distance-based tickets have non-empty origin and destination.
