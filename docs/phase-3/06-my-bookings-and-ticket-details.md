# My Bookings & Digital Ticket Details Architecture
## Metro Ticket Generating System in ServiceNow (MTTS)

---

## 1. Architectural Objectives & Security Posture

The **My Bookings & Digital Tickets** page (`/my-metro-bookings`) provides passengers with self-service tracking of their active and historical metro bookings.

### Key Security Posture:
1. **Absolute IDOR Prevention:** Commuters must only ever see their own records. Access control is enforced on the server tier by binding all queries to `passenger == gs.getUserID()`.
2. **Zero Cryptographic Token Exposure:** The raw 128-bit bearer token and its SHA-256 digest (`qr_token_hash`) are **never returned to the browser** in list queries or detail payloads.
3. **Status-Gated QR Rendering:** A digital QR boarding pass is rendered **only** when the booking record has achieved `Generated` status. In `Pending` or `Approved` status, the QR code section is withheld to prevent fraudulent pre-boarding.

---

## 2. Component Implementation: `widget_my_metro_bookings`

Location: [`sn_source/service_portal/widgets/widget_my_metro_bookings/`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/service_portal/widgets/widget_my_metro_bookings/)

### 2.1 Server Tier Data Architecture (`MetroPortalService.js`)
When the widget loads, the server controller queries the database through `MetroPortalService.getMyBookings()`:
```javascript
// Excerpt from MetroPortalService.js
var userId = gs.getUserID();
var bkgGr = new GlideRecord('x_mtts_booking_ticket');
bkgGr.addQuery('passenger', userId); // Server-enforced boundary
bkgGr.orderByDesc('sys_created_on');
bkgGr.query();

while (bkgGr.next()) {
    bookings.push(this._formatBookingSummary(bkgGr));
}
```

The formatting method sanitizes all data:
- Resolves foreign keys (`x_mtts_station`, `x_mtts_ticket_type`) into human-readable labels.
- Converts numerical values into formatted strings (e.g., `$42.50`).
- Omits internal audit hashes and tokens.

---

## 3. Digital Ticket & Vector QR Modal (`widget_metro_ticket_modal`)

When a passenger clicks **"View QR Ticket"** or **"View Details"**, the client controller triggers an AJAX request with `action: 'get_details'`.

### 3.1 Server-Side Ownership Re-validation
The server script does not trust client state. It executes `MetroPortalService.getBookingDetailsAndQR(bookingSysId)`:
```javascript
var bkgGr = new GlideRecord('x_mtts_booking_ticket');
if (!bkgGr.get(bookingSysId)) {
    return { success: false, error: 'NOT_FOUND' };
}

// Strict IDOR Check
if (bkgGr.getValue('passenger') !== gs.getUserID() && !gs.hasRole('x_mtts.admin')) {
    gs.warn('[x_mtts] Security Violation: User ' + gs.getUserID() + ' attempted IDOR on ' + bookingSysId);
    return { success: false, error: 'UNAUTHORIZED' };
}
```

### 3.2 Status-Specific Modal Behavior

```
               ┌───────────────────────────────┐
               │    Modal Requested (SysId)    │
               └──────────────┬────────────────┘
                              │
               ┌──────────────┴──────────────┐
               │ Re-validate Ownership (UID) │
               └──────────────┬──────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼ (status: Pending)  ▼ (status: Generated)▼ (status: Cancelled)
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Pending View     │ │ Ticket Ready     │ │ Cancelled View   │
│ - Amber Banner   │ │ - Green Header   │ │ - Red Banner     │
│ - Explanatory    │ │ - Issued Ticket# │ │ - CANCELLED stamp│
│   Notice         │ │ - Vector SVG QR  │ │ - Revoked notice │
│ - QR WITHHELD    │ │   from Attachment│ │ - Refund details │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

#### Detailed State Rendering:
1. **`Generated` Status (TC-022, TC-025):**
   - Header displays emerald green badge with authoritative ticket number: `TKT-YYYYMMDD-XXXXXX`.
   - The vector SVG content is retrieved from `sys_attachment` linked via `bkgGr.qr_attachment`.
   - The SVG markup is rendered securely using AngularJS `$sce.trustAsHtml()`.
   - Displays transit turnstile scanning instructions.
2. **`Pending` Status (TC-017):**
   - Displays amber badge: `Pending Supervisor Approval`.
   - Explains that ticket generation is awaiting approval. The QR container displays an hourglass icon (`⏳`) without ticket numbers.
3. **`Approved` Status (TC-018):**
   - Displays blue badge: `Approved — Issuance in Progress`.
4. **`Cancelled` Status (TC-027):**
   - Displays red badge: `Cancelled`.
   - Prominently warns: *"This booking has been cancelled and is invalid for transit passage."*
   - Displays authoritative refund amount if policy was applied.

---

## 4. Test Verification Evidence

Automated tests in [`sn_source/test/test_phase3_ui_and_integration.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/test/test_phase3_ui_and_integration.js) verify:
- Commuter retrieves their own bookings (TC-024) — **PASS**
- Foreign passenger IDOR access rejected with `UNAUTHORIZED` — **PASS**
- `qr_token_hash` and `rawToken` omitted from portal payloads — **PASS**
- `Pending` booking details return `ticketReady: false` and `svgContent: null` — **PASS**
- `Generated` booking details return `ticketReady: true` with pure vector SVG from `sys_attachment` (TC-025) — **PASS**
- Ticket number matches authoritative issued number — **PASS**
