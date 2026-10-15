/**
 * REST API Client for Metro Ticket Generating System (MTTS) Full-Stack Demo
 * 
 * Interacts with the Node.js/Express backend and PostgreSQL persistent store.
 * Handles visitor session isolation using the `X-Demo-Session-ID` header.
 */

const SESSION_STORAGE_KEY = 'mtts_demo_session_id';

// Retrieve or generate a visitor session identifier
export function getOrCreateSessionId() {
  let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionId) {
    const rand = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    sessionId = `demo_${rand}`;
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }
  return sessionId;
}

// Low-level fetch wrapper with session tracking and error parsing
async function apiRequest(path, options = {}) {
  const sessionId = getOrCreateSessionId();
  const headers = {
    'Content-Type': 'application/json',
    'X-Demo-Session-ID': sessionId,
    ...(options.headers || {})
  };

  const config = {
    ...options,
    headers
  };

  try {
    const res = await fetch(path, config);

    // Capture server-assigned session ID if returned
    const returnedSession = res.headers.get('X-Demo-Session-ID');
    if (returnedSession && returnedSession !== sessionId) {
      localStorage.setItem(SESSION_STORAGE_KEY, returnedSession);
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errorMsg = data?.error?.message || data?.error || `HTTP error ${res.status}`;
      const err = new Error(errorMsg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (err) {
    console.warn(`[MTTS API Warning] Request to ${path} failed:`, err.message);
    throw err;
  }
}

// 1. System Health Check
export async function fetchHealth() {
  return apiRequest('/api/health');
}

// 2. Transit Stations
export async function fetchStations() {
  return apiRequest('/api/stations');
}

// 3. Route Matrix
export async function fetchRoutes() {
  return apiRequest('/api/routes');
}

// 4. Server-Side Tariff & Fare Calculation
export async function calculateFareApi({ originCode, destCode, ticketTypeCode, passengerCount }) {
  return apiRequest('/api/fare/calculate', {
    method: 'POST',
    body: JSON.stringify({
      originCode,
      destCode,
      ticketTypeCode,
      passengerCount
    })
  });
}

// 5. Visitor Bookings Retrieval
export async function fetchBookings() {
  return apiRequest('/api/bookings');
}

// 6. Booking Creation & Cryptographic Token Minting
export async function createBookingApi(bookingPayload) {
  return apiRequest('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(bookingPayload)
  });
}

// 7. Booking Cancellation & Tariff Refund Processing
export async function cancelBookingApi(bookingId, reason) {
  return apiRequest(`/api/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  });
}

// 8. Turnstile Hardware Scanner Verification
export async function verifyTicketApi({ ticketNumber, gateId = 'GATE-NORTH-01', stationCode = 'STN-01' }) {
  return apiRequest('/api/scanner/verify', {
    method: 'POST',
    body: JSON.stringify({
      ticketNumber,
      gateId,
      stationCode
    })
  });
}

// 9. Turnstile Scan Audit Event Log
export async function fetchScanEvents() {
  return apiRequest('/api/scanner/events');
}
