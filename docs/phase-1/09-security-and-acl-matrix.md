# Metro Ticket Generating System in ServiceNow
## Phase 1 Deliverable: Security Architecture & Access Control List (ACL) Specification

| Document Metadata | Value |
| :--- | :--- |
| **Document ID** | MTTS-DOC-09 |
| **Project Name** | Metro Ticket Generating System in ServiceNow |
| **Current Phase** | Phase 1: Requirement Analysis & Project Planning |
| **Author / Role** | ServiceNow Security Architect & Compliance Specialist |
| **Status** | Phase 1 Blueprint Complete (Pending Stakeholder Sign-Off) |

---

### 1. Security Architecture & Threat Model

The Metro Ticket Generating System is architected in accordance with the **Principle of Least Privilege (PoLP)** and zero-trust data boundaries.

```mermaid
flowchart TD
    Client["Browser / Portal / REST API"] --> ACL_Table{"Table-Level ACL\n(Type: record)"}
    ACL_Table -->|Denied| Drop403["Abort: 403 Forbidden"]
    ACL_Table -->|Allowed| ACL_Row{"Row-Level ACL Script\n(Record Ownership Check)"}
    
    ACL_Row -->|Not Owner / No Admin Role| Drop403
    ACL_Row -->|Owner / Admin / Approver| ACL_Field{"Field-Level ACL\n(Column Protection)"}
    
    ACL_Field -->|Field Protected (e.g. total_fare)| FieldRO["Display as Read-Only"]
    ACL_Field -->|Field Writable| Commit["Allow Read / Write Operation"]
```

#### 1.1 Threat Vectors & Mitigations
1. **Insecure Direct Object Reference (IDOR):** An attacker alters record sys_ids in the portal URL (`/metro?id=ticket_detail&sys_id=...`) to view other passengers' tickets.
   - *Mitigation:* Row-level ACL scripts enforce that read operations are granted only if `current.passenger == gs.getUserID()`; the custom booking table has no `opened_by` field or `gs.hasRole('x_mtts.admin')` or `gs.hasRole('x_mtts.approver')`.
2. **Client-Side Fare Tampering:** A malicious user modifies JavaScript variables in browser developer tools to submit a `$0.01` ticket price.
   - *Mitigation:* Field-level ACLs block direct writes to `total_fare` and `unit_fare`. The server-side Script Include independently recalculates pricing prior to database insertion.
3. **Replay & Ticket Forgery:** A passenger takes a screenshot of an issued QR code, cancels the ticket to claim a refund, and attempts to scan the screenshot at a station turnstile.
   - *Mitigation:* Server-side verification checks the stored token hash and current booking status; any booking not in `Generated` status is rejected. Do not mutate the token hash to encode cancellation.
4. **Administrative Privilege Escalation:** An operational Station Approver attempts to modify route distances or increase fare rules.
   - *Mitigation:* Approvers are granted role `x_mtts.approver`, which has read-only access to master configuration tables and zero write/delete rights.

---

### 2. Comprehensive ACL Rule Specifications

All application tables operate within the private application scope `x_mtts`. Default platform access is set to **Deny All** until explicit ACL rules are satisfied.

#### 2.1 Table: Metro Station (`x_mtts_station`)

| ACL Type | Operation | Required Roles | Condition / Script | Description |
| :--- | :--- | :--- | :--- | :--- |
| `x_mtts_station` | `read` | `snc_internal`, `snc_external` | `active=true` (for public); None (for admin) | Allows commuters to search active stations in catalog. |
| `x_mtts_station` | `create` | `x_mtts.admin` | None | Only administrators can add new stations. |
| `x_mtts_station` | `write` | `x_mtts.admin` | None | Only administrators can modify station parameters. |
| `x_mtts_station` | `delete` | `x_mtts.admin` | Must have 0 active route or booking references | Deletion blocked if referenced by active routes. |

#### 2.2 Table: Metro Route (`x_mtts_route`)

| ACL Type | Operation | Required Roles | Condition / Script | Description |
| :--- | :--- | :--- | :--- | :--- |
| `x_mtts_route` | `read` | `snc_internal`, `snc_external` | `active=true` | Permits read access for route lookup and fare preview. |
| `x_mtts_route` | `create` | `x_mtts.admin` | None | Restricted to Metro Administrators. |
| `x_mtts_route` | `write` | `x_mtts.admin` | None | Restricted to Metro Administrators. |
| `x_mtts_route` | `delete` | `x_mtts.admin` | Zero historic booking dependencies | Administrators only. |

#### 2.3 Table: Metro Fare Rule (`x_mtts_fare_rule`)

| ACL Type | Operation | Required Roles | Condition / Script | Description |
| :--- | :--- | :--- | :--- | :--- |
| `x_mtts_fare_rule` | `read` | `x_mtts.admin`, `x_mtts.approver` | None | Fulfillers and admins can review rules; system reads via script. |
| `x_mtts_fare_rule` | `create` | `x_mtts.admin` | None | Restricted to Metro Administrators. |
| `x_mtts_fare_rule` | `write` | `x_mtts.admin` | None | Restricted to Metro Administrators. |
| `x_mtts_fare_rule` | `delete` | `x_mtts.admin` | Soft delete preferred (`active=false`) | Hard delete restricted to administrators. |

#### 2.4 Table: Metro Ticket Type (`x_mtts_ticket_type`)

