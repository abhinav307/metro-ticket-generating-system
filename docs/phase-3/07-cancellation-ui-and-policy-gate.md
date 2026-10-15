# Cancellation Interface & Governance Policy Gate
## Metro Ticket Generating System in ServiceNow (MTTS)

---

## 1. Governance Context & The Policy Gate Requirement

In Phase 1 and Phase 2 remediation, a critical project invariant was established:
> **The tiered cancellation refund schedule (90% >24h, 75% 2–24h, 0% <2h) is a provisional candidate proposal awaiting formal transit authority sign-off, NOT an approved production policy.**

Consequently:
- The passenger-facing cancellation interface must **never** present an unapproved refund schedule as active.
- The system must not process cancellations or fabricate refund disbursements without an explicit, active administrative policy configuration.
- To prevent organizational liability, Phase 3 implements an authoritative **Governance Policy Gate** on both the client and server tiers.

---

## 2. Policy Gate Architecture & Control Property

The policy gate is governed by a dedicated ServiceNow system property:
$$\mathbf{x\_mtts.cancellation.policy\_status}$$

### Supported Configuration States:
1. `UNCONFIGURED` *(Default baseline state)*:
   - Stakeholders have not formally ratified the cancellation policy.
   - The UI disables cancellation actions and displays a transparent advisory message.
   - Server-tier cancellation operations reject transactions immediately with `POLICY_UNCONFIGURED`.
2. `DISABLED`:
   - Cancellation is temporarily suspended by transit operations (e.g. system maintenance).
3. `ACTIVE`:
   - Stakeholders have ratified the policy; tiered calculations via `MetroRefundCalculator` are enabled.

---

## 3. Passenger-Facing Cancellation Experience

Location: [`sn_source/service_portal/widgets/widget_my_metro_bookings/`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/service_portal/widgets/widget_my_metro_bookings/) (Modal Section)

When an eligible booking is selected for cancellation:

### 3.1 Experience When Policy is `UNCONFIGURED` (Baseline)
- The modal opens and displays journey details (Booking Reference, Route, Scheduled Date, Total Fare).
- An alert banner is prominently displayed:
  > **Cancellation Policy Notice**  
  > *Cancellation is currently unavailable because the operational refund schedule is pending formal stakeholder policy approval.*  
  > *(System Property `x_mtts.cancellation.policy_status` is unconfigured).*
- The **"Confirm Cancellation"** button is **strictly disabled** (`ng-disabled="!data.cancellationPolicyConfigured"`).
- The passenger is protected from unintended cancellation, and the organization is protected from unauthorized refund claims.

### 3.2 Experience When Policy is `ACTIVE`
- The client queries the server for an authoritative refund quote (`action: 'get_cancel_quote'`).
- The modal displays the dynamic refund breakdown calculated by `MetroRefundCalculator`:
  - Eligible Refund Percentage (e.g., `90%`)
  - Estimated Refund Amount (e.g., `$38.25` on `$42.50`)
- A permanent action warning is presented:
  > *Note: Cancellation is permanent and immediately revokes turnstile transit boarding privileges.*
- Upon clicking **"Confirm Cancellation"**, the server executes `MetroPortalService.cancelBookingWithPolicyGate()`.

---

## 4. Server-Side Safety & Invalidation Model (TC-026, TC-027)

```
[Passenger Confirms Cancellation]
                 │
                 ▼
[Server: cancelBookingWithPolicyGate(sysId)]
 1. Re-validate authenticated passenger ownership (UID)
 2. Check current status:
    └── If already 'Cancelled': return ALREADY_CANCELLED
 3. Check System Property: x_mtts.cancellation.policy_status
    └── If != 'ACTIVE': abort with POLICY_UNCONFIGURED
 4. Calculate Authoritative Refund:
    └── MetroRefundCalculator.calculateRefund(bkgGr)
 5. Update Record State:
    - status = 'Cancelled'
    - cancellation_time = GlideDateTime()
    - refund_amount = calculatedRefund
                 │
                 ▼
[Authoritative Turnstile Invalidation (TC-027)]
 Handheld Scanner / Gate Verifier:
 MetroTicketGenerator.verifyTicketToken(tkt, tok)
 └── Checks: status == 'Generated'?
     └── FALSE! (status is 'Cancelled')
     └── Output: TICKET_REVOKED_OR_CANCELLED (Access Denied)
```

### 4.1 Key Security Protections:
- **No Money Transfer Claim:** The system does not claim electronic funds were disbursed; it records an authoritative `refund_amount` credit liability for ticketing office settlement.
- **Idempotency:** A second cancellation request returns `ALREADY_CANCELLED` and does not duplicate refund calculations or corrupt the historical audit log.
- **Audit Preservation:** The stored `qr_token_hash` is **not deleted or overwritten** upon cancellation, preserving the complete forensic chain of custody.

---

## 5. Test Verification Evidence

Automated tests in [`sn_source/test/test_phase3_ui_and_integration.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/test/test_phase3_ui_and_integration.js) verify:
- Cancellation is blocked when policy is `UNCONFIGURED` — **PASS**
- Explicit error `POLICY_UNCONFIGURED` returned — **PASS**
- Record status remains unchanged when blocked — **PASS**
- Backend Business Rule blocks direct status update to `Cancelled` when policy is `UNCONFIGURED` — **PASS**
- Cancellation succeeds when policy is set to `ACTIVE` under controlled test fixture — **PASS**
- Authoritative refund amount calculated and stored — **PASS**
- Turnstile verifier immediately rejects cancelled ticket (`TICKET_REVOKED_OR_CANCELLED`) (TC-027) — **PASS**
- Repeated cancellation attempts rejected with `ALREADY_CANCELLED` — **PASS**
- Administrative rejection fallback transitions status to `Cancelled` with mandatory reason and `$0.00` refund without triggering passenger policy errors — **PASS** (TC-019)

---

## 6. Administrative Rejection vs. Passenger Cancellation

It is critical to distinguish operational rejections from commuter-initiated cancellations:

| Dimension | Passenger-Requested Cancellation | Administrative Rejection (Fallback) |
| :--- | :--- | :--- |
| **Originating Action** | Commuter clicks "Cancel Booking" on `/my-metro-bookings` | Station Approver rejects request on `sc_req_item` |
| **Target State** | `Cancelled` | `Cancelled` (Baseline 4-status model fallback) |
| **Prerequisite Gate** | `x_mtts.cancellation.policy_status == 'ACTIVE'` | Independent of policy gate (administrative necessity) |
| **Mandatory Reason** | Optional passenger reason (e.g. "Plans changed") | Mandatory approver rejection comments (`Administrative Rejection: <comments>`) |
| **Refund Calculation** | Tiered percentage evaluation (90% / 75% / 0%) | Exactly `$0.00` (no fare deducted, no ticket fulfilled) |
| **Audit Classification** | Voluntary Commuter Churn | Station Operational Restriction (Weather, Overcrowding, Track Work) |
| **UI Presentation** | Standard "Cancelled" badge with refund details | Prominent "Declined by Operations" badge with rejection justification |
