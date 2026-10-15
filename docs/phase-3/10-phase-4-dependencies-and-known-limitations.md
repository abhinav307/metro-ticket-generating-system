# Document 10: Phase 4 Dependencies, Integration Contracts & Known Limitations

**Project:** Metro Ticket Generating System in ServiceNow (MTTS)  
**Application Scope:** `x_mtts`  
**Phase:** 3 of 5 (Service Portal, Service Catalog & User Experience)  
**Status:** COMPLETE / APPROVED HANDOFF SPECIFICATION  

---

## 1. Executive Summary

This document establishes the precise technical boundaries, interface contracts, and prerequisites for **Phase 4: Integration & Notification**.

Phase 3 delivered the passenger-facing Service Portal, dynamic catalog booking form, and interactive booking management UI. Phase 4 will introduce external gate verification endpoints (Scripted REST APIs), automated passenger notifications (email with inline SVG QR codes), and turnstile access event logging.

---

## 2. Phase 4 Interface Contracts & Handoff Points

Phase 2 and Phase 3 have established backend methods, data models, and system properties specifically designed to be consumed by Phase 4 components without refactoring existing code.

### 2.1 Scanner Verification REST API Contract

Phase 4 will implement a Scripted REST API (`POST /api/x_mtts/scanner/verify-ticket`) to be called by physical turnstiles, handheld inspector devices, or simulated gate readers.

#### QR Code Payload Specification (ISO/IEC 18004 Standard)
Phase 3 generates an authentic ISO/IEC 18004 QR code matrix containing a compact JSON payload:
```json
{
  "v": 1,
  "t": "TKT-20261015-000003",
  "k": "a1b2c3d4e5f67890abcdef1234567890"
}
```
* **Payload Fields:** `v` = schema version (integer 1), `t` = human-readable ticket number, `k` = 32-character unguessable bearer token.
* **Security & Privacy:** The QR payload contains **no plaintext secrets**, **no password hashes**, **no user PII**, and **no route/fare information**.
* **Optical Scannability:** Validated via automated end-to-end tests rasterizing the SVG to a 600×600 RGBA buffer and decoding using standard `jsQR` barcode reader library.

#### Ready Backend Method (`MetroTicketGenerator.js`)
Phase 4 simply invokes the existing server-side verification method:

```javascript
// Existing method in MetroTicketGenerator.js
var verificationResult = MetroTicketGenerator.verifyToken(ticketNumber, rawToken);
```

#### Expected Phase 4 Request Payload
```json
{
  "scanner_id": "GATE-CENTRAL-04",
  "station_code": "STN-01",
  "ticket_number": "TKT-20261015-000003",
  "bearer_token": "a1b2c3d4e5f67890abcdef1234567890",
  "scan_timestamp": "2026-10-15T14:30:00Z"
}
```

#### Standardized Response Codes
| Code | Verification Result | HTTP Status | Turnstile Action |
| :--- | :--- | :--- | :--- |
| `VALID` | Token matches hash and ticket is `Generated` | `200 OK` | **OPEN GATE** (Green light) |
| `TOKEN_MISMATCH` | Provided bearer token does not match hash | `401 Unauthorized` | **KEEP CLOSED** (Red light) |
| `TICKET_REVOKED_OR_CANCELLED` | Ticket status is `Cancelled` or `Used` | `403 Forbidden` | **KEEP CLOSED** (Audio alert) |
| `TICKET_NOT_FOUND` | No booking found for ticket number | `404 Not Found` | **KEEP CLOSED** (Invalid pass) |
| `OUTSIDE_VALIDITY_WINDOW` | Travel date has expired | `403 Forbidden` | **KEEP CLOSED** (Expired pass) |

---

### 2.2 Email Notification & Inline SVG Attachment Contract

Phase 4 will implement event-driven ServiceNow Email Notifications triggered when a booking transitions to `Generated` or `Cancelled`.

#### Trigger Event
* Event Name: `x_mtts.ticket.generated`
* Parms: `parm1 = bookingGr.getUniqueValue()`, `parm2 = bookingGr.getValue('ticket_number')`

#### Existing Attachment Anchor
When a ticket is fulfilled, `MetroTicketGenerator.js` writes the SVG QR code to `sys_attachment` and populates:
* Field: `x_mtts_booking_ticket.qr_attachment` $\rightarrow$ Points to the attachment record.

#### Phase 4 Mail Script Integration (`template.print`)
In Phase 4, the notification template can embed the QR code inline using standard ServiceNow email scripts:

```javascript
(function runMailScript(current, template, email, email_action, event) {
    var attachmentGr = new GlideRecord('sys_attachment');
    if (attachmentGr.get(current.getValue('qr_attachment'))) {
        var sa = new GlideSysAttachment();
        var svgXml = sa.getContent(attachmentGr);
        template.print('<div style="text-align:center; padding:15px; font-family:Arial, sans-serif;">');
        template.print('<h3 style="color:#0F172A; margin-bottom:8px;">Your Metro QR Pass</h3>');
        template.print(svgXml); // Embed vector SVG directly into email body
        template.print('<p style="font-size:14px; font-weight:bold; color:#475569; margin-top:8px;">Ticket: ' + current.getValue('ticket_number') + '</p>');
        template.print('</div>');
    }
})(current, template, email, email_action, event);
```

