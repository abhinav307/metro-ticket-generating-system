import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

// GET /api/stations — List all active transit stations
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT code, name, line_name as line, zone, color, seq_order as "order", is_transfer as transfer
       FROM stations
       WHERE active = true
       ORDER BY seq_order ASC`
    );
    res.json({
      stations: result.rows,
      count: result.rows.length
    });
  } catch (err) {
    next(err);
  }
});

export default router;
