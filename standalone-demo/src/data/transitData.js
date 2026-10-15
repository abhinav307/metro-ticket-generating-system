// Transit Master Data — Canonical MTTS Dataset (Scope: x_mtts)
// Mirrors x_mtts_station, x_mtts_route, x_mtts_ticket_type, x_mtts_fare_rule

export const STATIONS = [
  { code: 'STN-01', name: 'Central Terminus', line: 'Blue Line', zone: 'Zone 1', color: '#0284c7', order: 1 },
  { code: 'STN-02', name: 'Market Square', line: 'Blue Line', zone: 'Zone 1', color: '#0284c7', order: 2 },
  { code: 'STN-03', name: 'Tech Park North', line: 'Blue Line', zone: 'Zone 2', color: '#0284c7', order: 3 },
  { code: 'STN-04', name: 'Financial District', line: 'Blue Line', zone: 'Zone 2', color: '#0284c7', order: 4 },
  { code: 'STN-05', name: 'Airport Junction', line: 'Blue Line', zone: 'Zone 3', color: '#0284c7', order: 5 },
  { code: 'STN-06', name: 'West University', line: 'Red Line', zone: 'Zone 1', color: '#e11d48', order: 1 },
  { code: 'STN-07', name: 'Civic Center', line: 'Red Line', zone: 'Zone 1', color: '#e11d48', order: 2 },
  { code: 'STN-08', name: 'Grand Interchange', line: 'Red Line', zone: 'Zone 2', color: '#e11d48', order: 3, transfer: true },
  { code: 'STN-09', name: 'Harbor View', line: 'Red Line', zone: 'Zone 3', color: '#e11d48', order: 4 },
];

export const TICKET_TYPES = [
  {
    code: 'SINGLE',
    name: 'Single Journey',
    pricingModel: 'Distance_Based',
    validityHours: 4,
    description: 'One-way transit valid for 4 hours from time of issuance.',
    badge: 'Standard'
  },
  {
    code: 'RETURN',
    name: 'Return Ticket',
    pricingModel: 'Distance_Based',
    validityHours: 24,
    multiplier: 1.8,
    description: 'Round-trip transit valid for 24 hours with a 20% discount on the return leg.',
    badge: '20% Discount'
  },
  {
    code: 'PASS',
    name: 'Daily Pass',
    pricingModel: 'Fixed',
    validityHours: 24,
    fixedFare: 50.00,
    description: 'Unlimited all-day transit across all lines and zones for 24 hours.',
    badge: 'Best Value'
  }
];

export const FARE_RULES = {
  ratePerKm: 2.50,
  minimumFare: 10.00,
  returnMultiplier: 1.80,
  dailyPassPrice: 50.00,
  currency: 'USD'
};

// Route Network Distances Matrix (symmetric lookup)
export const ROUTE_MATRIX = {
  'STN-01-STN-02': 4.20,
  'STN-01-STN-03': 8.50,
  'STN-01-STN-04': 12.00,
  'STN-01-STN-05': 14.20,
  'STN-02-STN-03': 4.30,
  'STN-02-STN-04': 7.80,
  'STN-02-STN-05': 10.00,
  'STN-03-STN-04': 3.50,
  'STN-03-STN-05': 5.70,
  'STN-04-STN-05': 2.20,
  'STN-06-STN-07': 3.50,
  'STN-06-STN-08': 9.10,
  'STN-06-STN-09': 14.90,
  'STN-07-STN-08': 5.60,
  'STN-07-STN-09': 11.40,
  'STN-08-STN-09': 5.80,
  // Inter-line transfers via Grand Interchange
  'STN-01-STN-08': 18.60,
  'STN-01-STN-06': 22.10,
  'STN-01-STN-07': 24.20,
  'STN-01-STN-09': 24.40,
  'STN-02-STN-08': 14.40,
  'STN-03-STN-08': 10.10,
  'STN-04-STN-08': 8.50,
  'STN-05-STN-08': 6.30,
  'STN-05-STN-09': 12.10,
};

// Initial Seed Bookings to demonstrate the My Bookings portal immediately
export const INITIAL_BOOKINGS = [
  {
    id: 'mock-bkg-001',
    booking_reference: 'MTTS-20261016-00012',
    ticket_number: 'TKT-20261016-00008',
    commuter_name: 'Alex Rivera',
    commuter_email: 'alex.rivera@metro.internal',
    source_station_code: 'STN-01',
    source_station_name: 'Central Terminus',
    destination_station_code: 'STN-05',
    destination_station_name: 'Airport Junction',
    travel_date: '2026-10-16',
    ticket_type_code: 'RETURN',
    ticket_type_name: 'Return Ticket',
    passenger_count: 2,
    distance_km: 14.20,
    unit_fare: 63.90,
    total_fare: 127.80,
    status: 'Ticket Issued',
    payment_status: 'PAID',
    issued_at: '2026-10-16 08:30:00',
    qr_token_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    qr_payload: 'MTTS|TKT-20261016-00008|MTTS-20261016-00012|e3b0c442|2026-10-16|STN-01|STN-05|2|RETURN|PAID',
    scans_count: 1,
    last_scanned: '2026-10-16 09:15:22'
  },
  {
    id: 'mock-bkg-002',
    booking_reference: 'MTTS-20261016-00014',
    ticket_number: 'TKT-20261016-00009',
    commuter_name: 'Samantha Chen',
    commuter_email: 'schen@metro.internal',
    source_station_code: 'STN-06',
    source_station_name: 'West University',
    destination_station_code: 'STN-08',
    destination_station_name: 'Grand Interchange',
    travel_date: '2026-10-16',
    ticket_type_code: 'SINGLE',
    ticket_type_name: 'Single Journey',
    passenger_count: 1,
    distance_km: 9.10,
    unit_fare: 22.75,
    total_fare: 22.75,
    status: 'Ticket Issued',
    payment_status: 'PAID',
    issued_at: '2026-10-16 10:12:00',
    qr_token_hash: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
    qr_payload: 'MTTS|TKT-20261016-00009|MTTS-20261016-00014|8f434346|2026-10-16|STN-06|STN-08|1|SINGLE|PAID',
    scans_count: 0
  },
  {
    id: 'mock-bkg-003',
    booking_reference: 'MTTS-20261016-00019',
    ticket_number: null,
    commuter_name: 'Marcus Vance',
    commuter_email: 'mvance@metro.internal',
    source_station_code: 'STN-02',
    source_station_name: 'Market Square',
    destination_station_code: 'STN-04',
    destination_station_name: 'Financial District',
    travel_date: '2026-10-17',
    ticket_type_code: 'PASS',
    ticket_type_name: 'Daily Pass',
    passenger_count: 3,
    distance_km: 7.80,
    unit_fare: 50.00,
    total_fare: 150.00,
    status: 'Pending Approval',
    payment_status: 'AUTHORIZED',
    submitted_at: '2026-10-16 11:45:00',
    approval_task_id: 'SYSAPR-2026-0091'
  }
];
