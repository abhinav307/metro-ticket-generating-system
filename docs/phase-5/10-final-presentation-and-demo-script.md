# Phase 5: Final Presentation & 15-Part Demonstration Script
## Metro Ticket Generating System in ServiceNow (MTTS)
**Application Scope:** `x_mtts`  
**Phase:** 5 of 5 — Final Project Delivery & Live Demonstration  
**Presenter:** Senior ServiceNow Solution Architect & Implementation Lead  
**Audience:** Project Evaluators, Enterprise Architecture Review Board, Transit Stakeholders  

---

### Master Demonstration Narrative Structure (15 Parts)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SECTION A: FOUNDATION & COMMUTER FLOW                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Part 1 : Executive Introduction & Architectural Concept                    │
│  Part 2 : Persona Architecture & Security Matrix                            │
│  Part 3 : Transit Network Master Data & Fare Modeling                       │
│  Part 4 : Commuter Experience: Service Portal Landing (/metro)             │
│  Part 5 : Service Catalog Dynamic Booking Form & Fare Preview AJAX          │
│  Part 6 : Booking Submission & Authoritative Financial Snapshot             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SECTION B: APPROVAL, FULFILLMENT & QR                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Part 7 : Station Master Operational Review & Approval Action               │
│  Part 8 : Automated Ticket Fulfillment & Concurrency Numbering Allocation   │
│  Part 9 : Pure Vector SVG QR Code Rendering & Payload Serialization         │
│  Part 10: Commuter My Bookings, Ticket View & IDOR Security Proof           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 SECTION C: TURNSTILE REST, SECURITY & AUDIT                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Part 11: Turnstile Scanner Scripted REST API Gate Verification             │
│  Part 12: Immutable Audit Logging & Zero Bearer Token Leakage               │
│  Part 13: Live Security Penetration & Denial-of-Service Defense Simulation │
│  Part 14: Master Data Migration Engine & Production Synthetic Data Barrier  │
│  Part 15: Master Automated Test Runner (268 Assertions) & Final Decision   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Part 1: Executive Introduction & Architectural Concept
- **Presenter Narrative:**  
  "Welcome. Today we present the completed Metro Ticket Generating System built natively on the ServiceNow enterprise platform under custom private scope `x_mtts`. Our objective has been to replace legacy paper ticketing with a modern, cloud-native transit platform providing automated Service Catalog booking, real-time fare computation, role-based approvals, cryptographically verified vector QR ticketing, high-throughput turnstile REST APIs, and tamper-proof audit trails. The system preserves strict adherence to approved requirements FR-001 through FR-030 across 5 phases, 6 epics, and 26 implementation stories."

---

### Part 2: Persona Architecture & Security Matrix
- **Presenter Narrative:**  
  "Security in transit ticketing is paramount. We demonstrate how the application enforces strict separation of duties across four distinct personas:"
- **Personas Demonstrated:**
  1. `Metro Commuters` (`x_mtts.user`): Registered transit passengers who submit bookings and view only their personal booking records.
  2. `Metro Station Approvers` (`x_mtts.approver`): Station staff who review passenger bookings and grant approvals.
  3. `Metro Turnstile Devices` (`x_mtts.scanner`): Dedicated hardware/system accounts invoking the verification REST API.
  4. `Metro Operations Administrators` (`x_mtts.admin`): System managers administering fare rules, routes, and governance properties.

---

### Part 3: Transit Network Master Data & Fare Modeling
- **Presenter Narrative:**  
  "Let us inspect the master data foundation. The system models physical stations in `x_mtts_station`, connected routes in `x_mtts_route`, commercial products in `x_mtts_ticket_type`, and dynamic pricing in `x_mtts_fare_rule`."
- **Visual Demo:**
  - Station: `STN-01` (Central Station, Red Line, Order 1).
  - Route: `STN-01` to `STN-04` (Distance: 18.5 km).
  - Pricing Model: Distance-based calculation (`rate_per_km * distance_km`) with minimum fare threshold, alongside flat-rate Daily and Monthly Passes.

---

### Part 4: Commuter Experience: Service Portal Landing (`/metro`)
- **Presenter Narrative:**  
  "Commuters interact with the branded, mobile-first Service Portal at URL path `/metro`. Notice the unified route navigation, responsive branding, quick booking action cards, and active ticket alerts."
