import { initDb } from './index.js';
import { seedDatabase } from './seed.js';

async function runMigration() {
  console.log('[Migrate] Starting database schema migration...');
  await initDb();
  await seedDatabase();
  console.log('[Migrate] Migration and seeding complete.');
}

if (process.argv[1]?.endsWith('migrate.js')) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migrate Error]', err);
      process.exit(1);
    });
}

export { runMigration };
