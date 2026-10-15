import { initDb, closeDb } from './index.js';
import { seedDatabase } from './seed.js';

async function runMigration() {
  console.log('[Migration] Starting MTTS MongoDB schema initialization and seeding...');
  try {
    const { isMemory } = await initDb();
    console.log(`[Migration] Collections and indexes initialized (${isMemory ? 'In-Memory Mock' : 'MongoDB Atlas'}).`);
    await seedDatabase();
    console.log('[Migration] Migration and seeding complete.');
  } catch (err) {
    console.error('[Migration Error]', err);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

if (process.argv[1]?.endsWith('migrate.js')) {
  runMigration();
}

export { runMigration };