- **Visual Demo:**
  - Open browser to `https://<instance>.service-now.com/metro`.
  - Highlight the portal header widget (`widget_metro_portal_header`) displaying commuter status and shortcuts to *Book a Ticket* and *My Bookings*.

---

### Part 5: Service Catalog Dynamic Booking Form & Fare Preview AJAX
- **Presenter Narrative:**  
  "We initiate a booking. Commuter opens the booking catalog item. Watch how changing the origin and destination stations dynamically calculates the distance and updates the fare preview in real time via asynchronous AJAX without page reloads."
- **Live Action:**
  - Select Origin: `Central Station` (STN-01).
  - Select Destination: `Airport Terminal` (STN-04).
  - Select Ticket Type: `Single Journey`.
  - Select Passenger Count: `2`.
  - Fare Preview displays: `Distance: 18.5 km | Total Fare: $74.00 USD`.

---

### Part 6: Booking Submission & Authoritative Financial Snapshot
- **Presenter Narrative:**  
  "The commuter clicks 'Submit Booking'. Now notice what occurs on the backend: a Before Insert Business Rule executes `MetroFareCalculator` authoritatively. Even if a malicious user attempted to manipulate client-side JavaScript, the server overrides the total fare with the authoritative calculation."
- **System Evidence:**
  - Record created in `x_mtts_booking_ticket`.
  - Allocated Booking Reference: `BKG-20261015-000042`.
  - Status: `Pending`.
  - Ticket Number: `null` (Preserving the strict rule that ticket numbers are never issued prior to approval).

---

### Part 7: Station Master Operational Review & Approval Action
- **Presenter Narrative:**  
  "We transition personas to Station Approver (`usr_station_master`). In the approval workspace, the approver reviews the pending booking request."
- **Live Action:**
  - Approver reviews origin, destination, date, and passenger details.
  - Clicks **Approve**.
  - Flow Designer captures the state transition and updates `status` to `Approved`.
  - An advisory event `x_mtts.booking.approved` is queued.

---

### Part 8: Automated Ticket Fulfillment & Concurrency Numbering Allocation
- **Presenter Narrative:**  
  "Instantly upon approval, `BR - Fulfill On Approval` triggers `MetroTicketGenerator`. The engine invokes `MetroNumberFormatter` to allocate the unique ticket number. To prevent race conditions during rush hour booking spikes, the allocator uses an atomic, transactionally locked table `x_mtts_daily_sequence`."
- **System Evidence:**
  - Allocated Ticket Number: `TKT-20261025-000001`.
  - Uniqueness guaranteed: format `TKT-YYYYMMDD-XXXXXX`.

---

### Part 9: Pure Vector SVG QR Code Rendering & Payload Serialization
- **Presenter Narrative:**  
  "Now look at the ticket artifact. Rather than relying on external cloud APIs or pixelated PNGs, `MetroQRGenerator` generates an inline vector SVG matrix directly in server-side JavaScript. Embedded within the QR matrix is a minimal JSON payload containing transit routing details and a 128-bit unguessable CSPRNG bearer token. The token's SHA-256 hash is committed to the database, while the raw token is never saved on the server."
- **Payload Inspection:**
  `{"v":1,"tkt":"TKT-20261025-000001","bkg":"BKG-20261015-000042","src":"STN-01","dst":"STN-04","dt":"2026-10-25","typ":"SNG","pax":2,"tok":"a7f9c2d4e8b1056341fa8920bcdef412"}`

---

### Part 10: Commuter My Bookings, Ticket View & IDOR Security Proof
- **Presenter Narrative:**  
  "Returning to the commuter persona, we navigate to `/metro?id=my_metro_bookings`. The commuter's ticket is displayed with its vector QR code, booking reference, and travel details. Now, let us prove IDOR security: if a different logged-in commuter attempts to request this booking ID directly via the portal service API, the system enforces contextual ACLs and returns `HTTP 403 ACCESS_DENIED`."
- **System Evidence:**
  - Passenger A views own booking: **Allowed**.
  - Passenger B requests Passenger A's booking: **Denied**.

---

### Part 11: Turnstile Scanner Scripted REST API Gate Verification (Simulated Local Verification)
- **Presenter Narrative:**  
  "Now we demonstrate turnstile verification. Because physical gate hardware and WAN networks are pending deployment (Case B), this verification is executed via our local test harness simulating the exact REST request generated by turnstile optical scanner firmware to `POST /api/x_mtts/scanner/verify-ticket`."
