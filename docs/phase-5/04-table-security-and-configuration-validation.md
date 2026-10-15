# Phase 5: Table, Security & Configuration Validation
## Metro Ticket Generating System in ServiceNow (MTTS)
**Application Scope:** `x_mtts`  
**Phase:** 5 of 5 — Controlled Deployment & Instance Commissioning  

---

### 1. Database Schema & Data Dictionary Validation

The system architecture utilizes exactly seven canonical tables: five primary transit business tables, one dedicated technical sequence table, and one immutable audit logging table.

| Table Name | Display Label | Primary Key / Unique Indexes | Relational Dependencies | Immutability / Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `x_mtts_station` | Metro Station | `sys_id`; Unique index on `station_code` | None (Root master table) | Deletion restricted if referenced by active routes |
| `x_mtts_route` | Metro Route | `sys_id`; Unique composite index on `(origin_station, destination_station)` | References `x_mtts_station` (Origin, Destination) | Self-loop validation (`origin != destination`), distance > 0 |
| `x_mtts_ticket_type` | Metro Ticket Type | `sys_id`; Unique index on `code` | None (Master classification) | Pricing model must be `Distance_Based` or `Pass` |
| `x_mtts_fare_rule` | Metro Fare Rule | `sys_id`; Unique index on `rule_code` | References `x_mtts_ticket_type` | Effective date window overlap validation |
| `x_mtts_daily_sequence` | Daily Number Sequence | `sys_id`; Unique composite index on `(sequence_date, sequence_type)` | None (Technical concurrency table) | Managed exclusively via atomic `getOrInsert` transactions |
| `x_mtts_booking_ticket` | Metro Booking & Ticket | `sys_id`; Unique index on `booking_reference`; Unique sparse index on `ticket_number` | References `sys_user`, `x_mtts_station`, `x_mtts_ticket_type` | 4-status lifecycle (`Pending`, `Approved`, `Generated`, `Cancelled`) |
| `x_mtts_scan_event` | Turnstile Scan Event | `sys_id`; Non-unique index on `ticket_number`, `scanner_id`, `scan_timestamp` | References `x_mtts_booking_ticket` | Append-only; zero updates, zero deletes permitted |

---

### 2. Comprehensive Security Access Control List (ACL) Matrix

Security enforcement operates through 25 granular Access Control Lists defined in `sn_source/security/acl_definitions.json` (24 table/field-level ACLs targeting `sys_security_acl` plus 1 scripted REST endpoint ACL), combining Role-Based Access Control (RBAC), context-sensitive Condition Builders, and script-based authorization gates:

| Table Target | Operation | `x_mtts.user` (Commuter) | `x_mtts.approver` | `x_mtts.scanner` | `x_mtts.admin` | Constraint / Condition Script |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `x_mtts_station` | **Read** | Allowed | Allowed | Allowed | Allowed | `active == true` |
| `x_mtts_station` | **Create / Write / Delete** | Denied | Denied | Denied | Allowed | System administrator maintenance only |
| `x_mtts_route` | **Read** | Allowed | Allowed | Allowed | Allowed | `active == true` |
| `x_mtts_route` | **Create / Write / Delete** | Denied | Denied | Denied | Allowed | Master network administration only |
| `x_mtts_ticket_type`| **Read** | Allowed | Allowed | Allowed | Allowed | `active == true` |
| `x_mtts_ticket_type`| **Create / Write / Delete** | Denied | Denied | Denied | Allowed | Commercial fare administration only |
| `x_mtts_fare_rule`  | **Read** | Allowed | Allowed | Allowed | Allowed | Active and within effective date window |
| `x_mtts_fare_rule`  | **Create / Write / Delete** | Denied | Denied | Denied | Allowed | Commercial fare administration only |
| `x_mtts_daily_sequence`| **All Operations** | Denied | Denied | Denied | Denied | Restricted to internal system scripts (`package_private`) |
| `x_mtts_booking_ticket`| **Read** | **Scoped** | Allowed | Denied | Allowed | **IDOR Gate:** `current.passenger == gs.getUserID()` |
| `x_mtts_booking_ticket`| **Create** | Allowed | Denied | Denied | Allowed | Initial status must evaluate to `Pending` |
| `x_mtts_booking_ticket`| **Write** | **Restricted**| **Scoped**| Denied | Allowed | Passengers: Cancel only; Approvers: Status only |
| `x_mtts_booking_ticket`| **Delete** | Denied | Denied | Denied | Denied | Hard deletion prohibited; audit preservation |
| `x_mtts_scan_event` | **Read** | Denied | Denied | Denied | Allowed | Audit privacy; zero commuter visibility |
| `x_mtts_scan_event` | **Create** | Denied | Denied | Allowed | Allowed | Scripted REST API insertion only |
| `x_mtts_scan_event` | **Write / Delete** | Denied | Denied | Denied | Denied | Append-only immutability enforced by BR |

