# Metro Ticket Generating System in ServiceNow
## Phase 1 Deliverable: Requirements Specification & Scope Document

| Document Metadata | Value |
| :--- | :--- |
| **Document ID** | MTTS-DOC-02 |
| **Project Name** | Metro Ticket Generating System in ServiceNow |
| **Current Phase** | Phase 1: Requirement Analysis & Project Planning |
| **Author / Role** | ServiceNow Business Analyst & Solution Architect |
| **Status** | Phase 1 Blueprint Complete (Pending Stakeholder Sign-Off) |

---

### 1. Business Rationale & Operational Context

#### 1.1 Problem Solved
Traditional urban transit systems suffer from significant operational friction caused by reliance on physical ticket dispensing counters, paper magnetic-stripe tokens, and manual fare validation. Commuters face excessive wait times, cashiers experience operational stress during transit rush hours, and transit authorities encounter revenue leakage, auditing discrepancies, and equipment maintenance overhead. 

The **Metro Ticket Generating System in ServiceNow** addresses this problem by transforming the ticket reservation lifecycle into an enterprise-class, digital self-service workflow hosted on the ServiceNow cloud platform.

#### 1.2 Rationale for Using ServiceNow
Rather than deploying a disjointed third-party website, ServiceNow provides native enterprise platform capabilities ideally suited for municipal and transportation operations:
- **Service Catalog & Portal:** Pre-built responsive catalog framework with dynamic client-side scripting and UI policies.
- **Workflow / Flow Designer:** Native orchestration of approvals anchored on Service Catalog items, background tasks, and asynchronous ticket fulfillment.
- **Role-Based Access Control (RBAC):** High-assurance platform ACLs protecting sensitive financial records and customer booking histories.
- **Auditing & History:** Built-in platform audit logging tracking every state transition, configuration change, and approval decision.
- **Notification Framework:** Multi-channel notification engine (HTML email, in-portal notifications) without custom mail server overhead.

---

### 2. Operational User Journeys

#### 2.1 Passenger Booking Journey
1. The passenger accesses the ServiceNow Metro Service Portal and navigates to **"Book Metro Ticket"**.
2. The passenger selects an active **Origin (Source) Station** and an active **Destination Station** from searchable reference drop-downs.
3. The passenger selects the **Travel Date** (today or a future date within the owner-approved configurable booking window), **Ticket Type** (Single Journey, Return, or Pass), and **Number of Passengers** (a positive integer within the owner-approved configurable limit). A 30-day window and a maximum of 6 passengers are candidates for review, not approved defaults.
4. The system validates the station selection (ensuring source $\neq$ destination), queries the route matrix (for distance-based tickets), and dynamically calculates and displays the route distance, unit fare, and total fare in real time.
5. The passenger reviews the fare breakdown in a dynamic **Fare Summary Card** and clicks **"Submit Booking"**.
6. Service Catalog creates a Request Item (`sc_req_item`) for the specific **Metro Ticket Booking** catalog item. A Service Catalog-triggered flow, configured only for that item, validates the submission and creates exactly one linked `x_mtts_booking_ticket` record in `Pending` status.
7. The passenger receives an on-screen submission receipt with the booking reference and a booking-submitted notification, subject to the configured email environment.

#### 2.2 Administrator Maintenance Journey
1. The Metro Administrator logs into the backend ServiceNow workspace or portal administrative dashboard.
2. The administrator maintains station records (adding new stations, updating line zones, or deactivating stations under maintenance).
3. The administrator configures route pairs, specifying origin, destination, and precise journey distances in kilometers.
4. The administrator establishes fare calculation policies (base rate per kilometer, minimum fare thresholds, return trip multipliers, and fixed pass pricing) along with active start and end dates.
5. All updates to master tables trigger platform audit logs, ensuring accountability and preventing concurrent conflicting modifications.

#### 2.3 Approver Fulfillment Journey
1. When a booking request is submitted, a native approval record (`sysapproval_approver`) is generated targeting the parent `sc_req_item` and routed automatically to the designated Station Approval Group.
2. An authorized approver reviews the journey details, passenger count, and scheduling details via the Service Portal approval widget or backend standard views.
3. **Upon Approval:**
   - The approval state on the parent `sc_req_item` updates to `approved`.
   - The linked booking record transitions from `Pending` to `Approved`.
   - Fulfillment attempts to allocate a unique ticket number using the Phase 2-validated concurrency-safe method and generate a QR ticket using a secure random verification token whose hash is checked server-side.
   - The booking transitions to `Generated` only after the ticket number, QR artifact, and verification data have been persisted successfully.
   - The passenger is notified and the ticket becomes available in "My Bookings".
