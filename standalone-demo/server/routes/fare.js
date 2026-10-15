import express from 'express';
import { getCollection } from '../db/index.js';

const router = express.Router();

// Helper to look up track distance from MongoDB routes collection with sequence fallback
export async function lookupRouteDistance(originCode, destCode) {
  if (!originCode || !destCode || originCode === destCode) return 0;

  // Direct route check in routes collection
  const routesCol = getCollection('routes');
  const direct = await routesCol.findOne({
    $or: [
      { origin_station_code: originCode, destination_station_code: destCode },
      { origin_station_code: destCode, destination_station_code: originCode }
    ]
  });

  if (direct) {
    return parseFloat(direct.distance_km);
  }

  // Fallback distance calculation using station sequence orders
  const stationsCol = getCollection('stations');
  const s1 = await stationsCol.findOne({ code: originCode });
  const s2 = await stationsCol.findOne({ code: destCode });

  if (s1 && s2 && s1.line_name === s2.line_name) {
    const diff = Math.abs(s1.seq_order - s2.seq_order);
    return Math.max(2.5, +(diff * 3.8).toFixed(2));
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

    // Fetch ticket type and fare rules from MongoDB
    const ticketTypesCol = getCollection('ticket_types');
    const fareRulesCol = getCollection('fare_rules');

    const tt = await ticketTypesCol.findOne({ code: ticketTypeCode || 'SINGLE', active: true });
    if (!tt) {
      return res.status(400).json({ error: 'Invalid or inactive ticket type.' });
    }

    const fr = await fareRulesCol.findOne({ ticket_type_code: tt.code, active: true });

    const ratePerKm = parseFloat(fr?.rate_per_km || 2.50);
    const minimumFare = parseFloat(fr?.minimum_fare || 10.00);
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
