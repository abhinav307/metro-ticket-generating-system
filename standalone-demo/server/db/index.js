import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { newDb } from 'pg-mem';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pool = null;
let isEmbedded = false;

// Initialize Database connection (Remote PostgreSQL on Render or pg-mem locally)
export function getDb() {
  if (pool) return { pool, isEmbedded };

  if (config.databaseUrl) {
    console.log('[DB] Connecting to external PostgreSQL at DATABASE_URL...');
    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      ssl: config.isProduction ? { rejectUnauthorized: false } : (config.databaseUrl.includes('render.com') ? { rejectUnauthorized: false } : false),
      max: 10,
      idleTimeoutMillis: 30000
    });
    isEmbedded = false;
  } else {
    console.log('[DB] No DATABASE_URL provided. Initializing embedded PostgreSQL engine (pg-mem)...');
    const memDb = newDb();
    
    // Register pg-mem extension functions if needed
    memDb.public.registerFunction({
      name: 'current_timestamp',
      returns: memDb.public.getType('timestamp'),
      implementation: () => new Date()
    });

    const pgAdapter = memDb.adapters.createPg();
    pool = new pgAdapter.Pool();
    isEmbedded = true;
  }

  return { pool, isEmbedded };
}

export async function query(text, params = []) {
  const { pool } = getDb();
  return pool.query(text, params);
}

export async function initDb() {
  const { isEmbedded } = getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  console.log(`[DB] Running database migration (${isEmbedded ? 'Embedded PG' : 'Live PostgreSQL'})...`);
  
  // Split statements and execute sequentially
  const statements = schemaSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      await query(stmt);
    } catch (err) {
      console.error(`[DB Migration Warning] ${err.message}`);
    }
  }

  console.log('[DB] Migration completed successfully.');
}
