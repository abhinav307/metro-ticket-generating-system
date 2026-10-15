# Phase 3 Dependencies, API Contracts & Known Limitations
## Metro Ticket Generating System in ServiceNow

---

## 1. Overview & Phase Transition Context

With the successful completion and automated verification of **Phase 2: Backend Development & Configuration**, all core data structures, pricing logic, lifecycle controls, numbering sequences, QR security algorithms, and access policies are established.

This document defines:
1. The **API Contracts** established by Phase 2 that will be consumed by Phase 3 frontend components.
2. The **Phase 3 Prerequisites & Deliverables** (Catalog Items, Service Portal Widgets, Client Scripts, and UI Policies).
3. The **Known Limitations & Open Governance Decisions** carrying forward into subsequent phases.

---

## 2. Phase 2 Backend API Contracts for Frontend Consumption

### 2.1 Authoritative Pricing API (`MetroFareCalculator`)
Phase 3 Service Catalog Client Scripts and Portal Widgets must interact with `MetroFareCalculator` via a client-callable Script Include (`MetroFareCalculatorAjax`):
- **Invocation:** Asynchronous `GlideAjax` call.
- **Input Parameters:** `sysparm_source`, `sysparm_destination`, `sysparm_ticket_type`, `sysparm_passenger_count`.
- **Returned JSON Payload:**
  ```json
  {
    "success": true,
    "distanceKm": 14.20,
    "unitFare": 35.50,
    "totalFare": 71.00,
    "pricingModel": "DISTANCE_BASED",
    "ticketTypeCode": "SINGLE",
    "error": null
  }
  ```
- **Frontend Behavior:** Updates read-only catalog variables (`estimated_distance`, `estimated_unit_fare`, `estimated_total_fare`) in real-time as user modifies selections.

### 2.2 Booking Creation Service (`MetroBookingService`)
Invoked during Catalog Item checkout or portal cart submission:
- **Method:** `MetroBookingService.createBooking(payload)`
- **Safety Guarantee:** Discards any client-supplied totals; recalculates distance and fare authoritatively before record insert.
- **Return:** `{ "success": true, "bookingId": "<sys_id>", "bookingReference": "BKG-YYYYMMDD-XXXXXX" }`.

### 2.3 Ticket Display & Attachment Retrieval Service
For the Phase 3 "Digital Ticket Modal" widget:
- Queries `x_mtts_booking_ticket` where `sys_id == bookingSysId` AND `passenger == gs.getUserID()`.
- Fetches vector SVG QR code from `sys_attachment` where `sys_id == current.qr_attachment`.
- Embeds SVG inline within the HTML modal for instant, high-resolution rendering without external image dependencies.

### 2.4 Cancellation & Refund Estimation API (`MetroRefundCalculator`)
For the Phase 3 "My Bookings" portal widget:
- **Method:** `MetroRefundCalculator.calculateRefundQuote(bookingSysId)`
- **Returns:** Estimated refund percentage, calculated refund dollar amount, and policy justification text before user confirms cancellation.

---

## 3. Explicit Phase 3 Prerequisites & Deliverables

Phase 3 development will construct the user-facing presentation layer without modifying backend pricing or security rules:

1. **Service Catalog Item:**
   - Name: `Metro Ticket Booking`
   - Category: Transportation Services
   - Flow: Linked to `MetroBookingApprovalAndFulfillmentFlow`
2. **Catalog Variables:**
   - `source_station` (Reference to `x_mtts_station`)
   - `destination_station` (Reference to `x_mtts_station`)
   - `ticket_type` (Reference to `x_mtts_ticket_type`)
   - `travel_date` (Date picker; default today)
   - `passenger_count` (Integer choice: 1 to 6)
   - `estimated_distance` (Single Line Text, Read-only)
   - `estimated_unit_fare` (Single Line Text, Read-only)
   - `estimated_total_fare` (Single Line Text, Read-only)
3. **Catalog Client Scripts & UI Policies:**
   - Dynamic station filtering (hides origin from destination dropdown).
   - Dynamic hide/show of station fields when `PASS` is selected.
   - Real-time `GlideAjax` pricing recalculation on field change.
4. **Service Portal Custom Widgets:**
   - **Widget 1: Metro Booking Wizard:** Sleek mobile-responsive booking form.
   - **Widget 2: My Tickets & Journey History:** Grid of active and past bookings filtered by `passenger == gs.getUserID()`.
   - **Widget 3: Digital Ticket & QR Modal:** Full-screen vector QR pass with countdown validity timer.
   - **Widget 4: Cancellation & Refund Action Modal:** Confirmation modal with refund policy breakdown.

---

## 4. Known Limitations & Open Governance Decisions

1. **Candidate Parameter Boundaries:**
   - The candidate defaults (30-day booking horizon, max 6 passengers per booking, USD currency symbol `$`, 24-hour pass validity, and tiered cancellation refund percentages: 90% >24h, 75% 2–24h, 0% <2h) are controlled via `sn_source/sys_properties/system_properties.json`. They remain classified as *candidate review proposals awaiting formal stakeholder sign-off*.
2. **"Rejected" Lifecycle Status:**
   - The database choice field currently enforces the baseline 4 statuses (`Pending`, `Approved`, `Generated`, `Cancelled`). The proposed `Rejected` choice is handled safely in the workflow as `Closed Incomplete` with cancellation notes. Formal database choice addition is deferred until stakeholder approval.
3. **Physical Hardware & Offline Scanner:**
   - The scanner verification logic (`MetroTicketGenerator.verifyTicketToken`) is fully implemented and tested server-side. Physical handheld integration and public REST endpoint exposure are scheduled for Phase 4.
4. **Email / SMS Notification Dispatch:**
   - Notification triggering and email template generation are deferred to Phase 4.

---

## 5. Deployment Checklist for Target ServiceNow Instances

When moving this backend into an active ServiceNow instance:
1. Import and commit Scoped Table XML files from `sn_source/schema/`.
2. Import System Properties from `sn_source/sys_properties/system_properties.json`.
3. Import Roles, Groups, and ACLs from `sn_source/security/`.
4. Run `MetroDataSeeder.js` in **Scripts - Background** to populate stations, routes, ticket types, and fare rules.
5. Create and activate the Flow Designer flow `MetroBookingApprovalAndFulfillmentFlow`.
6. Verify access controls using impersonation for test users: `admin`, `approver.01`, and `commuter.01`.
