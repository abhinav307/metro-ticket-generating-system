-- ==============================================================================
-- Metro Ticket Generating System (MTTS) — PostgreSQL Database Schema
-- Standalone Demo Server-Side Persistent Storage
-- ==============================================================================

-- 1. Stations Master Table (Mirrors x_mtts_station)
CREATE TABLE IF NOT EXISTS stations (
    code VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    line_name VARCHAR(50) NOT NULL,
    zone VARCHAR(50) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#0284c7',
    seq_order INT NOT NULL,
    is_transfer BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2. Ticket Types Table (Mirrors x_mtts_ticket_type)
CREATE TABLE IF NOT EXISTS ticket_types (
    code VARCHAR(20) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    pricing_model VARCHAR(30) NOT NULL,
    validity_hours INT NOT NULL DEFAULT 4,
    multiplier NUMERIC(4,2) DEFAULT 1.0,
    fixed_fare NUMERIC(6,2),
    description TEXT,
    badge VARCHAR(50),
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 3. Route Network Matrix (Mirrors x_mtts_route)
CREATE TABLE IF NOT EXISTS routes (
    id VARCHAR(30) PRIMARY KEY,
    origin_station_code VARCHAR(20) NOT NULL REFERENCES stations(code),
    destination_station_code VARCHAR(20) NOT NULL REFERENCES stations(code),
    distance_km NUMERIC(6,2) NOT NULL,
    line_name VARCHAR(50) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 4. Fare Rules Schedule (Mirrors x_mtts_fare_rule)
CREATE TABLE IF NOT EXISTS fare_rules (
    rule_id VARCHAR(30) PRIMARY KEY,
    ticket_type_code VARCHAR(20) NOT NULL REFERENCES ticket_types(code),
    rate_per_km NUMERIC(6,2) NOT NULL DEFAULT 2.50,
    minimum_fare NUMERIC(6,2) NOT NULL DEFAULT 10.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 5. Bookings and Digital Tickets (Mirrors x_mtts_booking_ticket)
CREATE TABLE IF NOT EXISTS bookings (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    booking_reference VARCHAR(50) UNIQUE NOT NULL,
    ticket_number VARCHAR(50),
    commuter_name VARCHAR(100) NOT NULL,
    commuter_email VARCHAR(150) NOT NULL,
    source_station_code VARCHAR(20) NOT NULL REFERENCES stations(code),
    destination_station_code VARCHAR(20) NOT NULL REFERENCES stations(code),
    travel_date DATE NOT NULL,
    ticket_type_code VARCHAR(20) NOT NULL REFERENCES ticket_types(code),
    passenger_count INT NOT NULL DEFAULT 1,
    distance_km NUMERIC(6,2) NOT NULL,
    unit_fare NUMERIC(8,2) NOT NULL,
    total_fare NUMERIC(8,2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Ticket Issued',
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PAID',
    qr_token_hash VARCHAR(128),
    qr_payload TEXT,
    scans_count INT NOT NULL DEFAULT 0,
    last_scanned TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    refund_amount NUMERIC(8,2) DEFAULT 0.00,
    refund_status VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for session-isolated querying
CREATE INDEX IF NOT EXISTS idx_bookings_session_id ON bookings(session_id);
CREATE INDEX IF NOT EXISTS idx_bookings_ticket_number ON bookings(ticket_number);

-- 6. Turnstile Verification Audit Events (Mirrors x_mtts_scan_event)
CREATE TABLE IF NOT EXISTS scan_events (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64),
    correlation_id VARCHAR(64) NOT NULL,
    ticket_number VARCHAR(50) NOT NULL,
    gate_id VARCHAR(50) NOT NULL,
    station_code VARCHAR(20) NOT NULL REFERENCES stations(code),
    scan_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    outcome VARCHAR(50) NOT NULL,
    gate_status VARCHAR(20) NOT NULL,
    http_code INT NOT NULL,
    response_time_ms INT NOT NULL,
    message TEXT,
    checksum VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scan_events_session_id ON scan_events(session_id);
CREATE INDEX IF NOT EXISTS idx_scan_events_timestamp ON scan_events(scan_timestamp DESC);
