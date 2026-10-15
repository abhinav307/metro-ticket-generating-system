import express from 'express';
import { getCollection } from '../db/index.js';

const router = express.Router();

// GET /api/routes — List all active transit route pairs and distances from MongoDB
router.get('/', async (req, res, next) => {
  try {
    const routesCol = getCollection('routes');
    const docs = await routesCol.find({ active: true }).sort({ id: 1 }).toArray();

    const routes = docs.map(r => ({
      id: r.id,
      origin_station_code: r.origin_station_code,
      destination_station_code: r.destination_station_code,
      distance_km: r.distance_km,
      line_name: r.line_name,
      origin_station_name: r.origin_station_name,
      destination_station_name: r.destination_station_name
    }));

    res.json({
      routes,
      count: routes.length
    });
  } catch (err) {
    next(err);
  }
});

export default router;
