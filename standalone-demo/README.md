# Metro Ticket Generating System (MTTS) — Standalone Web Demo

Interactive, responsive standalone demonstration of the **Metro Ticket Generating System in ServiceNow** (Application Scope: `x_mtts`).

This frontend application provides a complete visual and operational representation of the transit ticketing system, including Service Catalog booking, dynamic tariff calculation, multi-step approval workflows, optical QR code ticket generation, commuter booking history, and hardware turnstile validation.

---

## Important Notice on Demonstration Reality

> [!NOTE]
> **Simulated ServiceNow Backend Architecture:**  
> This standalone web application is a frontend demonstration simulating the verified application logic, tariffs, and workflows of the Metro Ticket Generating System (`x_mtts`).
>
> All backend database interactions (`x_mtts_booking_ticket`, `x_mtts_scan_event`), Business Rules (`BR_Booking_FinancialSnapshot`), Flow Designer approvals (`MetroBookingApprovalAndFulfillmentFlow`), and REST APIs (`/api/x_mtts/scanner/verify-ticket`) are executed in-browser using a client-side emulation engine and `localStorage`. **No live ServiceNow instance connection is required to interact with this demo.**

---

## Features

1. **Service Catalog Booking Form (`sc_cat_item`):**
   - Interactive origin and destination station selectors across Blue Line and Red Line.
   - Dynamic track distance calculation based on official route network matrix (`x_mtts_route`).
   - Tariff product selection:
     - **Single Journey:** $2.50 / km (Minimum fare: $10.00).
     - **Return Ticket:** Round-trip with 20% discount (1.80x multiplier).
     - **Daily Pass:** Unlimited all-day travel ($50.00 flat fare).
   - Passenger headcount selector (1 to 6 commuters).
   - Real-time tariff breakdown and tamper-protection snapshot preview.

2. **Flow Designer Workflow Simulation (`sys_hub_flow`):**
   - Live visual step-by-step modal showing:
     1. Service Catalog request creation (`sc_req_item`).
     2. Financial snapshotting guard (`BR_Booking_FinancialSnapshot`).
     3. Station Approver task review (`sysapproval_approver`).
     4. Cryptographic QR token minting (`MetroTicketGenerator.js`).
     5. Notification event queuing (`sysevent_register: x_mtts.ticket.generated`).

3. **Digital QR Boarding Pass (`widget_my_metro_bookings`):**
   - High-resolution optical QR code generated in real time.
   - Ticket Number (`TKT-YYYYMMDD-XXXXX`) and Booking Reference (`MTTS-YYYYMMDD-XXXXX`).
   - Security verification checksum and SHA-256 HMAC non-repudiation watermark.

4. **Commuter Dashboard ("My Metro Bookings"):**
   - Status tracking across 4 lifecycle states: `Pending Approval`, `Approved`, `Ticket Issued`, `Cancelled`.
   - Cancellation and refund simulation with cancellation reason capture and 80% refund calculation.

5. **Turnstile Scanner Terminal (`POST /api/x_mtts/scanner/verify-ticket`):**
   - Simulated turnstile gate barrier with visual open/hold animation.
   - Real-time HTTP response inspection (`HTTP 200 OPEN` vs `HTTP 403 / 401 HOLD`).
   - Append-only turnstile audit log ledger (`x_mtts_scan_event`) with correlation IDs, latency, and checksums.

6. **Architecture & Proof Explorer:**
   - Detailed mapping to the 7 custom tables, 12 Script Includes, and 268 passing automated test assertions in `sn_source/`.

---

## Local Development & Build Instructions

### Prerequisites
- Node.js v18+ (tested on Node v22.18)
- npm v9+

### Run Locally

```bash
# Navigate to the standalone-demo directory
cd standalone-demo

# Install dependencies (if not already installed)
npm install

# Start the Vite local development server
npm run dev
```

The application will be accessible at `http://localhost:3000`.

---

## Production Build Verification

To compile the standalone demo into production-ready static assets:

```bash
cd standalone-demo
npm run build
```

This compiles optimized HTML, CSS, and JS bundles into the `standalone-demo/dist/` directory.

---

## Deployment to Render (Static Site)

This directory is ready for zero-configuration static site hosting on [Render](https://render.com/):

| Setting | Value |
| :--- | :--- |
| **Service Type** | **Static Site** |
| **Repository** | `https://github.com/abhinav307/metro-ticket-generating-system.git` |
| **Branch** | `main` |
| **Root Directory** | `standalone-demo` |
| **Build Command** | `npm run build` |
| **Publish Directory** | `dist` |

### Render Blueprint (`render.yaml`) Example (Optional)

```yaml
services:
  - type: web
    name: mtts-metro-demo
    env: static
    rootDir: standalone-demo
    buildCommand: npm run build
    staticPublishPath: dist
```