4. **Upon Rejection (Proposed 5th Status):**
   - The approval state on `sc_req_item` updates to `rejected` and the item closes as *Closed Incomplete*.
   - The booking record status transitions to `Rejected` (pending formal stakeholder confirmation; baseline fallback is `Cancelled` with mandatory administrative rejection notes).
   - Rejection comments are recorded on the booking record, and an advisory notification is dispatched to the commuter.

#### 2.4 Cancellation Journey
1. A passenger opens their "My Bookings" list, selects an active ticket, and reviews the cancellation policy.
2. If the ticket is in `Pending` or `Generated` status and the travel window has not elapsed, the passenger clicks **"Request Cancellation"** and enters a cancellation reason.
3. The system executes server-side validation to verify user ownership and policy compliance.
4. Upon confirmation, the booking status transitions to `Cancelled`; the verifier rejects the QR ticket because the authoritative status is no longer `Generated`. The token hash remains unchanged for audit, refund calculations follow the approved configurable policy, and a cancellation notification is dispatched.

---

### 3. Functional Requirements (FR)

Every functional requirement is uniquely identified, testable, and mapped 1-to-1 to a dedicated acceptance test case in [`11-test-plan-and-acceptance-criteria.md`](11-test-plan-and-acceptance-criteria.md).

| Req ID | Category | Requirement Description | Acceptance Test Mapping | Priority |
| :--- | :--- | :--- | :---: | :---: |
| **FR-001** | Master Data | The system shall provide an administrative interface to create, read, update, and deactivate Metro Station records (`Station Code`, `Station Name`, `Line/Zone`, `Active`). | **TC-001** | High |
| **FR-002** | Master Data | The system shall prevent the creation of duplicate Metro Station Codes and enforce that Station Code is unique, mandatory, and uppercase alphanumeric. | **TC-002** | High |
| **FR-003** | Master Data | The system shall maintain a Metro Route matrix containing Origin Station, Destination Station, Distance in Kilometers ($> 0.00$), and Active status. | **TC-003** | High |
| **FR-004** | Master Data | The system shall maintain configurable Fare Rules specifying Ticket Type, Base Rate/km, Minimum Fare, Return Multiplier, Fixed Pass Fare, and Effective Validity Dates. | **TC-004** | High |
| **FR-005** | Master Data | The system shall support three distinct Ticket Types: `Single Journey`, `Return`, and `Pass`. | **TC-005** | High |
| **FR-006** | Catalog UI | The Service Catalog item shall prompt the user for Origin Station, Destination Station, Travel Date, Ticket Type, and Number of Passengers. | **TC-006** | High |
| **FR-007** | Catalog UI | The catalog interface shall restrict Origin and Destination Station selections exclusively to active stations using dynamic reference qualifiers. | **TC-007** | High |
| **FR-008** | Client Validation | The client interface shall immediately block and flag an error if a passenger selects an identical Origin and Destination station. | **TC-008** | High |
| **FR-009** | Client Validation | The client interface shall restrict the Travel Date picker to today or future dates within the approved configurable advance window, blocking past dates. A 30-day window is only a candidate for review and must not be activated without approval. | **TC-009** | Medium |
| **FR-010** | Dynamic Preview | Upon selection of valid stations, ticket type, and passenger count, the client interface shall trigger a GlideAjax request to calculate and display distance, unit fare, and total fare in real time. | **TC-010** | High |
| **FR-011** | Server Pricing | The system shall execute authoritative fare calculation on the server side prior to saving the booking, completely disregarding any client-submitted price variables. | **TC-011** | High |
| **FR-012** | Single Fare Rule | For Single Journey tickets, Unit Fare shall be calculated as: $\max(\text{Minimum Fare}, \, \text{Distance} \times \text{Rate/km})$. | **TC-012** | High |
| **FR-013** | Return Fare Rule | For Return tickets, Unit Fare shall be calculated as: $(\text{Single Journey Fare}) \times \text{Return Multiplier}$. | **TC-013** | High |
| **FR-014** | Pass Fare Rule | For Pass tickets, distance calculation is bypassed; Unit Fare shall be derived from the applicable approved fixed-fare rule. Do not require or imply a specific validity tier until the Pass policy is approved. | **TC-014** | High |
| **FR-015** | Total Fare | Total Fare shall be computed strictly as: $\text{Unit Fare} \times \text{Passenger Count}$. | **TC-015** | High |
| **FR-016** | Snapshotting | Upon booking creation, the system shall snapshot and persist the calculated distance, unit fare, total fare, and approved currency code onto the booking record so subsequent master fare rule changes do not alter historic fare meaning. | **TC-016** | High |
| **FR-017** | Lifecycle | The initial lifecycle state of a submitted booking record shall be `Pending`. | **TC-017** | High |
| **FR-018** | Approval Workflow | The system shall route submitted bookings to the authorized Station Approval Group using standard platform approvals anchored on the parent `sc_req_item`. | **TC-018** | High |
| **FR-019** | Approval State | When an authorized approver approves the request, the booking status shall transition from `Pending` to `Approved`. | **TC-019** | High |
| **FR-020** | Ticket Numbering | Following approval, the system shall generate a globally unique, sequential Ticket Number conforming to `TKT-YYYYMMDD-XXXXXX` using a concurrency-safe daily allocation method validated in the target instance before release. | **TC-020** | High |
| **FR-021** | QR Generation | Following approval, the system shall generate a QR ticket containing no PII and an unguessable verification token; the server verifies the token against a protected hash and authoritative ticket status. The secure-random source and QR encoder require target-instance validation. | **TC-021** | High |
| **FR-022** | Generated State | The booking status shall transition to `Generated` only after ticket number assignment and QR token generation are successfully verified and committed to the database. | **TC-022** | High |
| **FR-023** | Email Dispatch | Upon transitioning to `Generated`, the system shall send an automated HTML email notification to the passenger containing booking details and the digital QR ticket. | **TC-023** | High |
| **FR-024** | My Bookings | The Service Portal shall provide a "My Bookings" page allowing passengers to view only bookings whose `passenger` reference matches the authenticated user. | **TC-024** | High |
| **FR-025** | QR Display | In "My Bookings", passengers shall be able to click on any `Generated` ticket to view and expand the digital ticket card and scannable QR code. | **TC-025** | High |
| **FR-026** | Cancellation | Passengers shall be permitted to submit a cancellation request for their own bookings if the booking is in `Pending` or `Generated` status and the travel date is in the future. | **TC-026** | High |
| **FR-027** | QR Invalidation | When a booking transitions to `Cancelled`, the verification service shall reject the ticket by checking the authoritative booking status (`status != Generated`); the stored token hash shall remain unchanged for audit integrity. | **TC-027** | High |
| **FR-028** | Admin Access | Metro Administrators shall have full CRUD permissions across Station, Route, Fare Rule, and Ticket Type tables. | **TC-028** | High |
| **FR-029** | Commuter Privacy | End users shall be strictly prohibited by table and record ACLs from viewing or modifying bookings belonging to other passengers. | **TC-029** | High |
| **FR-030** | Fallback Pricing | For Single Journey and Return tickets, if an active route/distance is missing, or if any ticket type lacks an applicable active fare rule for the travel date, the system shall abort booking submission with a user-friendly error and log a diagnostic warning. Pass tickets do not require a distance-route lookup when their approved pricing policy is fixed-fare. | **TC-030** | High |

