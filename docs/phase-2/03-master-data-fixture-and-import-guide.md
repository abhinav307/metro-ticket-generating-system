# Master Data Fixture & Import Guide
## Metro Ticket Generating System in ServiceNow

---

## 1. Overview & Data Scope

To facilitate rapid development, testing, and automated demonstration of the Metro Ticket Generating System in ServiceNow (MTTS), a complete set of synthetic, realistic master data fixtures has been developed and packaged under `sn_source/data/`.

These fixtures provide a fully interconnected metro transit network, realistic route distances, pricing rules, ticket categories, and edge-case testing records (including inactive stations, inactive routes, and multi-line interchange hubs).

---

## 2. Master Data Fixture Catalog

### 2.1 Metro Stations (`stations.csv`)
Location: [`sn_source/data/stations.csv`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/data/stations.csv)

The network model comprises 10 stations distributed across two transit lines (Red Line and Blue Line) with an interchange hub at Central Square:
- **Red Line (North-South):**
  - `STN-01`: North Terminal (Zone 1)
  - `STN-02`: University Park (Zone 1)
  - `STN-03`: Central Square (Zone 1) — *Interchange Hub*
  - `STN-04`: Financial District (Zone 2)
  - `STN-05`: South Market (Zone 2)
  - `STN-06`: Airport Express (Zone 3)
- **Blue Line (East-West):**
  - `STN-07`: West End (Zone 2)
  - `STN-08`: Tech City (Zone 2)
  - `STN-09`: Harbour Point (Zone 2)
  - `STN-10`: Eastern Extension (Zone 3) — *Marked inactive (`active=false`) for edge-case testing*

### 2.2 Metro Routes (`routes.csv`)
Location: [`sn_source/data/routes.csv`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/data/routes.csv)

The route table defines 17 directed track segments, supporting point-to-point journey lookups:
- **Red Line Directed Pairs:**
  - `RT-0102` (STN-01 -> STN-02): 3.50 km, 6 min
  - `RT-0201` (STN-02 -> STN-01): 3.50 km, 6 min
  - `RT-0103` (STN-01 -> STN-03): 8.50 km, 15 min
  - `RT-0301` (STN-03 -> STN-01): 8.50 km, 15 min
  - `RT-0104` (STN-01 -> STN-04): 14.20 km — *Marked inactive (`active=false`) for TC-030 route disruption testing*
  - `RT-0401` (STN-04 -> STN-01): 14.20 km, 24 min (Active reverse path)
  - `RT-0304` (STN-03 -> STN-04): 5.70 km, 10 min
  - `RT-0403` (STN-04 -> STN-03): 5.70 km, 10 min
  - `RT-0405` (STN-04 -> STN-05): 4.10 km, 7 min
  - `RT-0504` (STN-05 -> STN-04): 4.10 km, 7 min
  - `RT-0506` (STN-05 -> STN-06): 12.80 km, 20 min
  - `RT-0605` (STN-06 -> STN-05): 12.80 km, 20 min
  - `RT-0106` (STN-01 -> STN-06): 31.10 km, 50 min (Full corridor journey)
- **Blue Line & Interchange Routes:**
  - `RT-0703` (STN-07 -> STN-03): 6.40 km, 12 min
  - `RT-0307` (STN-03 -> STN-07): 6.40 km, 12 min
  - `RT-0308` (STN-03 -> STN-08): 7.20 km, 14 min
  - `RT-0803` (STN-08 -> STN-03): 7.20 km, 14 min

### 2.3 Ticket Types (`ticket_types.csv`)
Location: [`sn_source/data/ticket_types.csv`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/data/ticket_types.csv)

| Code | Name | Pricing Model | Multiplier | Fixed Fare | Validity Hours | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `SINGLE` | Single Journey Ticket | `DISTANCE_BASED` | 1.00 | $0.00 | 4 hours | One-way distance-based journey |
| `RETURN` | Return Journey Ticket | `DISTANCE_BASED` | 1.80 | $0.00 | 24 hours | Round-trip with 10% discount on return leg |
| `PASS` | All-Day Metro Pass | `FIXED_RATE` | 1.00 | $50.00 | 24 hours | Unlimited day pass across all lines |

### 2.4 Fare Rules (`fare_rules.csv`)
Location: [`sn_source/data/fare_rules.csv`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/data/fare_rules.csv)

| Rule Code | Name | Base Fare | Per Km Rate | Min Fare Floor | Effective Dates | Active |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `FARE-DEFAULT` | Standard Operational Tariff | $10.00 | $2.50 / km | $10.00 | 2026-01-01 to Present | Yes |
| `FARE-OFFPEAK` | Off-Peak Special Tariff | $8.00 | $2.00 / km | $8.00 | 2026-01-01 to Present | Yes |
| `FARE-HOLIDAY` | Holiday Promotional Rate | $5.00 | $1.80 / km | $8.00 | 2026-12-20 to 2027-01-05| Yes |
| `FARE-LEGACY` | 2025 Retired Tariff | $8.00 | $2.00 / km | $8.00 | 2025-01-01 to 2025-12-31| No |

---

## 3. Automated Seeder Script (`MetroDataSeeder.js`)

Location: [`sn_source/data/MetroDataSeeder.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/data/MetroDataSeeder.js)

### 3.1 Idempotency & Coalescing Strategy
The seeder is built to be run repeatedly without duplicating records or corrupting existing system IDs. It coalesces on natural unique business keys:
- `x_mtts_station`: Coalesces on `station_code`
- `x_mtts_route`: Coalesces on `route_code` (and dynamically resolves foreign keys for `source_station` and `destination_station` by `station_code`)
- `x_mtts_ticket_type`: Coalesces on `code`
- `x_mtts_fare_rule`: Coalesces on `rule_code`

If a record exists, `MetroDataSeeder` updates the mutable operational fields; if it does not exist, it inserts a new record.

---

## 4. ServiceNow Instance Import Instructions

When deploying into an authorized ServiceNow instance, administrators can load the master data through either of two supported methods:

### Method A: Execute `MetroDataSeeder` via Background Scripts (Recommended)
1. Elevate role to `security_admin` or ensure `admin` permissions in the application scope `x_mtts`.
2. Navigate to **System Definition > Scripts - Background**.
3. Select scope: **Metro Ticket Generating System** (`x_mtts`).
4. Paste the contents of [`MetroDataSeeder.js`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/data/MetroDataSeeder.js).
5. Click **Run script**.
6. Inspect output: The console will output the count of inserted and updated records for all 4 tables.

### Method B: Easy Import / Transform Maps
1. Navigate to **System Import Sets > Load Data**.
2. Create Import Set Table for each target table.
3. Upload the corresponding CSV file from `sn_source/data/`.
4. Configure Transform Map:
   - For `x_mtts_station`: Map `station_code` as coalesce field.
   - For `x_mtts_ticket_type`: Map `code` as coalesce field.
   - For `x_mtts_fare_rule`: Map `rule_code` as coalesce field.
   - For `x_mtts_route`: Map `route_code` as coalesce field, and configure Reference Field Values to resolve `source_station` and `destination_station` using `station_code`.
5. Run Transform.
