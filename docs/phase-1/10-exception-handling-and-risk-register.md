# Metro Ticket Generating System in ServiceNow
## Phase 1 Deliverable: Exception Handling & Project Risk Register

| Document Metadata | Value |
| :--- | :--- |
| **Document ID** | MTTS-DOC-10 |
| **Project Name** | Metro Ticket Generating System in ServiceNow |
| **Current Phase** | Phase 1: Requirement Analysis & Project Planning |
| **Author / Role** | ServiceNow Reliability Architect & Risk Manager |
| **Status** | Phase 1 Blueprint Complete (Pending Stakeholder Sign-Off) |

---

### 1. Dedicated Exception Handling Specification (15 Failure Scenarios)

The table below defines the required system behavior, user-facing error messaging, diagnostic logging, and resulting database state across 15 failure conditions.

| Scenario ID | Exception Condition | System Behavior & Technical Execution | User-Facing Message | Logging & Diagnostic Requirement | Data State After Failure |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **EX-01** | **Source and Destination Identical** | Client script flags violation immediately upon field change; submit button disabled. Server-side validation script throws an exception if bypassed. | "Origin and destination stations cannot be identical. Please choose a different destination." | `gs.warn()`: Identical station selection blocked for user `{user_id}`. | Transaction aborted. Zero records created. |
| **EX-02** | **Inactive Station(s) Selected** | Reference qualifier filters out inactive records. Server-side Pre-Insert Business Rule validates `active=true` on both foreign keys. | "One or more selected stations are currently inactive or undergoing maintenance." | `gs.warn()`: Inactive station submission rejected. | Insertion aborted. Zero records created. |
| **EX-03** | **Route Does Not Exist in Matrix** | Route lookup returns null. Fare calculation engine halts and disables checkout. | "No active transit route exists between the selected stations. Please contact Metro Operations." | `gs.error()`: Missing route pair between `{src}` and `{dst}`. | Calculation aborted. Zero records created. |
| **EX-04** | **Fare Rule Missing, Inactive, or Expired** | Calculation engine finds no active fare rule spanning the requested travel date. Checkout blocked. | "Applicable fare rules for the selected travel date are unavailable. Contact operations." | `gs.error()`: No active fare rule found for ticket type `{type}` on date `{date}`. | Transaction blocked. Incident logged for admin. |
| **EX-05** | **Invalid Passenger Count (<1 or >Max)** | Client enforces numeric boundaries. Server-side script throws validation error if count $\notin [1, 6]$. | "Passenger count must be an integer between 1 and 6." | `gs.warn()`: Invalid passenger count `{count}` blocked. | Transaction aborted. Zero records created. |
| **EX-06** | **Invalid Travel Date (Past or Beyond Horizon)** | Date picker min/max constraints applied. Server script validates `travel_date >= today` and within advance booking limit. | "Travel date cannot be in the past or beyond the advance booking window." | `gs.warn()`: Out-of-bounds travel date `{date}` rejected. | Transaction aborted. Zero records created. |
| **EX-07** | **Duplicate Submission (Double-Click)** | UI disables submit button upon first click. Server enforces idempotency key based on `[user, source, destination, date, timestamp_minute]`. | "A booking request is already being processed. Please wait..." | `gs.info()`: Duplicate submission prevented by idempotency filter. | Single record created; duplicate request discarded. |
| **EX-08** | **No Approver Available in Group** | Flow Designer detects empty `sys_user_group` or inactive members; triggers escalation timer (4 hours) and routes approval to `Metro Operations Admins`. | Commuter sees status `Pending Approval` with standard turnaround notice. | `gs.error()`: Group `Metro Station Approvers` has no active members! Escalated. | Record remains `Pending`. Approval reassigned. |
| **EX-09** | **Approval Notification Delivery Failure** | ServiceNow email engine records failure in `sys_email`. Approvers still see task in their portal approval widget. | Invisible to commuter; approver alerted via portal dashboard banner. | `gs.error()`: Failed to dispatch approval notification for `{bkg_ref}`. Email error logged. | State unchanged. Task visible in platform UI. |
| **EX-10** | **Ticket Number Allocation or QR Generation Failure** | Try/catch block wraps fulfillment Script Include. On exception, transaction rolls back or leaves no partial ticket artifacts; **booking remains `Approved`** (never marked Cancelled); retry is idempotent and admin alert sent. | "Your booking is approved! Your digital ticket is being formatted and will appear shortly." | `gs.error()`: Ticket-number allocation or QR generation failed for `{bkg_ref}`: `{stack_trace}`. Admin alert NOTIF-07 sent. | Record remains `Approved`. No corrupted QR stored. |
| **EX-11** | **Ticket Email Delivery Failure** | Ticket record successfully commits status `Generated`. Outbound email fails in `sys_email`. | Commuter can immediately access and download the ticket directly from "My Bookings" portal. | `gs.warn()`: Email delivery failed for ticket `{tkt_no}`. Commuter can self-serve in portal. | Record is `Generated`. Digital ticket safe. |
| **EX-12** | **Unauthorized Cancellation Attempt** | Commuter attempts to cancel a booking belonging to another user. Record-level ACL script returns false. | "You are not authorized to perform this action." | `gs.error()`: Security violation: User `{user_id}` attempted unauthorized cancel on `{bkg_ref}`. | Access denied (HTTP 403). State unchanged. |
| **EX-13** | **Repeated / Double Cancellation Request** | Cancellation action checks if status is already `Cancelled`. Subsequent clicks abort immediately. | "This booking has already been cancelled." | `gs.info()`: Redundant cancellation request ignored for `{bkg_ref}`. | Status remains `Cancelled`. No double refund. |
| **EX-14** | **Fare Rule Changes After Ticket Issuance** | Historical bookings reference snapshotted fields (`unit_fare`, `total_fare`, `calculated_distance`). No dynamic joins used for historical values. | Commuter sees unchanged historic ticket and fare breakdown. | None (system operates by design). | Historic booking data 100% preserved. |
| **EX-15** | **Conflicting Concurrent Fare Rule Updates** | Two administrators edit fare rules concurrently. Platform record locking / update collisions detected (`sys_mod_count` mismatch). | "This record has been modified by another user. Please reload." | `gs.warn()`: Optimistic concurrency collision on fare rule `{rule_id}`. | First write succeeds; second write warned to reload. |