---

### 4. Non-Functional Requirements (NFR)

Each non-functional requirement is testable and mapped to a dedicated verification test case in [`11-test-plan-and-acceptance-criteria.md`](11-test-plan-and-acceptance-criteria.md).

| Req ID | Category | Metric / Specification | Verification Test Mapping | Target Phase |
| :--- | :--- | :--- | :---: | :---: |
| **NFR-001** | Security | Role-Based Access Control (RBAC) enforced via scoped ServiceNow ACLs (`x_mtts.admin`, `x_mtts.approver`, `x_mtts.user`). No table accessible without authentication. | **TC-NFR-01** | Phase 4 |
| **NFR-002** | Anti-Tampering | Server-side validation via Script Includes must recalculate all financial amounts independently. Client parameters for fares must never be committed directly. | **TC-NFR-02** | Phase 2 / Phase 4 |
| **NFR-003** | Data Integrity | Relational integrity enforced across Station references. Deleting a station referenced by active routes or bookings must be blocked by referential constraints. | **TC-NFR-03** | Phase 2 / Phase 4 |
| **NFR-004** | Performance | Dynamic fare calculation GlideAjax round-trip response time shall not exceed 1.5 seconds under standard network latency. | **TC-NFR-04** | Phase 3 / Phase 4 |
| **NFR-005** | Usability & UX | The Service Portal booking form shall adhere to responsive web standards (desktop, tablet, mobile viewports) with zero horizontal scrolling. | **TC-NFR-05** | Phase 3 / Phase 4 |
| **NFR-006** | Accessibility | Catalog variables and Service Portal widgets shall comply with WCAG 2.1 Level AA standards, including aria-labels, high contrast ratios, and keyboard navigation. | **TC-NFR-06** | Phase 3 / Phase 4 |
| **NFR-007** | Maintainability | All custom logic shall be housed within Scoped Script Includes and Flow Designer subflows, avoiding deprecated global business rules and hardcoded sys_ids. | **TC-NFR-07** | Phase 2 / Phase 4 |
| **NFR-008** | Error Handling | System errors (e.g., missing route, pricing timeout) shall present polite, actionable, non-technical alert banners to commuters while recording stack traces in `sys_log`. | **TC-NFR-08** | Phase 2 / Phase 4 |
| **NFR-009** | Concurrency | The system shall safely handle concurrent administrative updates to fare rules using platform optimistic concurrency locking without record corruption. | **TC-NFR-09** | Phase 2 / Phase 4 |
| **NFR-010** | Scalability | Route matrix lookup must utilize indexed foreign keys (`origin_station`, `destination_station`) to ensure constant $O(1)$ query time regardless of station volume. | **TC-NFR-10** | Phase 2 / Phase 4 |

