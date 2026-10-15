import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

// Helper to look up distance from database with sequence fallback
export async function lookupRouteDistance(originCode, destCode) {
  if (!originCode || !destCode || originCode === destCode) return 0;

  // Direct route check
  const direct = await query(
    `SELECT distance_km FROM routes
     WHERE (origin_station_code = $1 AND destination_station_code = $2)
        OR (origin_station_code = $2 AND destination_station_code = $1)
     LIMIT 1`,
    [originCode, destCode]
  );

  if (direct.rows.length > 0) {
    return parseFloat(direct.rows[0].distance_km);
  }

  // Fallback distance calculation using sequence order
  const stns = await query(
    `SELECT code, line_name, seq_order FROM stations WHERE code IN ($1, $2)`,
    [originCode, destCode]
  );

  if (stns.rows.length === 2) {
    const [s1, s2] = stns.rows;
    if (s1.line_name === s2.line_name) {
      const diff = Math.abs(s1.seq_order - s2.seq_order);
      return Math.max(2.5, +(diff * 3.8).toFixed(2));
    }
  }

  return 16.50; // Inter-line transfer fallback
}

// POST /api/fare/calculate — Authoritative server-side fare calculation
router.post('/calculate', async (req, res, next) => {
  try {
    const { originCode, destCode, ticketTypeCode, passengerCount } = req.body;

    if (!originCode || !destCode) {
      return res.status(400).json({ error: 'Origin and destination stations are required.' });
    }

    if (originCode === destCode) {
      return res.status(400).json({ error: 'Origin and destination stations must be different.' });
    }

    const count = Math.max(1, Math.min(6, parseInt(passengerCount, 10) || 1));
    const distanceKm = await lookupRouteDistance(originCode, destCode);

    // Fetch ticket type and fare rules
    const typeRes = await query(
      `SELECT tt.*, fr.rate_per_km, fr.minimum_fare
       FROM ticket_types tt
       LEFT JOIN fare_rules fr ON tt.code = fr.ticket_type_code
       WHERE tt.code = $1 AND tt.active = true`,
      [ticketTypeCode || 'SINGLE']
    );

    if (typeRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or inactive ticket type.' });
    }

    const tt = typeRes.rows[0];
    const ratePerKm = parseFloat(tt.rate_per_km || 2.50);
    const minimumFare = parseFloat(tt.minimum_fare || 10.00);
    const multiplier = parseFloat(tt.multiplier || 1.0);
    const fixedFare = tt.fixed_fare ? parseFloat(tt.fixed_fare) : null;

    let unitFare = 0;
    let subtotalBeforeDiscount = 0;
    let discountAmount = 0;
    let calculationMethod = '';

    if (tt.code === 'PASS') {
      unitFare = fixedFare || 50.00;
      subtotalBeforeDiscount = unitFare;
      calculationMethod = 'Flat Tariff: Fixed Unlimited All-Day Pass ($50.00)';
    } else if (tt.code === 'RETURN') {
      const oneWayBase = Math.max(distanceKm * ratePerKm, minimumFare);
      subtotalBeforeDiscount = +(oneWayBase * 2).toFixed(2);
      unitFare = +(oneWayBase * multiplier).toFixed(2);
      discountAmount = +(subtotalBeforeDiscount - unitFare).toFixed(2);
      calculationMethod = `Distance Base ($${distanceKm.toFixed(2)} km × $${ratePerKm.toFixed(2)}) × ${multiplier} Multiplier (20% Return Discount)`;
    } else {
      // SINGLE
      const rawFare = distanceKm * ratePerKm;
      unitFare = +Math.max(rawFare, minimumFare).toFixed(2);
      subtotalBeforeDiscount = unitFare;
      calculationMethod = rawFare < minimumFare
        ? `Distance Base ($${rawFare.toFixed(2)}) below Minimum Fare threshold → $${minimumFare.toFixed(2)} Minimum Fare applied`
        : `Distance Base: ${distanceKm.toFixed(2)} km × $${ratePerKm.toFixed(2)}/km = $${unitFare.toFixed(2)}`;
    }

    const totalFare = +(unitFare * count).toFixed(2);

    res.json({
      success: true,
      distanceKm,
      passengerCount: count,
      unitFare,
      totalFare,
      subtotalBeforeDiscount,
      discountAmount,
      calculationMethod,
      ticketType: {
        code: tt.code,
        name: tt.name,
        pricingModel: tt.pricing_model,
        badge: tt.badge
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
