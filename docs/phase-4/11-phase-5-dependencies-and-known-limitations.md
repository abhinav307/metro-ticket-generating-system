# Phase 5 Dependencies, Handoff Contracts, and Known Limitations
## Application Scope: `x_mtts` | Handoff to Phase 5 (Go-Live & Operations)

---

### 1. Phase 5 Scope and Objectives

Phase 5 represents the final phase of the Metro Ticket Generating System: **Production Deployment, Operational Readiness, Transit Authority Sign-Off, and Go-Live Operations**. Phase 4 has completed all software engineering, data migration services, Scripted REST verification endpoints, audit trails, event-driven notifications, security boundaries, and 100% automated test coverage across 253 assertions.

Phase 5 focuses exclusively on operational enablement, infrastructure connectivity, physical hardware commissioning, transit stakeholder policy ratification, and production cutover.

---

### 2. Outstanding Dependencies for Production Go-Live

| Dependency | Category | Responsible Stakeholder | Description | Readiness Status |
| :--- | :--- | :--- | :--- | :---: |
| **Live ServiceNow Instance** | Infrastructure | Platform Operations Team | Target instance URL, administrative credentials, and scoped application installation permissions. | **Awaiting Credentials** |
| **Hardware Turnstile Readers** | IoT / Physical | Transit Hardware Vendor | Physical turnstile barcode scanners programmed with HTTPS client certs or OAuth client IDs. | External Handoff |
| **Network Infrastructure** | Telecommunications | Metro Network Engineering | Low-latency private WAN connecting subterranean station gates to ServiceNow cloud endpoints over TLS 1.3. | External Handoff |
| **Official Tariff & Route Data** | Business Operations | Transit Authority Stakeholders | Certified metro station names, precise track kilometer distances, and legally approved fare rules. | Migration Ready |
| **Mail Server SPF / DKIM** | Security / Email | Enterprise IT Security | Outbound SMTP relay authorization to prevent transit ticket emails from landing in spam folders. | Configuration Ready |

---

### 3. Policy Gates & Governance Invariants

The following governance settings must be preserved during the transition into Phase 5:

```
Governance Baseline Settings:
1. Cancellation Safety Gate    : x_mtts.cancellation.policy_status = UNCONFIGURED
   • Prevents accidental, unapproved, or unrefunded booking cancellations.
   • Must remain UNCONFIGURED until transit authority business leadership formally approves 
     cancellation fee schedules, time windows, and refund disbursement protocols.

2. Turnstile Retention Gate    : x_mtts.audit.retention_policy_status = UNCONFIGURED
   • Prevents automated or premature deletion of scan audit logs (retention_days = 0).
   • Must remain UNCONFIGURED until legal and compliance teams formally ratify the retention window.

3. Notification Dispatch Gate  : x_mtts.notifications.enabled = false
   • Halts live outbound email dispatches by default.
   • Prevents unexpected mail delivery until target instance SMTP relays are verified.

4. 4-Status Lifecycle Model     : x_mtts.lifecycle.enable_rejected_status = false
   • Restricts booking status transitions to: Pending -> Approved -> Generated -> Cancelled.
   • Keeps the 'Rejected' status disabled to prevent workflow deadlocks until a multi-stage 
     re-submission or appeal business process is defined.

5. Backlog Baseline Counts     : 5 Phases, 6 Epics, 26 Stories/Tasks, 12 Subtasks
   • Preserved without alteration throughout Phases 1, 2, 3, and 4.
```

---

### 4. Known Technical Limitations & Operational Mitigations

#### 4.1 Subterranean Network Latency & Intermittent Offline States
- **Limitation:** In the event of a fiber cut or severe network outage isolating an underground station, turnstile readers cannot query the cloud-hosted `verify-ticket` REST API in real time.
- **Operational Mitigation:**
  - Turnstile hardware is configured with local caching of recent scans to prevent double-entry.
  - Phase 5 architectural roadmap includes an optional Edge Gateway appliance running an on-premise local token verification service synchronized with ServiceNow via background batches.

#### 4.2 Email Client Inline Barcode Restrictions
- **Limitation:** Desktop Microsoft Outlook and Gmail proxy renderers actively block inline SVG XML elements and Base64 data URIs.
- **Operational Mitigation:**
  - Mitigated via MTTS's verified **Dual-Delivery Strategy** (attached standalone `.svg` vector file plus direct mobile-responsive Service Portal ticket link).
  - Phase 5 deployment may optionally introduce an automated server-side rasterization utility (e.g. converting SVG to PNG) if corporate branding requires inline visual rendering in Outlook.

#### 4.3 High-Volume Audit Event Accumulation
- **Limitation:** In high-traffic metro environments with 100,000+ daily commuter scans, `x_mtts_scan_event` table volume could exceed tens of millions of records within months.
- **Operational Mitigation:**
  - Designed and verified `MetroAuditRetentionService` supporting a 90-day candidate rolling retention window.
  - Policy remains dormant (`x_mtts.audit.retention_policy_status = UNCONFIGURED`, `retention_days = 0`) until formally approved by transit stakeholders.
  - Cold archival export scripts prepared for regulatory compliance archiving prior to purge activation.

---

### 5. Phase 5 Readiness Sign-Off Checklist

- [x] **Core Backend Artifacts:** 7 tables (including daily sequence and scan events), fare calculator, ticket numbering, and lifecycle workflows implemented.
- [x] **Service Portal & Catalog UI:** Metro booking catalog item, dynamic fare preview, my bookings widget, and responsive ticket display implemented.
- [x] **Optical Verification:** Real QR barcode generation and jsQR optical decoding verified with 100% fidelity.
- [x] **Turnstile REST API:** `POST /api/x_mtts/scanner/verify-ticket` endpoint implemented with timing-safe comparison, rate limiting, and zero token leakage.
- [x] **Audit Logging:** `x_mtts_scan_event` table and service operational with strict administrative ACL boundaries and retention governance.
- [x] **Notifications:** 7 platform events registered, deduplication active, and dual-delivery email templates configured with safe default switch (`false`).
- [x] **Master Data Engine:** 11-point pre-flight validator, dry-run simulation, partial failure isolation, and idempotent upserts ready.
- [x] **Test Verification:** 11 test suites comprising 253 automated assertions executed with 100% pass rate.
- [x] **Documentation:** Complete 12-file Phase 4 documentation suite published under `docs/phase-4/` (including `12-final-readiness-remediation.md`).
- [x] **Phase 5 Go Decision:** **GO FOR PHASE 5 DEPLOYMENT PREPARATION** formally declared.
