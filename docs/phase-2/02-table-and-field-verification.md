# Table Schema & Field Dictionary Verification
## Metro Ticket Generating System in ServiceNow

---

## 1. Overview & Verification Purpose

This document provides complete structural verification of all 6 custom tables implemented for the Metro Ticket Generating System in ServiceNow (MTTS). The tables have been materialized as scoped application XML schemas under `sn_source/schema/`, verified against the approved Phase 1 specification (`docs/phase-1/04-data-model-and-field-dictionary.md`).

All tables carry the scoped application prefix `x_mtts_`, preserve standard ServiceNow auditing fields (`sys_id`, `sys_created_on`, `sys_created_by`, `sys_updated_on`, `sys_updated_by`), and enforce appropriate data types, field lengths, unique indexes, and referential constraints.

---

## 2. Table Realization Inventory

| Table Name | Label | Extends | Scope Prefix | File Path | Role Access |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `x_mtts_station` | Metro Station | None | `x_mtts` | [`x_mtts_station.xml`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/schema/x_mtts_station.xml) | Admin (W), Public Read |
| `x_mtts_route` | Metro Route Segment | None | `x_mtts` | [`x_mtts_route.xml`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/schema/x_mtts_route.xml) | Admin (W), Public Read |
| `x_mtts_ticket_type` | Ticket Type Master | None | `x_mtts` | [`x_mtts_ticket_type.xml`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/schema/x_mtts_ticket_type.xml) | Admin (W), Public Read |
| `x_mtts_fare_rule` | Fare Rule Master | None | `x_mtts` | [`x_mtts_fare_rule.xml`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/schema/x_mtts_fare_rule.xml) | Admin (W), Read |
| `x_mtts_booking_ticket` | Booking and Ticket Record | None | `x_mtts` | [`x_mtts_booking_ticket.xml`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/schema/x_mtts_booking_ticket.xml) | Admin, Approver, Commuter (Owner) |
| `x_mtts_daily_sequence` | Daily Sequence Partition | None | `x_mtts` | [`x_mtts_daily_sequence.xml`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/schema/x_mtts_daily_sequence.xml) | System / Admin |

---

## 3. Field-by-Field Detailed Verification

### 3.1 `x_mtts_station` (Metro Station Master)

| Field Name | Type | Max Len | Mandatory | Unique | Default Value | Notes / Verification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `station_code` | string | 10 | True | **Yes** | — | Unique alphanumeric station code (e.g., `STN-01`) |
| `station_name` | string | 100 | True | No | — | Display name of metro station |
| `line_name` | choice | 40 | True | No | — | Metro line (Red, Blue, Green, Yellow, Violet) |
| `zone` | integer | — | False | No | 1 | Fare zone identifier (1 to 5) |
| `is_interchange`| boolean| — | False | No | false | Flag for interchange/transfer hub |
| `sequence_order`| integer| — | True | No | 0 | Display sequence along the line |
| `active` | boolean| — | True | No | true | Operational availability flag |

### 3.2 `x_mtts_route` (Metro Route & Track Segment Master)

| Field Name | Type | Max Len | Mandatory | Unique | Default Value | Notes / Verification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `route_code` | string | 20 | True | **Yes** | — | Unique route key (e.g., `RT-0102`) |
| `source_station` | reference | 32 | True | No | — | References `x_mtts_station` |
| `destination_station` | reference | 32 | True | No | — | References `x_mtts_station` |
| `distance_km` | decimal(8,2) | — | True | No | 0.00 | Measured track distance (must be > 0) |
| `travel_time_min` | integer | — | False | No | 0 | Estimated journey time in minutes |
| `active` | boolean | — | True | No | true | Operational state of the route |

*Integrity Constraint:* Unique composite index on `(source_station, destination_station)`. Validated by `BR_Route_Validation` preventing identical source and destination.

### 3.3 `x_mtts_ticket_type` (Ticket Type Master)

| Field Name | Type | Max Len | Mandatory | Unique | Default Value | Notes / Verification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `code` | string | 20 | True | **Yes** | — | Functional code (`SINGLE`, `RETURN`, `PASS`) |
| `name` | string | 80 | True | No | — | Descriptive name |
| `pricing_model` | choice | 30 | True | No | `DISTANCE_BASED` | Choices: `DISTANCE_BASED`, `FIXED_RATE` |
| `validity_hours`| integer | — | True | No | 4 | Validity duration window in hours |
| `fare_multiplier`| decimal(4,2)| — | True | No | 1.00 | Multiplier (Single = 1.0, Return = 1.80) |
| `fixed_fare` | decimal(10,2)| —| False| No | 0.00 | Applicable when pricing model is FIXED_RATE |
| `active` | boolean | — | True | No | true | Activation flag |