---

### 2. Comprehensive Project Risk Register

| Risk ID | Category | Risk Description | Prob | Impact | Severity | Mitigation Strategy | Contingency Plan | Risk Owner |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- |
| **RSK-01** | Technical | Server-side pure-JS QR generation performance or engine compatibility issues in ServiceNow scoped runtime. | Med | High | High | Execute Phase 2 Technical Feasibility Spike benchmarking pure-JS SVG generation against 100 concurrent issuances. | Portal client-side rendering via `qrcode.min.js` remains primary display; alphanumeric verification code fallback for emails. | Lead Architect |
| **RSK-02** | Security | Commuters bypass portal UI to submit arbitrary zero-dollar ticket prices. | High | High | Critical | Zero-trust server-side calculation. Server completely discards client fare variables and recalculates independently. | Automated ATF test suite verifying rejection of client fares. | Security Architect |
| **RSK-03** | Operational | Station Approver bottlenecks delay ticket generation during peak morning commute. | High | Med | High | Configure approval escalation timers (4 hours) and backup group assignments to prevent queue stagnation. | Operations Administrators receive escalation alert notifications. | Project Sponsor |
| **RSK-04** | Data Integrity | Incomplete route matrix distances result in commuter checkout calculation errors. | Low | High | Medium | Implement validation script in Phase 2 ensuring complete $N \times (N-1)$ route matrix coverage for all active stations. | Administrator dashboard highlighting unmapped station pairs. | Lead Developer |
| **RSK-05** | Usability | Commuters struggle to locate or display QR tickets on mobile web viewports. | Med | Med | Medium | Implement responsive mobile-first portal design with sticky "View My Ticket" floating badge on portal homepage. | Plain-text email fallback with alphanumeric ticket verification code. | UI/UX Designer |
| **RSK-06** | Scope Creep | Requests to integrate third-party payment gateways or turnstiles disrupt Phase 1–5 roadmap. | High | High | High | Strict scope enforcement. Clear demarcation of out-of-scope integrations in Charter and Scope specifications. | Formal change control register deferring payment APIs to a separately approved future release. | Project Planner |
| **RSK-07** | Technical / Data Integrity | Daily ticket-number allocation may duplicate or skip sequence values under concurrent requests if the counter update is not atomic. | Medium | High | High | Prototype an instance-supported concurrency-safe allocator; enforce a unique index on `ticket_number`; stress-test simultaneous allocation. | Keep ticket in `Approved`, retry idempotently, and do not release until the design passes the concurrency test. | Lead Architect |
