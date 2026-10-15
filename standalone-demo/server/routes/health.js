import express from 'express';
import { getDb, getDbInfo } from '../db/index.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { db } = getDb();
    const dbInfo = getDbInfo();
    const pingResult = await db.command({ ping: 1 });
    const isDbAlive = pingResult && pingResult.ok === 1;

    res.json({
      status: 'ok',
      service: 'Metro Ticket Generating System (MTTS) Full-Stack Demo API',
      scope: 'x_mtts',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: {
        connected: isDbAlive,
        mode: dbInfo.mode,
        engine: dbInfo.engine,
        environment: dbInfo.environment,
        dbName: db.databaseName,
        status: isDbAlive ? 'healthy' : 'degraded'
      },
      simulation_notice: 'Demonstration backend running with simulated ServiceNow Flow Designer and Turnstile API logic.'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
