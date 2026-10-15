import { query } from './index.js';

export async function seedDatabase() {
  console.log('[DB Seed] Checking master data tables...');

  // Check if stations are already populated
  const stnCheck = await query('SELECT COUNT(*) as count FROM stations');
  const count = parseInt(stnCheck.rows[0].count, 10);

  if (count > 0) {
    console.log(`[DB Seed] Database already contains ${count} stations. Skipping master data seed.`);
    return;
  }

  console.log('[DB Seed] Seeding transit master data (Scope: x_mtts)...');

  // 1. Seed Stations (Mirrors x_mtts_station)
  const stations = [
    { code: 'STN-01', name: 'Central Terminus', line: 'Blue Line', zone: 'Zone 1', color: '#0284c7', order: 1, transfer: false },
    { code: 'STN-02', name: 'Market Square', line: 'Blue Line', zone: 'Zone 1', color: '#0284c7', order: 2, transfer: false },
    { code: 'STN-03', name: 'Tech Park North', line: 'Blue Line', zone: 'Zone 2', color: '#0284c7', order: 3, transfer: false },
    { code: 'STN-04', name: 'Financial District', line: 'Blue Line', zone: 'Zone 2', color: '#0284c7', order: 4, transfer: false },
    { code: 'STN-05', name: 'Airport Junction', line: 'Blue Line', zone: 'Zone 3', color: '#0284c7', order: 5, transfer: false },
    { code: 'STN-06', name: 'West University', line: 'Red Line', zone: 'Zone 1', color: '#e11d48', order: 1, transfer: false },
    { code: 'STN-07', name: 'Civic Center', line: 'Red Line', zone: 'Zone 1', color: '#e11d48', order: 2, transfer: false },
    { code: 'STN-08', name: 'Grand Interchange', line: 'Red Line', zone: 'Zone 2', color: '#e11d48', order: 3, transfer: true },
    { code: 'STN-09', name: 'Harbor View', line: 'Red Line', zone: 'Zone 3', color: '#e11d48', order: 4, transfer: false },
  ];

  for (const s of stations) {
    await query(
      `INSERT INTO stations (code, name, line_name, zone, color, seq_order, is_transfer, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (code) DO NOTHING`,
      [s.code, s.name, s.line, s.zone, s.color, s.order, s.transfer]
    );
  }

  // 2. Seed Ticket Types (Mirrors x_mtts_ticket_type)
  const ticketTypes = [
    {
      code: 'SINGLE',
      name: 'Single Journey',
      model: 'Distance_Based',
      hours: 4,
      multiplier: 1.0,
      fixedFare: null,
      desc: 'One-way transit valid for 4 hours from time of issuance.',
      badge: 'Standard'
    },
    {
      code: 'RETURN',
      name: 'Return Ticket',
      model: 'Distance_Based',
      hours: 24,
      multiplier: 1.8,
      fixedFare: null,
      desc: 'Round-trip transit valid for 24 hours with a 20% discount on the return leg.',
      badge: '20% Discount'
    },
    {
      code: 'PASS',
      name: 'Daily Pass',
      model: 'Fixed',
      hours: 24,
      multiplier: 1.0,
      fixedFare: 50.00,
      desc: 'Unlimited all-day transit across all lines and zones for 24 hours.',
      badge: 'Best Value'
    }
  ];

  for (const t of ticketTypes) {
    await query(
      `INSERT INTO ticket_types (code, name, pricing_model, validity_hours, multiplier, fixed_fare, description, badge, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       ON CONFLICT (code) DO NOTHING`,
      [t.code, t.name, t.model, t.hours, t.multiplier, t.fixedFare, t.desc, t.badge]
    );
  }

  // 3. Seed Fare Rules (Mirrors x_mtts_fare_rule)
  const fareRules = [
    { id: 'FR-SINGLE-01', code: 'SINGLE', rate: 2.50, min: 10.00 },
    { id: 'FR-RETURN-01', code: 'RETURN', rate: 2.50, min: 10.00 },
    { id: 'FR-PASS-01', code: 'PASS', rate: 0.00, min: 50.00 }
  ];

  for (const f of fareRules) {
    await query(
      `INSERT INTO fare_rules (rule_id, ticket_type_code, rate_per_km, minimum_fare, currency, active)
       VALUES ($1, $2, $3, $4, 'USD', true)
       ON CONFLICT (rule_id) DO NOTHING`,
      [f.id, f.code, f.rate, f.min]
    );
  }

  // 4. Seed Route Network Matrix (Mirrors x_mtts_route)
  const routes = [
    { id: 'RT-001', o: 'STN-01', d: 'STN-02', km: 4.20, line: 'Blue Line' },
    { id: 'RT-002', o: 'STN-02', d: 'STN-01', km: 4.20, line: 'Blue Line' },
    { id: 'RT-003', o: 'STN-01', d: 'STN-03', km: 8.50, line: 'Blue Line' },
    { id: 'RT-004', o: 'STN-03', d: 'STN-01', km: 8.50, line: 'Blue Line' },
    { id: 'RT-005', o: 'STN-01', d: 'STN-05', km: 14.20, line: 'Blue Line' },
    { id: 'RT-006', o: 'STN-05', d: 'STN-01', km: 14.20, line: 'Blue Line' },
    { id: 'RT-007', o: 'STN-02', d: 'STN-04', km: 7.80, line: 'Blue Line' },
    { id: 'RT-008', o: 'STN-04', d: 'STN-02', km: 7.80, line: 'Blue Line' },
    { id: 'RT-009', o: 'STN-06', d: 'STN-07', km: 3.50, line: 'Red Line' },
    { id: 'RT-010', o: 'STN-07', d: 'STN-06', km: 3.50, line: 'Red Line' },
    { id: 'RT-011', o: 'STN-06', d: 'STN-08', km: 9.10, line: 'Red Line' },
    { id: 'RT-012', o: 'STN-08', d: 'STN-06', km: 9.10, line: 'Red Line' },
    { id: 'RT-013', o: 'STN-07', d: 'STN-09', km: 11.40, line: 'Red Line' },
    { id: 'RT-014', o: 'STN-09', d: 'STN-07', km: 11.40, line: 'Red Line' },
    { id: 'RT-015', o: 'STN-01', d: 'STN-08', km: 18.60, line: 'Inter-Line Transfer' }
  ];

  for (const r of routes) {
    await query(
      `INSERT INTO routes (id, origin_station_code, destination_station_code, distance_km, line_name, active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (id) DO NOTHING`,
      [r.id, r.o, r.d, r.km, r.line]
    );
  }

  // 5. Seed Initial Global Demo Sample Booking
  await query(
    `INSERT INTO bookings (
      id, session_id, booking_reference, ticket_number, commuter_name, commuter_email,
      source_station_code, destination_station_code, travel_date, ticket_type_code,
      passenger_count, distance_km, unit_fare, total_fare, status, payment_status,
      qr_token_hash, qr_payload, scans_count
    ) VALUES (
      'bkg-demo-seed-01', 'demo-global-seed', 'MTTS-20261016-00012', 'TKT-20261016-00008',
      'Alex Rivera', 'alex.rivera@metro.internal', 'STN-01', 'STN-05', CURRENT_DATE,
      'RETURN', 2, 14.20, 63.90, 127.80, 'Ticket Issued', 'PAID',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'MTTS|TKT-20261016-00008|MTTS-20261016-00012|e3b0c442|2026-10-16|STN-01|STN-05|2|RETURN|PAID',
      1
    ) ON CONFLICT (id) DO NOTHING`
  );

  console.log('[DB Seed] Transit master data and initial demo records seeded successfully.');
}

// Direct CLI execution support
if (process.argv[1]?.endsWith('seed.js')) {
  import('./index.js').then(async ({ initDb }) => {
    await initDb();
    await seedDatabase();
    process.exit(0);
  });
}
