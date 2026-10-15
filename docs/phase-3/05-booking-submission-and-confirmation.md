# Booking Submission & Confirmation Architecture
## Metro Ticket Generating System in ServiceNow (MTTS)

---

## 1. Architectural Integration Problem & Solution

In standard ServiceNow implementations, submitting a Service Catalog Item creates records in `sc_request` and `sc_req_item`. However, our transit architecture requires exactly one corresponding record in the scoped business table `x_mtts_booking_ticket`.

Furthermore:
1. **Flow Ordering Dependency:** The Phase 2 Flow Designer workflow (`MetroBookingApprovalAndFulfillmentFlow`) triggers upon `sc_req_item` insert and immediately queries for child `x_mtts_booking_ticket` records. If booking record insertion is delayed or asynchronous, the workflow encounters a null reference.
2. **Authoritative Pricing:** Client browsers may submit modified, cached, or stale price values. The backend must enforce server-tier recalculation.
3. **Idempotency:** System retries or double-submission events must never create duplicate bookings for the same request item.

These challenges are resolved through synchronous, idempotent integration via `BR_ReqItem_CreateMetroBooking` coupled with `MetroBookingService`.

---

## 2. Submission & Linkage Lifecycle

```
[Passenger Clicks "Order Now" on Catalog Item]
                     │
                     ▼
[Service Catalog Engine Inserts sc_req_item]
                     │
                     ▼ (Synchronous after insert)
[Business Rule: BR_ReqItem_CreateMetroBooking]
 1. Check: current.cat_item.name == 'Metro Ticket Booking'
 2. Idempotency Check: Query x_mtts_booking_ticket WHERE request_item = current.sys_id
    └── If found: log info and abort cleanly (prevent duplicate)
 3. Extract submitted variables:
    - source_station, destination_station, ticket_type, travel_date, passenger_count
 4. Derive passenger identity: current.opened_by || gs.getUserID()
 5. Invoke: MetroBookingService.createBooking(payload)
                     │
                     ▼
[MetroBookingService.createBooking()]
 1. Discard client-submitted prices or distances
 2. Call MetroFareCalculator.calculateFare() authoritatively
 3. Allocate unique booking reference: BKG-YYYYMMDD-XXXX
 4. Insert x_mtts_booking_ticket:
    - status = 'Pending'
    - snapshot fields: calculated_distance, calculated_unit_fare, total_fare
    - foreign reference: request_item = sc_req_item.sys_id
                     │
                     ▼
[BR Updates sc_req_item]
 1. current.correlation_id = result.bookingReference
 2. current.comments = "Booking submitted successfully. Ref: BKG-..."
                     │
                     ▼
[Flow Designer Engine Wakes Up]
 1. Trigger: sc_req_item created
 2. Action 1: Lookup x_mtts_booking_ticket WHERE request_item = trigger.current.sys_id
    └── Guaranteed to exist immediately!
 3. Action 2: Route approval to Metro Station Approvers Group
```

---

## 3. Implementation: `BR_ReqItem_CreateMetroBooking.js`

Location: [`sn_source/sys_script/BR_ReqItem_CreateMetroBooking.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/sys_script/BR_ReqItem_CreateMetroBooking.js)

### 3.1 Key Safety Features
- **Strict Scope Isolation:** Evaluates `cat_item.name`. Unrelated items (e.g. IT hardware, software requests) exit on line 11 without executing booking logic.
- **Idempotency Guard:** Lines 19–23 query for existing linked bookings before execution, preventing duplicate records on re-save or background updates.
- **Authoritative Passenger Derivation:** Lines 27 extracts `current.getValue('opened_by')` or `gs.getUserID()`. The client browser cannot inject a different passenger sys_id.

---

## 4. Booking Confirmation Experience

Location: [`sn_source/service_portal/widgets/widget_metro_confirmation/`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/service_portal/widgets/widget_metro_confirmation/)

Following submission, the passenger is redirected to the confirmation view (`/metro-confirmation`):

### 4.1 Display Elements
1. **Status Indicator:** Prominent yellow/amber badge: `Pending Supervisor Approval`.
2. **Booking Reference Banner:** Displays `BKG-YYYYMMDD-XXXX`.
3. **Financial Snapshot Table:**
   - Departure and Arrival Station names
   - Travel Date
   - Ticket Type
   - Passenger Count
   - Authoritative Total Fare Snapshot (`$XX.XX`)
4. **Advisory Warning:**
   *"Digital QR tickets are only issued after administrative approval. You cannot board transit until your ticket status changes to Ticket Ready."*
5. **Action Buttons:**
   - Primary: `View My Bookings` (navigates to `/my-metro-bookings`)
   - Secondary: `Book Another Ticket` (navigates back to catalog item)

---

## 5. Test Verification Evidence

Automated tests in [`sn_source/test/test_phase3_ui_and_integration.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/test/test_phase3_ui_and_integration.js) verify:
- Exactly one `x_mtts_booking_ticket` created upon `sc_req_item` insert — **PASS**
- Valid `BKG-` reference allocated and linked — **PASS**
- Initial status set to `Pending` (TC-017) — **PASS**
- Passenger matches authenticated user — **PASS**
- Authoritative total fare snapshot matches $20.00 (min floor $10 x 2 pax) — **PASS**
- Repeated execution does not create duplicate bookings (Idempotency) — **PASS**
- Unrelated catalog requests ignored cleanly — **PASS**