---

### 5. Project Scope Boundary

#### 5.1 In Scope for Complete Project
- Metro Station management (CRUD, active flag, line metadata).
- Metro Route and distance matrix management (Origin, Destination, Distance).
- Centralized, configurable Fare Rules (base rate, minimum fare, return multiplier, fixed pass rates, validity dates).
- Ticket Type management (`Single Journey`, `Return`, `Pass`).
- Service Portal & Service Catalog booking interface with real-time dynamic fare calculation preview.
- Server-side authoritative validation and anti-tampering enforcement.
- Booking lifecycle workflow (`Pending` $\rightarrow$ `Approved` $\rightarrow$ `Generated` $\rightarrow$ `Cancelled`, with `Rejected` as proposed 5th status).
- Unique human-readable ticket number generation (`TKT-YYYYMMDD-XXXXXX`).
- Digital QR code ticket generation and verification token architecture.
- Multi-event automated HTML email notifications.
- Commuter self-service portal dashboard ("My Bookings") with ticket inspection and cancellation.
- Configurable cancellation policies, QR invalidation, and refund record calculation.
- Granular Scoped Access Control Lists (ACLs) and security hardening.
- Automated Test Framework (ATF) test suites and comprehensive project documentation.

#### 5.2 Explicitly Out of Scope for Initial Version
To maintain architectural focus and ensure flawless demonstration within the ServiceNow platform boundaries, the following integrations and systems are explicitly excluded from the baseline release:

1. **Real External Payment Gateways:** (e.g., Stripe, PayPal, Razorpay credit card processing). Fares are calculated and ledgered in ServiceNow, but external merchant banking API integration is excluded.
2. **Physical Metro Turnstile / Flap Gate Hardware:** No IoT or hardware gate integration. QR codes are designed for digital verification via mobile scanners/tablets or platform inspection.
3. **Physical Ticket Printing Terminals:** Thermal printer drivers and kiosk hardware integrations are omitted; delivery is 100% paperless digital.
4. **Live GPS Train Tracking & Telemetry:** Real-time train location tracking, delays, or schedule timetables are excluded.
5. **External Transit Authority APIs:** No real-time synchronization with third-party municipal railway APIs; master data is self-contained.
6. **Live Bank Refund Transfers:** Cancellations record audit-calculated refund amounts within ServiceNow, but no real-money banking wires are dispatched.
7. **Complex AI Route Optimization:** No multi-line graph pathfinding algorithms; journeys are governed by the administrative source-to-destination route matrix.

#### 5.3 Scope Control & Change Management Procedure
Any enhancement request exceeding the documented boundaries must be logged in the project change register, reviewed for platform impact, and deferred to a post-baseline release.
