# Metro Ticket Generating System (MTTS) — Dynamic Full-Stack Web Application

Interactive full-stack web application demonstrating the architecture and transit operations of the **Metro Ticket Generating System in ServiceNow** (Application Scope: `x_mtts`).

This application combines a responsive React frontend with a high-performance **Node.js/Express REST API** backend and **PostgreSQL** persistent storage. It faithfully demonstrates Service Catalog booking, authoritative server-side tariff calculations, multi-step simulated Flow Designer approvals, HMAC-SHA256 token minting, QR code ticket rendering, commuter booking management, and hardware turnstile verification.

---

## Technical Architecture & Demonstration Reality

### What Is Genuine (Full-Stack Production Stack)
- **Node.js & Express REST Backend:** Real server handling routing, input validation, authoritative fare computation, and cryptographic hashing.
- **PostgreSQL Persistent Storage:** Relational database schema with 6 tables (`stations`, `ticket_types`, `routes`, `fare_rules`, `bookings`, `scan_events`).
- **Dual-Mode Database Adapter:**
  - **Render / Cloud Production:** Seamlessly connects to managed PostgreSQL via `DATABASE_URL` (with SSL support).
  - **Local Development / Testing:** Automatically runs an embedded PostgreSQL engine (`pg-mem`) when `DATABASE_URL` is unset, requiring zero external database installations.
- **Visitor Session Isolation:** Each visitor is assigned an isolated session token via the `X-Demo-Session-ID` header. Demonstrators can independently create, cancel, and scan tickets without cross-visitor data leakage.
- **REST API Endpoints:** Complete API suite with a dedicated health-check endpoint at `/api/health`.

### What Is Simulated (Emulated ServiceNow Workflows)
- **ServiceNow Platform Metadata:** No live ServiceNow development instance is connected. The GlideRecord persistence layer, Service Catalog (`sc_cat_item`), Flow Designer executions (`x_mtts.MetroBookingApprovalAndFulfillmentFlow`), and turnstile hardware terminals are emulated in code using the verified logic and rules developed in `sn_source/`.
- **Payment Gateway:** Payments are simulated as instant `PAID` authorizations with mock financial snapshotting (`BR_Booking_FinancialSnapshot`). No real credit cards or bank accounts are debited.

---

## REST API Specification

| Method | Endpoint | Description | Scope / Mirror |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Service uptime, system diagnostics, database connection status | Diagnostic |
| `GET` | `/api/stations` | List active transit stations with line names and zones | `x_mtts_station` |
| `GET` | `/api/routes` | Active route matrix with official track distances | `x_mtts_route` |
| `POST` | `/api/fare/calculate` | Authoritative server-side tariff & discount calculation | `MetroFareCalculator` |
| `GET` | `/api/bookings` | Retrieve bookings for current visitor session (`X-Demo-Session-ID`) | `x_mtts_booking_ticket` |
| `POST` | `/api/bookings` | Authoritatively mint booking, HMAC token, and QR payload | Flow Designer Step 4 |
| `POST` | `/api/bookings/:id/cancel` | Cancel booking and compute 80% refund policy | `MetroRefundCalculator` |
| `POST` | `/api/scanner/verify` | Turnstile REST API ticket validation (returns 200, 401, 403, 404) | `/api/x_mtts/scanner/verify-ticket` |
| `GET` | `/api/scanner/events` | Append-only turnstile audit log ledger | `x_mtts_scan_event` |

---

## Database Schema (PostgreSQL DDL)

The database schema is defined in `server/db/schema.sql` and consists of 6 relational tables:

1. `stations`: Transit station codes, names, line colors, zones, sequence orders.
2. `ticket_types`: Products (`SINGLE`, `RETURN`, `PASS`), pricing models, validity windows.
3. `routes`: Directed route track distances (km) and line affiliations.
4. `fare_rules`: Tariffs ($2.50/km, $10.00 minimum fare, 1.80x return multiplier).
5. `bookings`: Persistent commuter transactions, session IDs, fare snapshots, HMAC hashes, QR tokens.
6. `scan_events`: Turnstile gate audit logs, correlation IDs, response latencies, cryptographic checksums.

---

## Local Development & Setup

### Prerequisites
- Node.js v18+ (tested on Node v22.18)
- npm v9+

### Quick Start (Zero External Dependencies)
Because the application includes an embedded PostgreSQL engine (`pg-mem`), you do not need to install or configure a local PostgreSQL database server.

```bash
# 1. Navigate to standalone-demo directory
cd standalone-demo

# 2. Install dependencies
npm install

# 3. Build frontend assets
npm run build

# 4. Start the full-stack server
npm start
```

The application will start on `http://localhost:5000` serving both the REST API and the compiled frontend single-page application.

### Concurrent Frontend Development (Vite Dev Server)
If you want hot-module replacement for frontend edits:
```bash
# Terminal 1: Run Express API server
npm run server

# Terminal 2: Run Vite dev server with API proxy
npm run dev
```

