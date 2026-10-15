/**
 * MongoDB Collections Schema & Index Specifications for MTTS
 * 
 * Replicates the ServiceNow data model (Scope: x_mtts) into 6 document collections:
 * 1. stations        (x_mtts_station)
 * 2. ticket_types    (x_mtts_ticket_type)
 * 3. routes          (x_mtts_route)
 * 4. fare_rules      (x_mtts_fare_rule)
 * 5. bookings        (x_mtts_booking_ticket)
 * 6. scan_events     (x_mtts_scan_event)
 */

export const COLLECTION_INDEXES = {
  stations: [
    { key: { code: 1 }, unique: true, name: 'idx_stations_code_unique' },
    { key: { line_name: 1, seq_order: 1 }, name: 'idx_stations_line_order' }
  ],
  ticket_types: [
    { key: { code: 1 }, unique: true, name: 'idx_ticket_types_code_unique' }
  ],
  routes: [
    { key: { id: 1 }, unique: true, name: 'idx_routes_id_unique' },
    { key: { origin_station_code: 1, destination_station_code: 1 }, name: 'idx_routes_pair' }
  ],
  fare_rules: [
    { key: { rule_id: 1 }, unique: true, name: 'idx_fare_rules_id_unique' },
    { key: { ticket_type_code: 1 }, name: 'idx_fare_rules_ticket_type' }
  ],
  bookings: [
    { key: { id: 1 }, unique: true, name: 'idx_bookings_id_unique' },
    { key: { booking_reference: 1 }, unique: true, name: 'idx_bookings_reference_unique' },
    { key: { ticket_number: 1 }, unique: true, name: 'idx_bookings_ticket_number_unique' },
    { key: { session_id: 1, created_at: -1 }, name: 'idx_bookings_session_created' }
  ],
  scan_events: [
    { key: { id: 1 }, unique: true, name: 'idx_scan_events_id_unique' },
    { key: { ticket_number: 1 }, name: 'idx_scan_events_ticket' },
    { key: { session_id: 1 }, name: 'idx_scan_events_session' },
    { key: { scan_timestamp: -1 }, name: 'idx_scan_events_timestamp' }
  ]
};

export async function initCollections(db) {
  console.log('[MongoDB Schema] Initializing collections and unique indexes...');

  for (const [colName, indexes] of Object.entries(COLLECTION_INDEXES)) {
    const col = db.collection(colName);
    for (const idx of indexes) {
      try {
        await col.createIndex(idx.key, {
          unique: !!idx.unique,
          name: idx.name
        });
      } catch (err) {
        console.warn(`[MongoDB Index Warning] Collection ${colName}: ${err.message}`);
      }
    }
  }

  console.log('[MongoDB Schema] Collections and indexes initialized successfully.');
}