#### Field-Level Protection Rules on `x_mtts_booking_ticket`
- `total_fare` & `unit_fare`: Read-only to passengers and station approvers. Calculated authoritatively by `MetroFareCalculator` during insertion.
- `ticket_number`: Read-only to all roles. Allocated strictly upon fulfillment by `MetroNumberFormatter`.
- `qr_token_hash`: Hidden from passengers and approvers. Read-only to administrators. Never transmitted across client APIs.
- `qr_attachment`: Read-only. Streamed via `MetroPortalService` verifying booking ownership before download.

---

### 3. System Properties & Fail-Closed Governance Gates

All application behavior, business rules, and integration endpoints reference system properties stored in `x_mtts`. Default baseline configuration maintains all safety switches in their secure fail-closed state:

| Property Key | Configured Default | Operational Impact | Governance Rationale |
| :--- | :--- | :--- | :--- |
| `x_mtts.cancellation.policy_status` | `UNCONFIGURED` | Blocks commuter refund requests; returns zero refund with safety warning. | Prevents unapproved financial disbursement until official transit tariff policy is enacted. |
| `x_mtts.audit.retention_policy_status` | `UNCONFIGURED` | Blocks automated scan event purging; retention service fails closed. | Prevents unauthorized destruction of turnstile audit trails prior to legal retention sign-off. |
| `x_mtts.audit.retention_days` | `0` | Disables time-based deletion threshold. | Must be explicitly configured to an approved threshold (> 0) alongside active status. |
| `x_mtts.notifications.enabled` | `false` | Master kill switch suppressing outbound email generation. | Eliminates unintended email flooding during staging, testing, and initial instance loading. |
| `x_mtts.lifecycle.enable_rejected_status`| `false` | Strictly enforces 4-status baseline (`Pending`, `Approved`, `Generated`, `Cancelled`). | Prevents introduction of unapproved `Rejected` status; preserves approved state model. |
| `x_mtts.default_currency` | `USD` | Formats all fare quotes and financial displays. | Standard monetary denomination across Service Catalog and Service Portal. |
| `x_mtts.scanner.rate_limit_window_sec` | `60` | Defines sliding evaluation window (seconds) for turnstile abuse detection. | Throttles denial-of-service and brute-force token scanning attacks. |
| `x_mtts.scanner.max_failed_attempts` | `5` | Maximum failed verifications permitted per client IP / device before lockout. | Triggers immediate HTTP 429 lockout upon 5 consecutive failed verification attempts. |
| `x_mtts.scanner.audit_logging_enabled` | `true` | Requires every verification attempt to write an immutable `x_mtts_scan_event`. | Non-repudiation and forensic accountability for transit gate operations. |

---

### 4. Verification Evidence

The integrity of database tables, security rules, and system properties was verified in Suite 12 (`sn_source/test/test_phase5_deployment_and_smoke.js`):
1. **Schema Assertions:** Confirmed all 7 XML schemas exist, contain valid XML headers, and declare exact table names.
2. **Access Control Assertions:** Verified IDOR prevention on `x_mtts_booking_ticket` and role boundaries on `x_mtts_scan_event`.
3. **Safety Gate Assertions:** Verified that invoking cancellation or retention under default `UNCONFIGURED` state strictly fails closed with zero modifications.
