import express from 'express';
import { query, getDb } from '../db/index.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { isEmbedded } = getDb();
    const dbTest = await query('SELECT 1 as alive');
    const isDbAlive = dbTest.rows && dbTest.rows[0].alive === 1;

    res.json({
      status: 'ok',
      service: 'Metro Ticket Generating System (MTTS) Full-Stack Demo API',
      scope: 'x_mtts',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: {
        connected: isDbAlive,
        engine: isEmbedded ? 'embedded-postgresql (pg-mem)' : 'external-postgresql (pg)',
        status: isDbAlive ? 'healthy' : 'degraded'
      },
      simulation_notice: 'Demonstration backend running with simulated ServiceNow Flow Designer and Turnstile API logic.'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
