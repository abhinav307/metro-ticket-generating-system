# metro-ticket-generating-system

## Metro Ticket Generating System in ServiceNow (MTTS)
**Application Scope:** `x_mtts`  
**Current Status:** `GO — DEVELOPMENT VALIDATED, PRODUCTION PENDING`  
**Local Test Validation:** 12 Automated Test Suites | 268 Assertions Executed | **268 Passed (100.0%)**

---

### Overview

The **Metro Ticket Generating System (MTTS)** is an enterprise transit ticketing and turnstile validation application engineered for the ServiceNow platform. It provides end-to-end management of transit operations, including commuter self-service booking via Service Catalog and Service Portal, automated multi-step approvals and fulfillment via Flow Designer, optical QR code ticket delivery with constant-time cryptographic verification, turnstile scanner REST APIs, automated email notifications, and administrative master data migration and retention engines.

---

### Key Features & Architecture

- **Scoped Isolation (`x_mtts`):** Complete functional isolation across 7 custom tables, 12 Script Includes, 5 Business Rules, 1 Flow Designer definition, 1 Service Catalog item with 8 variables, 3 Service Portal pages, and 4 modular widgets.
- **Dynamic Fare Calculation:** Real-time distance-based and flat-rate tariff engine supporting Single Journey, Return (with round-trip discounts), and Daily Transit Passes.
- **Optical QR Generation & Verification:** In-memory vector SVG QR ticket generator with SHA-256 HMAC token hashing and constant-time string comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.
- **Hardware Turnstile Integration:** High-throughput Scripted REST API endpoint (`POST /api/x_mtts/scanner/verify-ticket`) with token rate limiting, failure throttling, and append-only scan event audit logging.
- **Automated Lifecycle & Notifications:** Deterministic 4-status booking lifecycle (`Pending`, `Approved`, `Ticket Issued`, `Cancelled`) with multi-event email notifications and dual-delivery (email attachment + portal view).
- **Master Data Ingestion Engine:** Robust 11-point pre-flight validation and dry-run migration engine for station master, route network matrices, and tariff schedules with strict separation of synthetic fixtures.
- **Fail-Closed Governance:** Unconfigured cancellation and retention policies block unauthorized cancellations and log purges by default.

---

### Project Structure

```text
├── docs/                          # Comprehensive 5-Phase Documentation
│   ├── phase-1/                   # Requirements & Architecture
│   ├── phase-2/                   # Data Model & Business Logic
│   ├── phase-3/                   # Catalog Item & Service Portal
│   ├── phase-4/                   # Turnstile REST API & Security
│   └── phase-5/                   # Deployment Reports & Runbooks
├── sn_source/                     # ServiceNow Scoped Application Source
│   ├── catalog_item/              # Service Catalog item & variables
│   ├── data/                      # Master data CSV fixtures & seeder
│   ├── notifications/             # Event registry & email templates
│   ├── schema/                    # 7 Scoped table schema XML definitions
│   ├── security/                  # Roles, groups, and ACL definitions
│   ├── service_portal/            # Portal pages and modular widgets
│   ├── sys_hub_flow/              # Flow Designer JSON workflows
│   ├── sys_properties/            # Scoped platform properties
│   ├── sys_script/                # Scoped Business Rules
│   ├── sys_script_include/        # 12 Scoped Script Includes
│   ├── sys_ws_definition/         # Scripted REST API definitions
│   ├── sys_ws_operation/          # Scripted REST resource operations
│   └── test/                      # 12 Automated test suites & mock runtime
├── scripts/                       # Migration and utility scripts
├── package.json                   # Node.js dev dependencies (jsqr, qrcode-generator)
└── README.md                      # Project documentation
```

---

### Running Automated Tests Locally

The application includes a comprehensive Node.js mock Glide runtime (`sn_source/test/mock_glide_env.js`) validating all platform logic, cryptographic comparison, and real optical QR decoding using `jsQR`:

```bash
# Run the master automated test suite
node sn_source/test/run_all_tests.js
```

**Verification Results:**
- 12 Test Suites Executed
- 268 Assertions Executed
- 268 Passed (100.0%)
- 0 Failures

---

### Target Repository
`https://github.com/abhinav307/metro-ticket-generating-system.git`
