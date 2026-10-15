# Metro Ticket Generating System (MTTS) — Dynamic Full-Stack Web Application (MongoDB Atlas Edition)

Interactive full-stack web application demonstrating the architecture and transit operations of the **Metro Ticket Generating System in ServiceNow** (Application Scope: `x_mtts`).

This application combines a responsive React frontend with a high-performance **Node.js/Express REST API** backend and **MongoDB Atlas** persistent document storage using the official MongoDB Node.js driver (`mongodb`). It faithfully demonstrates Service Catalog booking, authoritative server-side tariff calculations, multi-step simulated Flow Designer approvals, HMAC-SHA256 token minting, optical QR code ticket rendering, commuter booking history, and hardware turnstile validation.

---

## Technical Architecture & Demonstration Reality

### What Is Genuine (Full-Stack Production Stack)
- **Node.js & Express REST Backend:** Real server handling routing, input validation, authoritative fare computation, and cryptographic hashing.
- **Official MongoDB Driver (`mongodb`):** Production-grade document persistence layer using MongoDB collections, unique indexes, projection, and atomic operators.
- **Dual-Mode MongoDB Connection Adapter:**
  - **MongoDB Atlas / Cloud Production:** Automatically connects to your MongoDB Atlas cluster when `MONGODB_URI` is provided (e.g., in Render secret environment variables).
  - **Local Development / Testing (In-Memory Engine):** When `MONGODB_URI` is unset or blank, the server automatically starts an embedded in-memory MongoDB mock engine. Developers and automated test suites run instantly with zero external database dependencies.
- **Visitor Session Isolation:** Each visitor is assigned an isolated session token via the `X-Demo-Session-ID` header. Demonstrators can independently create, cancel, and scan tickets without cross-visitor data leakage.
- **REST API Endpoints:** Complete API suite with a dedicated health-check endpoint at `/api/health`.

### Important Security & Authentication Notice
> [!IMPORTANT]
> **Demo Session Isolation vs. Enterprise Authentication:**  
> The `X-Demo-Session-ID` mechanism isolates demo records between distinct browser sessions using a client-asserted token stored in `localStorage`. While this effectively prevents cross-visitor data leakage in a public demonstration environment, **it is not an enterprise authentication or authorization system**. For a real production deployment, authentication must be enforced through an identity provider such as ServiceNow OAuth 2.0 PKCE, SAML 2.0 SSO, or mutual TLS (mTLS).

### What Is Simulated (Emulated ServiceNow Workflows)
- **ServiceNow Platform Metadata:** No live ServiceNow development instance is connected. The GlideRecord persistence layer, Service Catalog (`sc_cat_item`), Flow Designer executions (`x_mtts.MetroBookingApprovalAndFulfillmentFlow`), and turnstile hardware terminals are emulated in code using the verified business logic developed in `sn_source/`.
- **Payment Processing:** Payments are simulated as instant `PAID` authorizations with mock financial snapshotting (`BR_Booking_FinancialSnapshot`). No real credit cards or bank accounts are debited.

---

## MongoDB Collections Schema

The database model is organized into 6 document collections:

1. **`stations` (`x_mtts_station`):**
   - Documents: Transit station codes (`STN-01` to `STN-09`), station names, line colors, zones, sequence orders.
   - Unique Index: `{ code: 1 }` (unique constraint).
2. **`ticket_types` (`x_mtts_ticket_type`):**
   - Documents: Fare products (`SINGLE`, `RETURN`, `PASS`), pricing models, validity windows.
   - Unique Index: `{ code: 1 }` (unique constraint).
3. **`routes` (`x_mtts_route`):**
   - Documents: Directed route track distances (km), station codes, station names, and line affiliations.
   - Unique Index: `{ id: 1 }` (unique constraint), `{ origin_station_code: 1, destination_station_code: 1 }`.
4. **`fare_rules` (`x_mtts_fare_rule`):**
   - Documents: Tariffs ($2.50/km, $10.00 minimum fare threshold, 1.80x return discount multiplier).
   - Unique Index: `{ rule_id: 1 }` (unique constraint).
5. **`bookings` (`x_mtts_booking_ticket`):**
   - Documents: Persistent commuter transactions, session IDs, fare snapshots, HMAC-SHA256 token hashes, QR payloads.
   - Unique Indexes: `{ id: 1 }`, `{ booking_reference: 1 }`, `{ ticket_number: 1 }`.
   - Index: `{ session_id: 1, created_at: -1 }`.
6. **`scan_events` (`x_mtts_scan_event`):**
   - Documents: Append-only turnstile gate audit logs, correlation IDs, response latencies, cryptographic checksums.
   - Unique Index: `{ id: 1 }`.
   - Indexes: `{ ticket_number: 1 }`, `{ session_id: 1 }`, `{ scan_timestamp: -1 }`.

---

## REST API Specification

