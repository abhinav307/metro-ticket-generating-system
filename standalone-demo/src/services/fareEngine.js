// Fare Engine — Faithful implementation of x_mtts.MetroFareCalculator
import { ROUTE_MATRIX, FARE_RULES, TICKET_TYPES, STATIONS } from '../data/transitData';

export function getRouteDistance(originCode, destCode) {
  if (!originCode || !destCode || originCode === destCode) return 0;
  
  const key1 = `${originCode}-${destCode}`;
  const key2 = `${destCode}-${originCode}`;

  if (ROUTE_MATRIX[key1] !== undefined) return ROUTE_MATRIX[key1];
  if (ROUTE_MATRIX[key2] !== undefined) return ROUTE_MATRIX[key2];

  // Fallback distance calculation using sequence order and line weights
  const stn1 = STATIONS.find(s => s.code === originCode);
  const stn2 = STATIONS.find(s => s.code === destCode);
  if (!stn1 || !stn2) return 5.0;

  if (stn1.line === stn2.line) {
    const orderDiff = Math.abs(stn1.order - stn2.order);
    return Math.max(2.5, +(orderDiff * 3.8).toFixed(2));
  } else {
    // Inter-line transit
    return 16.50;
  }
}

export function calculateFare(originCode, destCode, ticketTypeCode, passengerCount = 1) {
  if (!originCode || !destCode) {
    return {
      isValid: false,
      error: 'Please select both origin and destination stations.'
    };
  }

  if (originCode === destCode) {
    return {
      isValid: false,
      error: 'Origin and destination stations must be different.'
    };
  }

  const ticketType = TICKET_TYPES.find(t => t.code === ticketTypeCode) || TICKET_TYPES[0];
  const distanceKm = getRouteDistance(originCode, destCode);
  const count = Math.max(1, Math.min(6, parseInt(passengerCount, 10) || 1));

  let unitFare = 0;
  let calculationMethod = '';
  let subtotalBeforeDiscount = 0;
  let discountAmount = 0;

  if (ticketType.code === 'PASS') {
    unitFare = FARE_RULES.dailyPassPrice;
    calculationMethod = 'Flat Tariff: Fixed Unlimited All-Day Pass ($50.00)';
    subtotalBeforeDiscount = FARE_RULES.dailyPassPrice;
  } else if (ticketType.code === 'RETURN') {
    const oneWayBase = Math.max(distanceKm * FARE_RULES.ratePerKm, FARE_RULES.minimumFare);
    subtotalBeforeDiscount = +(oneWayBase * 2).toFixed(2);
    unitFare = +(oneWayBase * FARE_RULES.returnMultiplier).toFixed(2);
    discountAmount = +(subtotalBeforeDiscount - unitFare).toFixed(2);
    calculationMethod = `Distance Base ($${distanceKm.toFixed(2)} km × $${FARE_RULES.ratePerKm.toFixed(2)}) × 1.80 Multiplier (20% Return Discount)`;
  } else {
    // SINGLE
    const rawFare = distanceKm * FARE_RULES.ratePerKm;
    unitFare = +Math.max(rawFare, FARE_RULES.minimumFare).toFixed(2);
    subtotalBeforeDiscount = unitFare;
    calculationMethod = rawFare < FARE_RULES.minimumFare
      ? `Distance Base ($${rawFare.toFixed(2)}) below Minimum Fare threshold → $${FARE_RULES.minimumFare.toFixed(2)} Minimum Fare applied`
      : `Distance Base: ${distanceKm.toFixed(2)} km × $${FARE_RULES.ratePerKm.toFixed(2)} / km = $${unitFare.toFixed(2)}`;
  }

  const totalFare = +(unitFare * count).toFixed(2);

  return {
    isValid: true,
    distanceKm,
    ticketType,
    passengerCount: count,
    unitFare,
    totalFare,
    subtotalBeforeDiscount,
    discountAmount,
    calculationMethod,
    ratePerKm: FARE_RULES.ratePerKm,
    minimumFare: FARE_RULES.minimumFare
  };
}