| ACL Type | Operation | Required Roles | Condition / Script | Description |
| :--- | :--- | :--- | :--- | :--- |
| `x_mtts_ticket_type` | `read` | `snc_internal`, `snc_external` | `active=true` | Read access for catalog variable dropdowns. |
| `x_mtts_ticket_type` | `create` | `x_mtts.admin` | None | Restricted to Metro Administrators. |
| `x_mtts_ticket_type` | `write` | `x_mtts.admin` | None | Restricted to Metro Administrators. |
| `x_mtts_ticket_type` | `delete` | `x_mtts.admin` | None | Restricted to Metro Administrators. |

#### 2.5 Table: Metro Booking / Ticket (`x_mtts_booking_ticket`)

| ACL Type | Operation | Required Roles | Condition / Script | Description |
| :--- | :--- | :--- | :--- | :--- |
| `x_mtts_booking_ticket` | `create` | `snc_internal`, `snc_external` | None | Allowed via Service Catalog cart submission. |
| `x_mtts_booking_ticket` | `read` | `snc_internal`, `snc_external` | `answer = (gs.hasRole('x_mtts.admin') || gs.hasRole('x_mtts.approver') || current.passenger.toString() == gs.getUserID());` | **Row-Level Security:** Commuters can only view their own bookings. |
| `x_mtts_booking_ticket` | `write` | `x_mtts.admin` | None | Direct writes reserved for admins. Status updates driven by Flow Designer. |
| `x_mtts_booking_ticket` | `delete` | `x_mtts.admin` | None (Audit retention policy discourages deletes) | Hard deletion restricted to administrators. |


#### 2.6 Technical Table: Daily Ticket Number Sequence (`x_mtts_daily_sequence`)

| ACL Type | Operation | Required Roles | Condition / Script | Description |
| :--- | :--- | :--- | :--- | :--- |
| `x_mtts_daily_sequence` | `read` | `x_mtts.admin` | No passenger or approver access | Diagnostic review only. |
| `x_mtts_daily_sequence` | `create` | Server-side allocation service | Valid date key and initial sequence only | Allocation code creates/initializes counter rows. |
| `x_mtts_daily_sequence` | `write` | Server-side allocation service | Validated allocation path only | No direct form edits by ordinary users; concurrency design must be proven in Phase 2. |
| `x_mtts_daily_sequence` | `delete` | `x_mtts.admin` | Only under an approved maintenance procedure; never delete a date row during active allocation | Protect numbering audit history. |

---

### 3. Field-Level ACL Rules (Column Immutability)

| Target Field | Operation | Allowed Roles | Enforcement Logic |
| :--- | :---: | :--- | :--- |
| `x_mtts_booking_ticket.total_fare` | `write` | `admin` (System Only) | Read-only to passengers, approvers, and fulfillers. Derived by server. |
| `x_mtts_booking_ticket.unit_fare` | `write` | `admin` (System Only) | Read-only. Derived by server. |
| `x_mtts_booking_ticket.calculated_distance`| `write` | `admin` (System Only) | Read-only. Snapshotted from route record (0.00 for Pass). |
| `x_mtts_booking_ticket.ticket_number` | `write` | `admin` (System Only) | Assigned by fulfillment engine. Cannot be edited. |
| `x_mtts_booking_ticket.qr_token_hash` | `write` | `admin` (System Only) | Hash of a secure random verification token. Write-protected; validation also checks that booking status is `Generated`. |
| `x_mtts_booking_ticket.qr_payload` | `write` | `admin` (System Only) | Non-sensitive metadata only; raw verifier token must not be persisted in this field. Write-protected. |
| `x_mtts_booking_ticket.qr_attachment` | `write` | `admin` (System Only) | Attachment reference. Write-protected. |
| `x_mtts_booking_ticket.status` | `write` | `admin` / Flow Designer | Commuters cannot directly update status; cancellations trigger via audited Script Include. |

---

### 4. Server-Side Script Include & REST Security

#### 4.1 GlideAjax Endpoint Protection
All client-callable Script Includes (`MetroFareCalculatorClient`, `MetroBookingHelper`) must enforce session authentication and parameter sanitization:
- **`isPublic = false`:** Prohibits anonymous unauthenticated execution.
- **Session Check:** Verifies `gs.getSession().isLoggedIn()`.
- **Parameter Validation:** Ensures all incoming sys_ids match alphanumeric regex `^[0-9a-f]{32}$`.

#### 4.2 QR Attachment Access Control
The QR graphic attachment contains the bearer token inside the scannable image, so it must be treated as a protected ticket credential even though the token is not stored in plaintext fields. Do not rely on the booking-table ACL alone to secure direct attachment URLs. Configure and test attachment access so that only the authenticated booking owner (for an eligible `Generated` ticket), authorized administrators, and the intended verifier path can access it. A `Cancelled` or otherwise non-`Generated` ticket must fail verification even if a passenger retains a downloaded image. Test direct attachment URL access, cross-passenger access, and access after cancellation in Phase 4.

#### 4.3 Scripted REST API Security (Verification Endpoint)
If external conductor/inspector handheld scanners query the ticket verification endpoint (`/api/x_mtts/v1/verify_ticket`):
- **Authentication:** OAuth 2.0 or Mutual TLS (mTLS).
- **Required Scope / Role:** `x_mtts.inspector` or `x_mtts.approver`.
- **Rate Limiting:** Enforced via ServiceNow REST Rate Limiting rules (maximum 100 requests per minute per scanner terminal) to prevent brute-force token harvesting.
