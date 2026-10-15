import { getCollection, initDb } from './index.js';

export async function seedDatabase() {
  console.log('[DB Seed] Checking master data collections in MongoDB...');

  const stationsCol = getCollection('stations');
  const count = await stationsCol.countDocuments({});

  if (count > 0) {
    console.log(`[DB Seed] Database already contains ${count} stations. Skipping master data seed.`);
    return;
  }

  console.log('[DB Seed] Seeding transit master data into MongoDB collections (Scope: x_mtts)...');

  // 1. Seed Stations (Mirrors x_mtts_station)
  const stations = [
    { code: 'STN-01', name: 'Central Terminus', line_name: 'Blue Line', zone: 'Zone 1', color: '#0284c7', seq_order: 1, is_transfer: false, active: true },
    { code: 'STN-02', name: 'Market Square', line_name: 'Blue Line', zone: 'Zone 1', color: '#0284c7', seq_order: 2, is_transfer: false, active: true },
    { code: 'STN-03', name: 'Tech Park North', line_name: 'Blue Line', zone: 'Zone 2', color: '#0284c7', seq_order: 3, is_transfer: false, active: true },
    { code: 'STN-04', name: 'Financial District', line_name: 'Blue Line', zone: 'Zone 2', color: '#0284c7', seq_order: 4, is_transfer: false, active: true },
    { code: 'STN-05', name: 'Airport Junction', line_name: 'Blue Line', zone: 'Zone 3', color: '#0284c7', seq_order: 5, is_transfer: false, active: true },
    { code: 'STN-06', name: 'West University', line_name: 'Red Line', zone: 'Zone 1', color: '#e11d48', seq_order: 1, is_transfer: false, active: true },
    { code: 'STN-07', name: 'Civic Center', line_name: 'Red Line', zone: 'Zone 1', color: '#e11d48', seq_order: 2, is_transfer: false, active: true },
    { code: 'STN-08', name: 'Grand Interchange', line_name: 'Red Line', zone: 'Zone 2', color: '#e11d48', seq_order: 3, is_transfer: true, active: true },
    { code: 'STN-09', name: 'Harbor View', line_name: 'Red Line', zone: 'Zone 3', color: '#e11d48', seq_order: 4, is_transfer: false, active: true },
  ];

  for (const s of stations) {
    const existing = await stationsCol.findOne({ code: s.code });
    if (!existing) {
      await stationsCol.insertOne(s);
    }
  }

  // 2. Seed Ticket Types (Mirrors x_mtts_ticket_type)
  const ticketTypesCol = getCollection('ticket_types');
  const ticketTypes = [
    {
      code: 'SINGLE',
      name: 'Single Journey',
      pricing_model: 'Distance_Based',
      validity_hours: 4,
      multiplier: 1.0,
      fixed_fare: null,
      description: 'One-way transit valid for 4 hours from time of issuance.',
      badge: 'Standard',
      active: true
    },
    {
      code: 'RETURN',
      name: 'Return Ticket',
      pricing_model: 'Distance_Based',
      validity_hours: 24,
      multiplier: 1.8,
      fixed_fare: null,
      description: 'Round-trip transit valid for 24 hours with a 20% discount on the return leg.',
      badge: '20% Discount',
      active: true
    },
    {
      code: 'PASS',
      name: 'Daily Pass',
      pricing_model: 'Fixed',
      validity_hours: 24,
      multiplier: 1.0,
      fixed_fare: 50.00,
      description: 'Unlimited all-day transit across all lines and zones for 24 hours.',
      badge: 'Best Value',
      active: true
    }
  ];

  for (const t of ticketTypes) {
    const existing = await ticketTypesCol.findOne({ code: t.code });
    if (!existing) {
      await ticketTypesCol.insertOne(t);
    }
  }

  // 3. Seed Fare Rules (Mirrors x_mtts_fare_rule)
  const fareRulesCol = getCollection('fare_rules');
  const fareRules = [
    { rule_id: 'FR-SINGLE-01', ticket_type_code: 'SINGLE', rate_per_km: 2.50, minimum_fare: 10.00, currency: 'USD', active: true },
    { rule_id: 'FR-RETURN-01', ticket_type_code: 'RETURN', rate_per_km: 2.50, minimum_fare: 10.00, currency: 'USD', active: true },
    { rule_id: 'FR-PASS-01', ticket_type_code: 'PASS', rate_per_km: 0.00, minimum_fare: 50.00, currency: 'USD', active: true }
  ];

  for (const f of fareRules) {
    const existing = await fareRulesCol.findOne({ rule_id: f.rule_id });
    if (!existing) {
      await fareRulesCol.insertOne(f);
    }
  }

  // 4. Seed Route Network Matrix (Mirrors x_mtts_route)
  const routesCol = getCollection('routes');
  const routes = [
    { id: 'RT-001', origin_station_code: 'STN-01', destination_station_code: 'STN-02', origin_station_name: 'Central Terminus', destination_station_name: 'Market Square', distance_km: 4.20, line_name: 'Blue Line', active: true },
    { id: 'RT-002', origin_station_code: 'STN-02', destination_station_code: 'STN-01', origin_station_name: 'Market Square', destination_station_name: 'Central Terminus', distance_km: 4.20, line_name: 'Blue Line', active: true },
    { id: 'RT-003', origin_station_code: 'STN-01', destination_station_code: 'STN-03', origin_station_name: 'Central Terminus', destination_station_name: 'Tech Park North', distance_km: 8.50, line_name: 'Blue Line', active: true },
    { id: 'RT-004', origin_station_code: 'STN-03', destination_station_code: 'STN-01', origin_station_name: 'Tech Park North', destination_station_name: 'Central Terminus', distance_km: 8.50, line_name: 'Blue Line', active: true },
    { id: 'RT-005', origin_station_code: 'STN-01', destination_station_code: 'STN-05', origin_station_name: 'Central Terminus', destination_station_name: 'Airport Junction', distance_km: 14.20, line_name: 'Blue Line', active: true },
    { id: 'RT-006', origin_station_code: 'STN-05', destination_station_code: 'STN-01', origin_station_name: 'Airport Junction', destination_station_name: 'Central Terminus', distance_km: 14.20, line_name: 'Blue Line', active: true },
    { id: 'RT-007', origin_station_code: 'STN-02', destination_station_code: 'STN-04', origin_station_name: 'Market Square', destination_station_name: 'Financial District', distance_km: 7.80, line_name: 'Blue Line', active: true },
    { id: 'RT-008', origin_station_code: 'STN-04', destination_station_code: 'STN-02', origin_station_name: 'Financial District', destination_station_name: 'Market Square', distance_km: 7.80, line_name: 'Blue Line', active: true },
    { id: 'RT-009', origin_station_code: 'STN-06', destination_station_code: 'STN-07', origin_station_name: 'West University', destination_station_name: 'Civic Center', distance_km: 3.50, line_name: 'Red Line', active: true },
    { id: 'RT-010', origin_station_code: 'STN-07', destination_station_code: 'STN-06', origin_station_name: 'Civic Center', destination_station_name: 'West University', distance_km: 3.50, line_name: 'Red Line', active: true },
    { id: 'RT-011', origin_station_code: 'STN-06', destination_station_code: 'STN-08', origin_station_name: 'West University', destination_station_name: 'Grand Interchange', distance_km: 9.10, line_name: 'Red Line', active: true },
    { id: 'RT-012', origin_station_code: 'STN-08', destination_station_code: 'STN-06', origin_station_name: 'Grand Interchange', destination_station_name: 'West University', distance_km: 9.10, line_name: 'Red Line', active: true },
    { id: 'RT-013', origin_station_code: 'STN-07', destination_station_code: 'STN-09', origin_station_name: 'Civic Center', destination_station_name: 'Harbor View', distance_km: 11.40, line_name: 'Red Line', active: true },
    { id: 'RT-014', origin_station_code: 'STN-09', destination_station_code: 'STN-07', origin_station_name: 'Harbor View', destination_station_name: 'Civic Center', distance_km: 11.40, line_name: 'Red Line', active: true },
    { id: 'RT-015', origin_station_code: 'STN-01', destination_station_code: 'STN-08', origin_station_name: 'Central Terminus', destination_station_name: 'Grand Interchange', distance_km: 18.60, line_name: 'Inter-Line Transfer', active: true }
  ];

  for (const r of routes) {
    const existing = await routesCol.findOne({ id: r.id });
    if (!existing) {
      await routesCol.insertOne(r);
    }
  }

  // 5. Seed Initial Global Demo Sample Booking
  const bookingsCol = getCollection('bookings');
  const demoSeed = await bookingsCol.findOne({ id: 'bkg-demo-seed-01' });
  if (!demoSeed) {
    await bookingsCol.insertOne({
      id: 'bkg-demo-seed-01',
      session_id: 'demo-global-seed',
      booking_reference: 'MTTS-20261016-00012',
      ticket_number: 'TKT-20261016-00008',
      commuter_name: 'Alex Rivera',
      commuter_email: 'alex.rivera@metro.internal',
      source_station_code: 'STN-01',
      source_station_name: 'Central Terminus',
      destination_station_code: 'STN-05',
      destination_station_name: 'Airport Junction',
      travel_date: new Date().toISOString().slice(0, 10),
      ticket_type_code: 'RETURN',
      ticket_type_name: 'Return Ticket',
      passenger_count: 2,
      distance_km: 14.20,
      unit_fare: 63.90,
      total_fare: 127.80,
      status: 'Ticket Issued',
      payment_status: 'PAID',
      qr_token_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      qr_payload: 'MTTS|TKT-20261016-00008|MTTS-20261016-00012|e3b0c442|2026-10-16|STN-01|STN-05|2|RETURN|PAID',
      scans_count: 1,
      created_at: new Date().toISOString()
    });
  }

  console.log('[DB Seed] MongoDB master transit collections and initial demo documents seeded successfully.');
}

// Direct CLI execution support
if (process.argv[1]?.endsWith('seed.js')) {
  initDb().then(async () => {
    await seedDatabase();
    process.exit(0);
  });
}