| Method | Endpoint | Description | Scope / Mirror |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Service uptime, system diagnostics, MongoDB connection status | Diagnostic |
| `GET` | `/api/stations` | List active transit stations with line names and zones | `x_mtts_station` |
| `GET` | `/api/routes` | Active route matrix with official track distances | `x_mtts_route` |
| `POST` | `/api/fare/calculate` | Authoritative server-side tariff & discount calculation | `MetroFareCalculator` |
| `GET` | `/api/bookings` | Retrieve bookings for current visitor session (`X-Demo-Session-ID`) | `x_mtts_booking_ticket` |
| `POST` | `/api/bookings` | Authoritatively mint booking, HMAC token, and QR payload in MongoDB | Flow Designer Step 4 |
| `POST` | `/api/bookings/:id/cancel` | Cancel booking and compute 80% refund policy | `MetroRefundCalculator` |
| `POST` | `/api/scanner/verify` | Turnstile REST API ticket validation (returns 200, 401, 403, 404) | `/api/x_mtts/scanner/verify-ticket` |
| `GET` | `/api/scanner/events` | Append-only turnstile audit log ledger in MongoDB | `x_mtts_scan_event` |

---

## Local Development & Setup

### Prerequisites
- Node.js v18+ (tested on Node v22.18)
- npm v9+

### Quick Start (Zero External Dependencies)
Because the application includes an embedded in-memory MongoDB engine, you do not need a running MongoDB daemon or Atlas cluster to develop or test locally.

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

### Connecting to a Real MongoDB Atlas Cluster
To connect to your MongoDB Atlas cluster locally, create a `.env` file (or set environment variables):

```bash
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=mtts_transit_db
```

Then start the server:
```bash
npm start
```

---

## Automated Test Verification

A dedicated integration test suite verifies the full-stack MongoDB API and collection operations:

```bash
cd standalone-demo
npm run test:backend
```

**Test Coverage (20 Tests across 8 Test Suites):**
- System health and MongoDB database connectivity (`GET /api/health`).
- Master station and route retrieval from MongoDB collections (`GET /api/stations`, `GET /api/routes`).
- Single journey distance-based tariffs and minimum fare threshold ($10.00).
- Round-trip 20% return discount (1.80 multiplier).
- Flat tariff validation for Daily Pass ($50.00).
- Session isolation between distinct visitors (`X-Demo-Session-ID`).
- Unique index constraints enforcement in MongoDB (`booking_reference`, `ticket_number`, `code`).
- Turnstile gate unlocking for valid tickets (`200 OPEN`) and atomic `$inc` on `scans_count`.
- Turnstile gate locking for missing/unauthorized tickets (`401 HOLD`).
- Turnstile gate locking for unknown tickets (`404 HOLD`).
- Cancellation with 80% refund calculation and document `$set` status update.
- Turnstile gate locking for cancelled tickets (`403 HOLD`).
- Append-only turnstile audit log persistence in `scan_events` collection.

---

## Deployment to Render (Web Service + MongoDB Atlas)

This application is configured for deployment as a **Render Web Service** connected to **MongoDB Atlas**.

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

Configure these in the Render Web Service Settings under **Environment**:

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production optimizations and security |
| `PORT` | `10000` | (Render injects this automatically) |
| `MONGODB_URI` | `mongodb+srv://...` | **Secret:** Connection string from your MongoDB Atlas database deployment |
| `MONGODB_DB_NAME` | `mtts_transit_db` | Target MongoDB database name |
| `CORS_ORIGIN` | `*` | Or specify your custom domain |

### 3. Render Blueprint (`render.yaml`)

```yaml
services:
  - type: web
    name: mtts-metro-fullstack
    env: node
    plan: free
    rootDir: standalone-demo
    buildCommand: npm install && npm run build
    startCommand: node server/index.js
    healthCheckPath: /api/health
    envVars:
      - key: NODE_ENV
        value: production
      - key: MONGODB_URI
        sync: false
      - key: MONGODB_DB_NAME
        value: mtts_transit_db
      - key: CORS_ORIGIN
        value: "*"
```

---

## Project Structure

```
standalone-demo/
├── .env.example                # Template environment variables (MONGODB_URI)
├── package.json                # Dependencies (mongodb, express, react) & scripts
├── render.yaml                 # Render Web Service blueprint (with MONGODB_URI secret)
├── vite.config.js              # Vite frontend bundler with /api proxy
├── README.md                   # Full-stack MongoDB Atlas architecture & deployment guide
├── server/                     # Node.js / Express Backend
│   ├── config.js               # Environment config (MONGODB_URI, MONGODB_DB_NAME)
│   ├── index.js                # Express app entry & static file server
│   ├── db/
│   │   ├── index.js            # MongoDB connection manager (Atlas & in-memory)
│   │   ├── memoryMongo.js      # In-memory MongoDB mock engine
│   │   ├── schema.js           # 6 collections & unique index specifications
│   │   ├── seed.js             # Master transit data & sample seedings in MongoDB
│   │   └── migrate.js          # Standalone MongoDB migration script
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
│       └── api.test.js         # 20-test backend integration suite
└── src/                        # React Frontend
    ├── components/
    │   ├── Header.jsx          # Top banner, status indicator & tab nav
    │   ├── BookingForm.jsx     # Station selectors & catalog submission
    │   ├── BookingsList.jsx    # Visitor bookings & cancellation modal
    │   ├── TurnstileScanner.jsx# Turnstile hardware validation terminal
    │   ├── ArchitectureView.jsx# ServiceNow x_mtts & MongoDB architecture
    │   ├── TicketModal.jsx     # High-resolution QR ticket pass
    │   └── WorkflowModal.jsx   # 5-step Flow Designer visual journey
    └── services/
        ├── api.js              # REST client with X-Demo-Session-ID headers
        ├── fareEngine.js       # Client-side instant preview calculator
        └── workflowSimulator.js# Flow Designer visual journey engine
```
