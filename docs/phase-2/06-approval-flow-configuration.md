# Approval Engine & Workflow Implementation
## Metro Ticket Generating System in ServiceNow

---

## 1. Architectural Strategy & Approval Model

In Phase 1 remediation, the approval mechanism was formally established:
- **Approval Target:** Standard Service Catalog Request Item (`sc_req_item`).
- **Trigger Scoping:** Strictly restricted to catalog items where `cat_item.name == 'Metro Ticket Booking'`.
- **Approval Group:** `Metro Station Approvers` (assigned role `x_mtts.approver`).
- **Child Record Synchronization:** The custom record in `x_mtts_booking_ticket` is linked to `sc_req_item` via the `request_item` reference field and updated synchronously upon approval decisions.

The complete flow definition has been engineered as structured Flow Designer JSON metadata under [`sn_source/sys_hub_flow/MetroBookingApprovalAndFulfillmentFlow.json`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/sys_hub_flow/MetroBookingApprovalAndFulfillmentFlow.json).

---

## 2. Trigger Configuration & Scoping Boundary

To avoid impacting any existing catalog items or workflows on the target ServiceNow instance:
- **Trigger Type:** Record Created
- **Trigger Table:** `sc_req_item`
- **Filter Condition:** `cat_item.name == 'Metro Ticket Booking'` AND `stage == 'Request Approved'` (or upon insert).
- **Execution:** Runs as System User with elevated scoped permissions to manage `x_mtts_booking_ticket`.

---

## 3. Flow Action Sequence

```
[Trigger: sc_req_item created for 'Metro Ticket Booking']
           │
           ▼
[Action 1: Lookup Child Booking Record]
 Query: x_mtts_booking_ticket WHERE request_item = fd_data.trigger.current.sys_id
           │
      Found? ─── No ──► [Wait / Log Warning / Abort]
           │
           ▼
[Action 2: Ask For Approval]
 Approvers: Metro Station Approvers Group
 Rule: Anyone approves OR Anyone rejects
           │
     ┌─────┴─────────────────────────────────┐
     ▼                                       ▼
 [APPROVED]                              [REJECTED]
     │                                       │
[Action 3A: Update Booking Status]      [Action 3B: Handle Rejection]
 status = 'Approved'                     Under Candidate Model: status = 'Rejected'
     │                                   Under Baseline Model: status = 'Cancelled'
     ▼                                   sc_req_item.state = 4 (Closed Incomplete)
[Action 4A: Invoke Ticket Generator]     Add Work Note: Rejection Reason
 Script: MetroTicketGenerator.generateTicket()
     │
 Successful?
     ├── Yes ──► Update sc_req_item.state = 3 (Closed Complete)
     │           Attach Ticket Reference to RITM Work Notes
     │
     └── No  ──► Update sc_req_item.state = 4 (Closed Incomplete)
                 Log Error: "Fulfillment failure: " + result.error
```

---

## 4. Child Booking Resolution & Error Defense

### 4.1 Lookup & Synchronization
In standard Service Catalog flows, the record in `x_mtts_booking_ticket` is created by a Catalog Item script or Cart API during checkout. The Flow Designer action performs:
```javascript
var bkgGr = new GlideRecord('x_mtts_booking_ticket');
bkgGr.addQuery('request_item', current.sys_id);
bkgGr.query();
if (bkgGr.next()) {
    // Child booking successfully identified
}
```

If the child record is not immediately resolved (e.g., asynchronous order guide commit), the flow incorporates a 5-second wait retry step before raising an exception.

### 4.2 Handling the "Rejected" Status Governance Decision
Phase 1 identified an open governance question: whether `Rejected` should be formalized as a 5th choice on `x_mtts_booking_ticket.status` or mapped to `Cancelled`.
- The Flow Designer definition handles both cleanly:
  - If the target instance has added the candidate `Rejected` choice, the flow sets `bkgGr.status = 'Rejected'`.
  - If the instance adheres to the strict 4-choice baseline, the flow sets `bkgGr.status = 'Cancelled'` and stamps the work notes with `"Application rejected by Approver: [Comments]"`.
- In either case, `sc_req_item.state` transitions to `4` (Closed Incomplete) and notifications are dispatched.

### 4.3 Automated Fulfillment Invocation
Upon approval, Action 4A invokes the scoped script include:
```javascript
var tktGen = new x_mtts.MetroTicketGenerator();
var result = tktGen.generateTicket(bkgGr.getValue('sys_id'));

if (result.success) {
    current.work_notes = "Metro Ticket generated successfully. Ticket Number: " + result.ticketNumber;
    current.stage = 'Fulfilled';
    current.state = 3; // Closed Complete
    current.update();
} else {
    current.work_notes = "Ticket fulfillment failed: " + result.error.message;
    current.stage = 'Request Cancelled';
    current.state = 4; // Closed Incomplete
    current.update();
}
```

---

## 5. Traceability to Test Plan

| Requirement ID | Test Case ID | Test Verification Description | Flow Outcome |
| :--- | :--- | :--- | :--- |
| `FR-017` | `TC-017` | Initial booking record in `Pending` awaiting approval | Verified |
| `FR-018` | `TC-018` | Approval decision updates booking status to `Approved` | Verified |
| `FR-019` | `TC-019` | Ticket generation is triggered only after approval | Verified |
| `FR-022` | `TC-022` | Successful generation transitions status to `Generated` | Verified |
| `FR-023` | `TC-023` | Rejection sets RITM to Closed Incomplete with audit notes | Verified |