---

## 3. Candidate Review Flags & Governance System Properties

The following operational parameters were implemented under strict safety gates in Phases 1–3 and require formal stakeholder sign-off before production activation:

| Parameter | Current Setting | Governance Property | Remediation / Review Status |
| :--- | :--- | :--- | :--- |
| **Cancellation Policy Gate** | `UNCONFIGURED` (Hard Safety Lock) | `x_mtts.cancellation.policy_status` | **STRICTLY BLOCKED:** Passenger cancellation and refund calculation are blocked on both UI and Business Rule layers until finance/legal explicitly signs off. |
| **Lifecycle State Machine** | 4-Status Baseline (`Pending`, `Approved`, `Generated`, `Cancelled`) | `x_mtts.lifecycle.enable_rejected_status` | **ENFORCED:** Defaults to `false`. Direct transitions to unapproved `Rejected` status are aborted. Approvers declining bookings trigger administrative cancellation with reason prefix `Administrative Rejection:` and $0 refund. |
| **Refund Schedule Tiers** | $>24$h: 90%, $2\text{--}24$h: 75%, $<2$h: 0% | `x_mtts.refund.schedule` | **PROVISIONAL ONLY:** Gated by `policy_status`. Returning `POLICY_UNCONFIGURED` until stakeholder approval. |
| **Booking Horizon** | Maximum 30 days in advance | `x_mtts.booking.max_advance_days` | Operational transit configuration; default validated in catalog validation scripts. |
| **Passenger Group Limit** | Maximum 6 passengers per booking | `x_mtts.booking.max_passengers` | Operational transit threshold; validated in catalog client script and backend BR. |
| **Currency Code** | United States Dollar (`$`) | `x_mtts.currency.code` | Display formatting only; transit authority currency symbol. |
| **Pass Duration Window** | 24 hours from travel date | `x_mtts.pass.validity_hours` | Fixed validity duration for Pass ticket types. |

---

## 4. Known Limitations & Technical Boundaries

To maintain technical honesty and avoid scope creep, the following boundaries are formally recorded:

1. **No Hardware Turnstile Driver:**
   * ServiceNow does not communicate directly with turnstile microcontrollers (e.g., Arduino, ESP32, PLC) over physical GPIO pins.
   * ServiceNow provides the centralized cloud REST API; physical gate controllers must use an HTTP/HTTPS client or IoT MQTT bridge to send scan requests.
2. **Simulated Payment Gateway:**
   * In alignment with the approved Project Charter, financial payment processing is simulated (cashless transit booking). Real credit/debit card processing (PCI-DSS compliance, merchant gateways like Stripe or Adyen) is out of scope.
3. **Pure Vector SVG Rendering:**
   * The system generates native vector SVGs using an embedded pure-JavaScript ISO/IEC 18004 engine without external raster images or third-party web services (Google Charts, QuickChart). If an external client requires raster PNGs, a canvas converter or Phase 4 helper endpoint can be added.
4. **Offline Scanner Resilience:**
   * Turnstile verification relies on active HTTP connectivity to the ServiceNow instance. If network connectivity between a station gate and the ServiceNow cloud is interrupted, turnstile fail-safe policies (local gate caching or fail-open/closed protocols) must be handled at the physical gate controller layer.
5. **Execution Environment Distinction:**
   * All unit, integration, state transition, and optical barcode decoding tests have been verified in the project's local Node.js simulated ServiceNow environment (with `jsQR` optical verification). Deployment and functional verification on an active, live ServiceNow Vancouver/Washington instance requires customer instance credentials and scoped application installation.

---

## 5. Phase 4 Readiness Checklist

- [x] Authentic ISO/IEC 18004 QR matrix generator embedded in `MetroQRGenerator.js` and verified scannable via `jsQR`.
- [x] Backend token verification method `MetroTicketGenerator.verifyToken()` verified with zero hash leakage.
- [x] Strict 4-status lifecycle enforced; administrative rejection mapped to `Cancelled` with audit trail.
- [x] Dual-layer cancellation policy gate (`UNCONFIGURED`) verified in Portal widget and Business Rule.
- [x] Scoped QR SVG attachments linked directly to booking records in `sys_attachment`.
- [x] System properties established and tested for all governance and operational parameters.
- [x] Role hierarchy configured for scanner service accounts (`x_mtts.scanner`).
- [x] Full automated test suite passing (186/186 assertions across 6 test suites).
- [ ] Phase 4 Task 1: Scripted REST API for turnstile scanner verification.
- [ ] Phase 4 Task 2: Automated Email Notifications with embedded SVG QR codes.
- [ ] Phase 4 Task 3: Turnstile event logging and audit history table.
