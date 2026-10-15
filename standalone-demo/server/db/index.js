import { MongoClient } from 'mongodb';
import { MemoryMongoClient } from './memoryMongo.js';
import { config } from '../config.js';
import { initCollections } from './schema.js';

let client = null;
let db = null;
let isMemory = false;

/**
 * Sanitize a MongoDB connection string for safe diagnostic logging (strips username and password)
 */
export function sanitizeMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return '';
  return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^:@]+)(?::([^@]+))?@/i, '$1***:***@');
}

/**
 * Connect to MongoDB Atlas (Production) or In-Memory Mock MongoDB (Dev/Test only)
 * 
 * PRODUCTION SAFETY INVARIANT:
 * When NODE_ENV === 'production', MONGODB_URI is strictly REQUIRED.
 * If MONGODB_URI is missing or the Atlas connection fails, startup MUST fail immediately.
 * Silent fallback to an in-memory database is strictly prohibited in production.
 */
export async function connectDb() {
  if (db && client) {
    return { client, db, isMemory };
  }

  const isProd = config.isProduction || process.env.NODE_ENV === 'production';
  const isTestOrDev = config.isTest || config.nodeEnv === 'development' || config.nodeEnv === 'test' || !process.env.NODE_ENV;

  if (isProd) {
    if (!config.mongodbUri || config.mongodbUri.trim().length === 0) {
      const errMsg = '[FATAL] Production database misconfiguration: MONGODB_URI is required when NODE_ENV=production. ' +
                     'Silent fallback to in-memory mock database is strictly prohibited in production.';
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const safeUri = sanitizeMongoUri(config.mongodbUri);
    console.log(`[MongoDB Production] Connecting to live MongoDB Atlas cluster: ${safeUri}`);

    try {
      client = new MongoClient(config.mongodbUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 10000
      });
      await client.connect();
      db = client.db(config.mongodbDbName);
      isMemory = false;
      console.log(`[MongoDB Production] Successfully connected to live MongoDB Atlas database: ${config.mongodbDbName}`);
    } catch (err) {
      const sanitizedErr = err.message ? err.message.replace(/(mongodb(?:\+srv)?:\/\/)([^:@]+)(?::([^@]+))?@/i, '$1***:***@') : 'Connection failed';
      console.error(`[FATAL] Failed to connect to MongoDB Atlas cluster in production: ${sanitizedErr}`);
      client = null;
      db = null;
      throw new Error(`[FATAL] Production MongoDB Atlas connection failure: ${sanitizedErr}`);
    }
  } else if (config.mongodbUri && config.mongodbUri.trim().length > 0) {
    // Development or test mode WITH an explicit MONGODB_URI provided
    const safeUri = sanitizeMongoUri(config.mongodbUri);
    console.log(`[MongoDB ${config.nodeEnv}] Connecting to MongoDB Atlas cluster: ${safeUri}`);

    try {
      client = new MongoClient(config.mongodbUri, {
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000
      });
      await client.connect();
      db = client.db(config.mongodbDbName);
      isMemory = false;
      console.log(`[MongoDB ${config.nodeEnv}] Successfully connected to MongoDB Atlas database: ${config.mongodbDbName}`);
    } catch (err) {
      const sanitizedErr = err.message ? err.message.replace(/(mongodb(?:\+srv)?:\/\/)([^:@]+)(?::([^@]+))?@/i, '$1***:***@') : 'Connection failed';
      console.error(`[MongoDB ${config.nodeEnv} Error] Connection to Atlas failed: ${sanitizedErr}`);
      client = null;
      db = null;
      throw new Error(`Atlas connection failure in ${config.nodeEnv}: ${sanitizedErr}`);
    }
  } else if (isTestOrDev) {
    // Development or test mode WITHOUT MONGODB_URI: Permit isolated in-memory mock engine
    console.log(`[MongoDB Local] No MONGODB_URI provided in ${config.nodeEnv} mode. Initializing isolated in-memory mock MongoDB engine...`);
    client = new MemoryMongoClient('mongodb://localhost:27017/in-memory');
    await client.connect();
    db = client.db(config.mongodbDbName);
    isMemory = true;
    console.log(`[MongoDB Local] Initialized in-memory document store (db: ${config.mongodbDbName}, mode: in-memory-mock).`);
  } else {
    const errMsg = `[FATAL] Unrecognized environment (${config.nodeEnv}) without MONGODB_URI. Startup halted.`;
    console.error(errMsg);
    throw new Error(errMsg);
  }

  return { client, db, isMemory };
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Please call connectDb() or initDb() first.');
  }
  return { db, client, isMemory };
}

export function getCollection(name) {
  const { db } = getDb();
  return db.collection(name);
}

export async function initDb() {
  const { db, isMemory } = await connectDb();
  await initCollections(db);
  return { db, isMemory };
}

export async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    isMemory = false;
  }
}

export function getDbInfo() {
  return {
    connected: !!db,
    isMemory,
    mode: isMemory ? 'in-memory-mock' : 'atlas-cluster',
    engine: isMemory ? 'mock-mongodb (in-memory document store)' : 'mongodb-atlas',
    environment: config.nodeEnv,
    dbName: config.mongodbDbName
  };
}
