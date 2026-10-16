/**
 * MongoDB Collections Schema & Index Specifications for MTTS
 * 
 * Replicates the ServiceNow data model (Scope: x_mtts) into 7 document collections:
 * 1. stations        (x_mtts_station)
 * 2. ticket_types    (x_mtts_ticket_type)
 * 3. routes          (x_mtts_route)
 * 4. fare_rules      (x_mtts_fare_rule)
 * 5. bookings        (x_mtts_booking_ticket)
 * 6. approvals       (sysapproval_approver)
 * 7. scan_events     (x_mtts_scan_event)
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
    {
      key: { ticket_number: 1 },
      unique: true,
      name: 'idx_bookings_ticket_number_unique',
      partialFilterExpression: { ticket_number: { $type: 'string' } }
    },
    { key: { session_id: 1, created_at: -1 }, name: 'idx_bookings_session_created' },
    { key: { status: 1, approval_status: 1 }, name: 'idx_bookings_status_approval' }
  ],
  approvals: [
    { key: { id: 1 }, unique: true, name: 'idx_approvals_id_unique' },
    { key: { booking_id: 1 }, unique: true, name: 'idx_approvals_booking_id_unique' },
    { key: { decision: 1, created_at: -1 }, name: 'idx_approvals_decision' }
  ],
  scan_events: [
    { key: { id: 1 }, unique: true, name: 'idx_scan_events_id_unique' },
    { key: { ticket_number: 1 }, name: 'idx_scan_events_ticket' },
    { key: { session_id: 1 }, name: 'idx_scan_events_session' },
    { key: { scan_timestamp: -1 }, name: 'idx_scan_events_timestamp' }
  ]
};

/**
 * Scan bookings collection for any duplicate string ticket numbers prior to index creation.
 * Returns an array of duplicate descriptors.
 */
export async function findDuplicateStringTicketNumbers(bookingsCol) {
  if (typeof bookingsCol.aggregate === 'function') {
    try {
      const dups = await bookingsCol.aggregate([
        { $match: { ticket_number: { $type: 'string' } } },
        { $group: { _id: '$ticket_number', count: { $sum: 1 }, ids: { $push: '$id' } } },
        { $match: { count: { $gt: 1 } } }
      ]).toArray();
      return dups.map(d => ({ ticket_number: d._id, count: d.count, ids: d.ids }));
    } catch (e) {
      // Fall through to document scan if aggregation is not supported by driver/mock
    }
  }

  const docs = await bookingsCol.find({}).toArray();
  const counts = new Map();
  for (const doc of docs) {
    if (typeof doc.ticket_number === 'string') {
      const val = doc.ticket_number.trim();
      if (!counts.has(val)) {
        counts.set(val, { count: 0, ids: [] });
      }
      const entry = counts.get(val);
      entry.count += 1;
      entry.ids.push(doc.id || doc._id);
    }
  }

  const duplicates = [];
  for (const [ticket, info] of counts.entries()) {
    if (info.count > 1) {
      duplicates.push({ ticket_number: ticket, count: info.count, ids: info.ids });
    }
  }
  return duplicates;
}

/**
 * Safely migrate the idx_bookings_ticket_number_unique index to a unique partial index.
 * Idempotent: If the index already has the required partialFilterExpression, skips without modification.
 * Safe: Halts and throws if duplicate string ticket numbers exist, never modifying or deleting data automatically.
 */
export async function migrateBookingsTicketIndex(bookingsCol) {
  console.log('[MongoDB Migration] Verifying index idx_bookings_ticket_number_unique on bookings collection...');

  let existingIndexes = [];
  try {
    if (typeof bookingsCol.indexes === 'function') {
      existingIndexes = await bookingsCol.indexes();
    }
  } catch (err) {
    console.warn(`[MongoDB Migration Warning] Could not inspect existing indexes on bookings: ${err.message}`);
    existingIndexes = [];
  }

  const existingIndex = existingIndexes.find(idx => idx.name === 'idx_bookings_ticket_number_unique');

  // Check if existing index is already configured with unique partialFilterExpression
  const hasPartialFilter = existingIndex?.partialFilterExpression &&
    existingIndex.partialFilterExpression.ticket_number &&
    existingIndex.partialFilterExpression.ticket_number.$type === 'string';

  const isCorrect = existingIndex && existingIndex.unique && hasPartialFilter;

  if (isCorrect) {
    console.log('[MongoDB Migration] Index idx_bookings_ticket_number_unique is already correctly configured with unique partialFilterExpression { ticket_number: { $type: "string" } }.');
    return;
  }

  // Pre-flight check: Scan for duplicate string ticket numbers before index recreation
  console.log('[MongoDB Migration] Pre-flight check: scanning for duplicate string ticket numbers before index migration...');
  const duplicates = await findDuplicateStringTicketNumbers(bookingsCol);

  if (duplicates.length > 0) {
    const details = duplicates.map(d => `Ticket "${d.ticket_number}" (${d.count} occurrences, IDs: ${d.ids.join(', ')})`).join('; ');
    const errMsg = `[FATAL] Index migration halted: Cannot create unique partial index on ticket_number because duplicate string ticket numbers exist: ${details}. Existing records must not be deleted or mutated automatically.`;
    console.error(errMsg);
    throw new Error(errMsg);
  }

  // Drop conflicting legacy index by exact name
  if (existingIndex) {
    console.log(`[MongoDB Migration] Conflicting index '${existingIndex.name}' found (unique: ${existingIndex.unique}, partial: ${JSON.stringify(existingIndex.partialFilterExpression || null)}). Dropping index by exact name...`);
    await bookingsCol.dropIndex('idx_bookings_ticket_number_unique');
    console.log("[MongoDB Migration] Conflicting index 'idx_bookings_ticket_number_unique' dropped successfully.");
  }

  // Recreate with unique partial filter
  console.log('[MongoDB Migration] Creating unique partial index idx_bookings_ticket_number_unique with partialFilterExpression { ticket_number: { $type: "string" } }...');
  await bookingsCol.createIndex(
    { ticket_number: 1 },
    {
      unique: true,
      name: 'idx_bookings_ticket_number_unique',
      partialFilterExpression: { ticket_number: { $type: 'string' } }
    }
  );
  console.log('[MongoDB Migration] Successfully created unique partial index idx_bookings_ticket_number_unique.');
}

export async function initCollections(db) {
  console.log('[MongoDB Schema] Initializing collections and unique indexes...');

  // Step 1: Migrate / initialize bookings ticket index safely
  const bookingsCol = db.collection('bookings');
  await migrateBookingsTicketIndex(bookingsCol);

  // Step 2: Initialize remaining indexes across all collections
  for (const [colName, indexes] of Object.entries(COLLECTION_INDEXES)) {
    const col = db.collection(colName);
    for (const idx of indexes) {
      if (colName === 'bookings' && idx.name === 'idx_bookings_ticket_number_unique') {
        continue; // Handled by migrateBookingsTicketIndex
      }

      try {
        const options = {
          unique: !!idx.unique,
          name: idx.name
        };
        if (idx.partialFilterExpression) {
          options.partialFilterExpression = idx.partialFilterExpression;
        }
        if (idx.sparse) {
          options.sparse = !!idx.sparse;
        }
        await col.createIndex(idx.key, options);
      } catch (err) {
        console.warn(`[MongoDB Index Warning] Collection ${colName}: ${err.message}`);
      }
    }
  }

  console.log('[MongoDB Schema] Collections and indexes initialized successfully.');
}
