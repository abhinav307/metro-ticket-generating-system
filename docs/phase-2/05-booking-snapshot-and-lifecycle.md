# Booking Service, Financial Snapshotting & Lifecycle Rules
## Metro Ticket Generating System in ServiceNow

---

## 1. Architectural Purpose & Overview

The booking subsystem coordinates the creation, validation, pricing snapshotting, and lifecycle progression of passenger bookings. It comprises:
1. **`MetroBookingService` Script Include:** The server-side service responsible for creating bookings, enforcing authoritative server-side recalculation, generating unique booking references, and freezing historical pricing data.
2. **`BR_Booking_FinancialSnapshot` Business Rule:** A `before update` defensive barrier ensuring that financial and distance snapshot fields cannot be altered once written.
3. **`BR_Booking_StateTransitionEnforcement` Business Rule:** An authoritative state-machine validator preventing illegal lifecycle transitions.
4. **Referential Integrity Business Rules:** Enforcing station and route database constraints.

---

## 2. Server-Side Booking Creation (`MetroBookingService.js`)

Location: [`sn_source/sys_script_include/MetroBookingService.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/sys_script_include/MetroBookingService.js)

### 2.1 Authoritative Pricing & Anti-Tamper Enforcement (TC-011)
When a passenger submits a catalog order, client scripts or browser forms may submit submitted prices or distance figures. `MetroBookingService.createBooking()` **explicitly discards any submitted price or distance**. 

Instead, it invokes `MetroFareCalculator.calculateFare()` with the submitted stations, ticket type, and headcount. The returned authoritative figures are written to the database.

```javascript
// Authoritative recalculation ignores any client-supplied totals
var fareResult = this.fareCalculator.calculateFare(
    payload.sourceStationId,
    payload.destinationStationId,
    payload.ticketTypeId,
    payload.passengerCount,
    payload.fareRuleId
);

if (!fareResult.success) {
    return { success: false, error: fareResult.error };
}

// Write server-calculated figures to the GlideRecord
bkgGr.calculated_distance = fareResult.distanceKm;
bkgGr.calculated_unit_fare = fareResult.unitFare;
bkgGr.total_fare = fareResult.totalFare;
bkgGr.fare_rule = fareResult.fareRuleId;
```

### 2.2 Booking Reference Allocation
Every booking is assigned a unique tracking reference formatted as `BKG-YYYYMMDD-XXXXXX`. The sequence is generated safely via `MetroNumberFormatter` using the creation date partition.

### 2.3 Immutable Financial Snapshotting (TC-016)
Once inserted into `x_mtts_booking_ticket`, the record holds frozen financial data:
- `calculated_distance`: The measured track distance at booking time.
- `calculated_unit_fare`: The unit tariff at booking time.
- `total_fare`: The total financial liability.
- `fare_rule`: The specific fare rule version used.

Even if an administrator subsequently changes the fare rule rates in `x_mtts_fare_rule` (e.g., increasing the per-km rate from $2.50 to $5.00), historical bookings retain their original snapshot values.

---

## 3. Business Rules & Integrity Controls

### 3.1 `BR_Booking_FinancialSnapshot`
Location: [`sn_source/sys_script/BR_Booking_FinancialSnapshot.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/sys_script/BR_Booking_FinancialSnapshot.js)

- **Table:** `x_mtts_booking_ticket`
- **When:** `before update`
- **Condition:** Always active on update.
- **Enforcement Logic:**
  ```javascript
  if (current.calculated_distance.changes() || 
      current.calculated_unit_fare.changes() || 
      current.total_fare.changes() || 
      current.fare_rule.changes()) {
      
      gs.error('[x_mtts] Security Violation: Attempted modification of frozen financial snapshot for booking ' + current.booking_reference);
      current.setAbortAction(true);
  }
  ```
  Any attempt by a script, integration, or user to tamper with financial records causes the transaction to abort immediately.

### 3.2 `BR_Booking_StateTransitionEnforcement`
Location: [`sn_source/sys_script/BR_Booking_StateTransitionEnforcement.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/sys_script/BR_Booking_StateTransitionEnforcement.js)

- **Table:** `x_mtts_booking_ticket`
- **When:** `before update`
- **Condition:** `current.status.changes()`
- **Permitted State Transitions:**

```
               ┌─────────────┐
               │   Pending   │ (Initial State)
               └──────┬──────┘
                      │
         ┌────────────┴────────────┐
         │                         │
         ▼                         ▼
  ┌─────────────┐           ┌─────────────┐
  │  Approved   │           │  Cancelled  │ (or proposed Rejected)
  └──────┬──────┘           └─────────────┘
         │                         ▲
         │ (Fulfillment)           │ (Cancellation)
         ▼                         │
  ┌─────────────┐                  │
  │  Generated  │ ─────────────────┘
  └─────────────┘
```

#### Transition Rules Enforced:
1. `Pending` -> `Approved` or `Cancelled` (or `Rejected` if enabled)
2. `Approved` -> `Generated` or `Cancelled`
3. `Generated` -> `Cancelled`
4. `Cancelled` -> **Terminal** (no transitions permitted; throws exception)
5. **Direct Jump Prohibited:** Direct transition from `Pending` -> `Generated` is explicitly rejected. Tickets can only be fulfilled if the booking has achieved `Approved` status.

### 3.3 `BR_Station_ReferentialIntegrity`
Location: [`sn_source/sys_script/BR_Station_ReferentialIntegrity.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/sys_script/BR_Station_ReferentialIntegrity.js)

- **Table:** `x_mtts_station`
- **When:** `before delete`
- **Logic:** Queries `x_mtts_route` and `x_mtts_booking_ticket`. If any active route or historical booking references the station, deletion is blocked with a descriptive error message advising the administrator to deactivate the station instead.

### 3.4 `BR_Route_Validation`
Location: [`sn_source/sys_script/BR_Route_Validation.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/sys_script/BR_Route_Validation.js)

- **Table:** `x_mtts_route`
- **When:** `before insert`, `before update`
- **Logic:**
  1. Verifies that `source_station` != `destination_station`.
  2. Verifies that `distance_km` > 0.

---

## 4. Test Verification Evidence

All rules and constraints have been verified in the automated test suite ([`sn_source/test/test_booking_and_lifecycle.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/test/test_booking_and_lifecycle.js)):
- `TC-011`: Discarding client prices and locking authoritative $35.50 fare — **PASS**
- `TC-016`: Historical fare unchanged after fare rule rate increase — **PASS**
- `TC-017`: Initial booking created in Pending status — **PASS**
- `TC-018`: Successful transition from Pending to Approved — **PASS**
- `TC-019`: Fulfillment restricted to Approved status; Pending fulfillment blocked — **PASS**
