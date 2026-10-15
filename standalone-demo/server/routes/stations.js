import express from 'express';
import { getCollection } from '../db/index.js';

const router = express.Router();

// GET /api/stations — List all active transit stations from MongoDB
router.get('/', async (req, res, next) => {
  try {
    const stationsCol = getCollection('stations');
    const docs = await stationsCol.find({ active: true }).sort({ seq_order: 1 }).toArray();

    const stations = docs.map(s => ({
      code: s.code,
      name: s.name,
      line: s.line_name,
      zone: s.zone,
      color: s.color,
      order: s.seq_order,
      transfer: s.is_transfer
    }));

    res.json({
      stations,
      count: stations.length
    });
  } catch (err) {
    next(err);
  }
});

export default router;