### 3.4 `x_mtts_fare_rule` (Fare Rule Engine Configuration)

| Field Name | Type | Max Len | Mandatory | Unique | Default Value | Notes / Verification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `rule_code` | string | 20 | True | **Yes** | — | Unique rule identifier (e.g., `FARE-DEFAULT`) |
| `name` | string | 100 | True | No | — | Rule display name |
| `base_fare` | decimal(10,2) | — | True | No | 10.00 | Fixed base fare component |
| `per_km_rate` | decimal(10,2) | — | True | No | 2.50 | Variable rate per kilometer |
| `minimum_fare` | decimal(10,2) | — | True | No | 10.00 | Authoritative price floor |
| `effective_from`| glide_date | — | True | No | — | Rule activation date |
| `effective_to` | glide_date | — | False| No | — | Rule expiration date (null = indefinite) |
| `active` | boolean | — | True | No | true | Operational state |

### 3.5 `x_mtts_booking_ticket` (Core Booking & Ticket Record)

| Field Name | Type | Max Len | Mandatory | Unique | Default Value | Notes / Verification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `booking_reference` | string | 30 | True | **Yes** | — | Format: `BKG-YYYYMMDD-XXXXXX` |
| `ticket_number` | string | 30 | False | **Yes** | — | Format: `TKT-YYYYMMDD-XXXXXX` (populated upon fulfillment) |
| `passenger` | reference | 32 | True | No | — | References `sys_user` (owner of booking) |
| `source_station` | reference | 32 | False | No | — | References `x_mtts_station` (optional for Pass) |
| `destination_station` | reference | 32 | False | No | — | References `x_mtts_station` (optional for Pass) |
| `ticket_type` | reference | 32 | True | No | — | References `x_mtts_ticket_type` |
| `fare_rule` | reference | 32 | True | No | — | References `x_mtts_fare_rule` (frozen at booking) |
| `travel_date` | glide_date | — | True | No | — | Date of planned journey |
| `passenger_count` | integer | — | True | No | 1 | Headcount (1 to 6) |
| `calculated_distance` | decimal(8,2) | — | True | No | 0.00 | Frozen snapshot of route distance |
| `calculated_unit_fare` | decimal(10,2) | — | True | No | 0.00 | Frozen snapshot of unit fare |
| `total_fare` | decimal(10,2) | — | True | No | 0.00 | Frozen snapshot: `unit_fare * passenger_count` |
| `status` | choice | 20 | True | No | `Pending` | `Pending`, `Approved`, `Generated`, `Cancelled` |
| `request_item` | reference | 32 | False | No | — | References `sc_req_item` (parent catalog item) |
| `qr_token_hash` | string | 64 | False | No | — | SHA-256 hex digest of random bearer token |
| `qr_payload` | string | 1000 | False | No | — | Sanitized JSON metadata for offline scanning |
| `qr_attachment` | reference | 32 | False | No | — | References `sys_attachment` |
| `generation_time`| glide_date_time | — | False | No | — | Timestamp of ticket generation |
| `cancellation_time`| glide_date_time | — | False | No | — | Timestamp of booking cancellation |
| `refund_amount` | decimal(10,2) | — | False | No | 0.00 | Calculated refund amount |

### 3.6 `x_mtts_daily_sequence` (Technical Daily Sequence Allocation Table)

| Field Name | Type | Max Len | Mandatory | Unique | Default Value | Notes / Verification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `partition_date` | string | 8 | True | **Yes** | — | Format: `YYYYMMDD` (Daily sequence partition key) |
| `current_sequence` | integer | — | True | No | 0 | Last allocated sequence integer |
| `record_version` | integer | — | True | No | 1 | Optimistic concurrency control lock counter |

---

## 4. Key Architectural & Data Integrity Features

1. **Anti-Tampering Immutability:**
   Financial fields (`calculated_distance`, `calculated_unit_fare`, `total_fare`) are snapshot immutably at booking creation. Business Rule `BR_Booking_FinancialSnapshot` strictly prohibits modification of these values after insert.
2. **Authoritative Owner Identification:**
   Passenger data security uses the native `passenger` reference field (`sys_user`). All security policies and ACL scripts enforce `current.passenger == gs.getUserID()`.
3. **Optimistic Locking via Partition Table:**
   Ticket numbers are partitioned by day (`YYYYMMDD`). The `x_mtts_daily_sequence` record isolates daily concurrency counters, preventing cross-day locking contention and table-level locks.
4. **Token Security Separation:**
   The unguessable 128-bit bearer token generated during fulfillment is **never** written in plaintext to the database. Only its one-way SHA-256 digest (64 characters) is stored in `qr_token_hash`.
