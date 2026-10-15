import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

// GET /api/routes — List all active transit route pairs and distances
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT r.id, r.origin_station_code, r.destination_station_code,
              r.distance_km, r.line_name,
              s1.name as origin_station_name, s2.name as destination_station_name
       FROM routes r
       JOIN stations s1 ON r.origin_station_code = s1.code
       JOIN stations s2 ON r.destination_station_code = s2.code
       WHERE r.active = true
       ORDER BY r.id ASC`
    );
    res.json({
      routes: result.rows,
      count: result.rows.length
    });
  } catch (err) {
    next(err);
  }
});

export default router;