---

## Automated Test Verification

A dedicated integration test suite verifies the full-stack API and embedded database:

```bash
cd standalone-demo
npm run test:backend
```

**Test Coverage (17 Tests across 7 Test Suites):**
- System health and database connectivity (`GET /api/health`).
- Master station and route retrieval (`GET /api/stations`, `GET /api/routes`).
- Single journey distance-based tariffs and minimum fare threshold ($10.00).
- Round-trip 20% return discount (1.80 multiplier).
- Flat tariff validation for Daily Pass ($50.00).
- Session isolation between distinct visitors (`X-Demo-Session-ID`).
- Turnstile gate unlocking for valid tickets (`200 OPEN`).
- Turnstile gate locking for missing/unauthorized tickets (`401 HOLD`).
- Turnstile gate locking for unknown tickets (`404 HOLD`).
- Cancellation with 80% refund calculation and boarding revocation.
- Turnstile gate locking for cancelled tickets (`403 HOLD`).
- Append-only turnstile audit log ledger persistence.

---

## Deployment to Render (Web Service + PostgreSQL)

This application is configured for deployment as a **Render Web Service** with an optional **Render Managed PostgreSQL** database.

### 1. Web Service Configuration

| Setting | Value |
| :--- | :--- |
| **Service Type** | **Web Service** |
| **Environment** | `Node` |
| **Repository** | `https://github.com/abhinav307/metro-ticket-generating-system.git` |
| **Branch** | `main` |
| **Root Directory** | `standalone-demo` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `node server/index.js` |
| **Health Check Path** | `/api/health` |

### 2. Environment Variables

Configure these in the Render Web Service Settings:

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production optimizations and security |
| `PORT` | `10000` | (Render injects this automatically) |
| `DATABASE_URL` | `postgresql://...` | Connection string from Render PostgreSQL instance (if linked) |
| `CORS_ORIGIN` | `*` | Or specify your custom domain |

> [!TIP]
> **No Database Provisioned? No Problem!**  
> If `DATABASE_URL` is omitted, the server automatically defaults to the embedded PostgreSQL engine (`pg-mem`). For persistent data across service redeployments, link a Render PostgreSQL database.

### 3. Render Blueprint (`render.yaml`)

```yaml
services:
  - type: web
    name: mtts-metro-fullstack
    env: node
    rootDir: standalone-demo
    buildCommand: npm install && npm run build
    startCommand: node server/index.js
    healthCheckPath: /api/health
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: mtts-postgres
          property: connectionString

databases:
  - name: mtts-postgres
    databaseName: mtts_db
    user: mtts_user
    plan: free
```

---

## Project Structure

```
standalone-demo/
├── .env.example                # Template environment variables
├── package.json                # Full-stack dependencies & npm scripts
├── vite.config.js              # Vite frontend bundler with /api proxy
├── README.md                   # Full-stack architecture & deployment guide
├── server/                     # Node.js / Express Backend
│   ├── config.js               # Environment config (PORT, DATABASE_URL)
│   ├── index.js                # Express app entry & static file server
│   ├── db/
│   │   ├── index.js            # Dual-mode PostgreSQL engine (pg & pg-mem)
│   │   ├── schema.sql          # 6-table relational schema DDL
│   │   ├── seed.js             # Master transit data & sample seedings
│   │   └── migrate.js          # Standalone migration script
│   ├── middleware/
│   │   ├── session.js          # Demo session isolation (X-Demo-Session-ID)
│   │   └── errorHandler.js     # Standardized JSON error response
│   ├── routes/
│   │   ├── health.js           # GET /api/health
│   │   ├── stations.js         # GET /api/stations
│   │   ├── routes.js           # GET /api/routes
│   │   ├── fare.js             # POST /api/fare/calculate
│   │   ├── bookings.js         # GET /api/bookings, POST /api/bookings, /:id/cancel
│   │   └── scanner.js          # POST /api/scanner/verify, GET /api/scanner/events
│   └── test/
│       └── api.test.js         # 17-test backend integration suite
└── src/                        # React Frontend
    ├── components/
    │   ├── Header.jsx          # Top banner, status indicator & tab nav
    │   ├── BookingForm.jsx     # Station selectors & catalog submission
    │   ├── BookingsList.jsx    # Visitor bookings & cancellation modal
    │   ├── TurnstileScanner.jsx# Turnstile hardware validation terminal
    │   ├── ArchitectureView.jsx# ServiceNow x_mtts & Full-Stack architecture
    │   ├── TicketModal.jsx     # High-resolution QR ticket pass
    │   └── WorkflowModal.jsx   # 5-step Flow Designer visual journey
    └── services/
        ├── api.js              # REST client with X-Demo-Session-ID headers
        ├── fareEngine.js       # Client-side instant preview calculator
        └── workflowSimulator.js# Flow Designer visual journey engine
```
