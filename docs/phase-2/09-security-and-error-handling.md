# Security, Role-Based Access Control & Error Handling
## Metro Ticket Generating System in ServiceNow

---

## 1. Security Architecture & Role-Based Access Control (RBAC)

The security model for the Metro Ticket Generating System in ServiceNow (MTTS) follows the principle of least privilege, zero-trust server validation, and strict IDOR (Insecure Direct Object Reference) prevention.

All security configurations are codified in:
- Roles: [`sn_source/security/roles.json`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/security/roles.json)
- Groups: [`sn_source/security/groups.json`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/security/groups.json)
- ACL Definitions: [`sn_source/security/acl_definitions.json`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/security/acl_definitions.json)

---

## 2. Persona, Role & Group Mapping

| Role Name | Description | Assigned Group | Key Capabilities |
| :--- | :--- | :--- | :--- |
| `x_mtts.admin` | Application Administrator | `Metro Operations Administrators` | Full CRUD on stations, routes, ticket types, fare rules, sequence partitions, and system properties. |
| `x_mtts.approver`| Station Approver | `Metro Station Approvers` | Read access to booking tickets; approval rights on `sc_req_item`. |
| `x_mtts.user` | Commuter / Passenger | None (Granted to all active authenticated portal users) | Read/create/cancel own bookings where `current.passenger == gs.getUserID()`. |

---

## 3. Scoped Access Control Lists (ACLs) & IDOR Defense

### 3.1 Commuter Ownership Rule (Resolving Phase 1 Remediation)
In `x_mtts_booking_ticket`, passenger identity is maintained through the `passenger` reference field (`sys_user`). All commuter read and write ACLs evaluate:
```javascript
// Enforces that users can only ever access their own booking records
answer = (current.passenger == gs.getUserID()) || gs.hasRole('x_mtts.admin') || gs.hasRole('x_mtts.approver');
```
*Note on Phase 1 Alignment:* The obsolete assumption that ownership is determined by `opened_by` was explicitly removed during Phase 1 remediation, because `x_mtts_booking_ticket` does not inherit from `task` and does not define an `opened_by` field.

### 3.2 Master Data Table Access
- `x_mtts_station`: Public Read (`x_mtts.user` or authenticated session); Create/Write/Delete restricted to `x_mtts.admin`.
- `x_mtts_route`: Public Read; Create/Write/Delete restricted to `x_mtts.admin`.
- `x_mtts_ticket_type`: Public Read; Create/Write/Delete restricted to `x_mtts.admin`.
- `x_mtts_fare_rule`: Read restricted to `x_mtts.admin` and `x_mtts.approver` (internal pricing rules); Write restricted to `x_mtts.admin`.

### 3.3 Field-Level Protection & Anti-Tamper Isolation
- `calculated_distance`, `calculated_unit_fare`, `total_fare`: Have **no write ACL** for any interactive user. These fields are writable only by system-context script execution (`MetroBookingService`). Furthermore, `BR_Booking_FinancialSnapshot` enforces database-level aborts if any update modifies these fields.
- `qr_token_hash`: Read access restricted to `x_mtts.admin` and verification script engines. Commuters and unprivileged users cannot view the stored hash.

---

## 4. Comprehensive Exception Catalog (EX-01 to EX-15)

The backend establishes a standardized structured error format:
`{ "success": false, "error": { "code": "STRING_CONSTANT", "message": "Clear explanation" } }`.

| Exception ID | Error Code | Component | Trigger Condition | System Action |
| :--- | :--- | :--- | :--- | :--- |
| `EX-01` | `INVALID_STATIONS` | `MetroFareCalculator` | Source or destination station is null, inactive, or not found | Rejects calculation, returns error |
| `EX-02` | `SAME_STATION` | `MetroFareCalculator` | Source station == Destination station for Single/Return | Blocks submission with user message |
| `EX-03` | `NO_ACTIVE_ROUTE_FOUND`| `MetroFareCalculator` | No active track segment exists between stations (TC-030) | Graceful abort, suggests alternate |
| `EX-04` | `INVALID_PASSENGER_COUNT`| `MetroFareCalculator` | Headcount < 1 or > 6 or non-integer | Rejects with range constraint notice |
| `EX-05` | `INVALID_TICKET_TYPE` | `MetroFareCalculator` | Ticket type code does not exist in master table | Aborts calculation |
| `EX-06` | `NO_ACTIVE_FARE_RULE` | `MetroFareCalculator` | No effective active fare rule found for journey date | Escalates to admin, aborts pricing |
| `EX-07` | `DAILY_CAPACITY_EXCEEDED`| `MetroNumberFormatter`| Daily sequence reaches 999,999 in a single calendar day | Blocks allocation without rollover |
| `EX-08` | `ILLEGAL_STATE` | `BR_Booking_StateTransition`| Transition violates lifecycle machine (e.g. Pending -> Generated)| Aborts transaction with error log |
| `EX-09` | `NOT_FOUND` | `MetroTicketGenerator` | Booking sys_id does not exist in database | Returns NOT_FOUND response |
| `EX-10` | `TOKEN_MISMATCH` | `MetroTicketGenerator` | Scanned QR bearer token SHA-256 does not match stored hash | Denies entry (potential counterfeit) |
| `EX-11` | `TICKET_REVOKED_OR_CANCELLED`| `MetroTicketGenerator`| Scanned QR ticket belongs to a Cancelled booking | Denies entry, flags invalid ticket |
| `EX-12` | `REFERENTIAL_INTEGRITY_VIOLATION`| `BR_Station_ReferentialIntegrity`| Attempted delete of station referenced in routes/bookings | Aborts delete action |
| `EX-13` | `FINANCIAL_SNAPSHOT_TAMPER`| `BR_Booking_FinancialSnapshot` | Update transaction modifies distance or fare snapshot fields | Aborts transaction, logs security alert|
| `EX-14` | `POLICY_PAST_TRAVEL_DATE`| `MetroRefundCalculator`| Cancellation requested after scheduled journey date | Rejects refund ($0.00 refund) |
| `EX-15` | `PROPERTY_FALLBACK_DEFAULT`| All Modules | Configured `sys_properties` is null or missing | Falls back safely to documented default|