- **Simulated Request Execution:**
  ```json
  POST /api/x_mtts/scanner/verify-ticket
  Headers:
    Authorization: Basic <base64_scanner_credentials>
    Content-Type: application/json
  Body:
  {
    "ticket_number": "TKT-20261025-000001",
    "token": "a7f9c2d4e8b1056341fa8920bcdef412",
    "scanner_id": "GATE-NORTH-01",
    "station_code": "STN-01"
  }
  ```
- **Simulated API Response:**
  `HTTP 200 OK` — `{"result":"VALID","code":"VALID","ticket_number":"TKT-20261025-000001","message":"Ticket verified successfully. Gate open."}`
- **Verification Qualification:** Validated locally in test harness (Suite 7 & Suite 12). Physical gate relay actuation and WAN turnstile reader testing remain pending target instance commissioning.

---

### Part 12: Immutable Audit Logging & Zero Bearer Token Leakage (Simulated Local Verification)
- **Presenter Narrative:**  
  "Within milliseconds of the simulated scan, an immutable record is inserted into `x_mtts_scan_event`. Notice what is recorded: ticket number, scanner ID, station code, UTC timestamp, processing latency, and correlation GUID. Crucially, verify that the raw bearer token is strictly absent from the database record, guaranteeing zero token leakage."
- **Verification Qualification:** Validated via automated assertions in Suite 8 and Suite 12.

---

### Part 13: Live Security Penetration & Denial-of-Service Defense Simulation
- **Presenter Narrative:**  
  "Now we subject the turnstile API to hostile conditions in our simulated security harness:"
- **Attack Simulation 1: Counterfeit / Forged Bearer Token:**
  - Attacker presents valid ticket number with guessed token `ffffffffffffffffffffffffffffffff`.
  - System executes constant-time XOR hash comparison.
  - **Result:** `HTTP 401 TOKEN_MISMATCH` — Gate holds locked; incident logged.
- **Attack Simulation 2: Revoked / Cancelled Ticket:**
  - Commuter cancels booking, then presents original QR code at gate.
  - **Result:** `HTTP 403 TICKET_CANCELLED_OR_INVALID` — Gate holds locked.
- **Attack Simulation 3: Brute-Force Scanner Flood:**
  - Rogue terminal floods failed scans exceeding 5 attempts within 60 seconds.
  - **Result:** `HTTP 429 RATE_LIMITED` — Gate immediately throttles device.
- **Verification Qualification:** All three attack scenarios validated in local simulated regression tests (Suite 7, Suite 8, Suite 12).

---

### Part 14: Master Data Migration Engine & Production Synthetic Data Barrier
- **Presenter Narrative:**  
  "Transit schedules and fare tariffs change frequently. We demonstrate our automated migration engine `MetroDataMigrationService`. It executes an 11-point validation suite detecting orphan station codes, self-loop routes, and overlapping fare dates. Furthermore, we demonstrate our production safety gate: when run in `PRODUCTION` mode, any dataset containing synthetic development tags (`[SYNTHETIC_TEST_DATA]`) is strictly rejected, preventing data contamination."

---

### Part 15: Master Automated Test Runner (268 Assertions) & Final Decision
- **Presenter Narrative:**  
  "To conclude our presentation, we demonstrate continuous verification by executing the master automated test runner across all 12 test suites representing Phases 2 through 5. Please note that these 268 assertions reflect local simulated Glide environment testing, confirming that the code, logic, and schemas are complete, while live ServiceNow deployment and physical turnstile hardware commissioning remain pending."
- **Live Terminal Execution:**
  `node sn_source/test/run_all_tests.js`
- **Output:**
  ```text
  Total Test Suites Executed     : 12
  Total Test Assertions Executed : 268
  Passed Assertions              : 268 (100.0%)
  Failed Assertions              : 0 (0%)
  Total Execution Time           : 339ms
  Overall Test Result            : SUCCESS / ALL TESTS PASSED
  ```
- **Final Release Recommendation:**
  # **`GO — DEVELOPMENT VALIDATED, PRODUCTION PENDING`**
  "Thank you. The Metro Ticket Generating System is development validated, structurally complete, and ready for instance commissioning."
