import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeftRight, Calendar, User, Mail, Users, Calculator, Shield, Sparkles, CheckCircle2 } from 'lucide-react';
import { STATIONS, TICKET_TYPES } from '../data/transitData';
import { calculateFare } from '../services/fareEngine';
import { fetchStations } from '../services/api';

export default function BookingForm({ onSubmitBooking }) {
  const [stations, setStations] = useState(STATIONS);
  const [sourceCode, setSourceCode] = useState('STN-01');
  const [destCode, setDestCode] = useState('STN-05');
  const [travelDate, setTravelDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [ticketTypeCode, setTicketTypeCode] = useState('RETURN');
  const [passengerCount, setPassengerCount] = useState(2);
  const [commuterName, setCommuterName] = useState('Alex Rivera');
  const [commuterEmail, setCommuterEmail] = useState('alex.rivera@metro.internal');

  // Load transit stations from Express REST backend / PostgreSQL
  useEffect(() => {
    fetchStations()
      .then(data => {
        if (data && Array.isArray(data.stations) && data.stations.length > 0) {
          setStations(data.stations);
        }
      })
      .catch(() => {});
  }, []);

  // Live dynamic fare calculation
  const fareResult = useMemo(() => {
    return calculateFare(sourceCode, destCode, ticketTypeCode, passengerCount);
  }, [sourceCode, destCode, ticketTypeCode, passengerCount]);

  const handleSwapStations = () => {
    const temp = sourceCode;
    setSourceCode(destCode);
    setDestCode(temp);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!fareResult.isValid) return;

    onSubmitBooking({
      sourceStationCode: sourceCode,
      destinationStationCode: destCode,
      travelDate,
      ticketTypeCode,
      passengerCount,
      commuterName,
      commuterEmail
    }, fareResult);
  };

  return (
    <div className="booking-layout-grid">
      {/* Left Column: Booking Form */}
      <div className="card">
        <div className="card-header">
          <h2>
            <Sparkles size={22} className="text-sky-400" />
            <span>Service Catalog: Metro Ticket Booking</span>
          </h2>
          <span className="card-header-badge">sc_cat_item • Desktop &amp; Mobile</span>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Station Selector Box */}
          <div className="form-group">
            <div className="form-label">
              <span>Origin &amp; Destination Stations <span className="req">*</span></span>
              <span className="text-xs text-slate-400">Canonical Stations (x_mtts_station)</span>
            </div>

            <div className="route-selector-box">
              <div className="route-connector-line"></div>

              {/* Origin Station */}
              <div className="station-input-row" style={{ marginBottom: '14px' }}>
                <div className="station-dot origin" title="Departure Station"></div>
                <div style={{ flex: 1 }}>
                  <select
                    className="form-select"
                    value={sourceCode}
                    onChange={(e) => setSourceCode(e.target.value)}
                    required
                  >
                    {stations.map((stn) => (
                      <option key={`src-${stn.code}`} value={stn.code}>
                        {stn.name} ({stn.code}) — {stn.line} ({stn.zone})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Swap Button */}
              <button
                type="button"
                className="swap-route-btn"
                onClick={handleSwapStations}
                title="Swap Origin and Destination"
              >
                <ArrowLeftRight size={16} />
              </button>

              {/* Destination Station */}
              <div className="station-input-row">
                <div className="station-dot dest" title="Arrival Station"></div>
                <div style={{ flex: 1 }}>
                  <select
                    className="form-select"
                    value={destCode}
                    onChange={(e) => setDestCode(e.target.value)}
                    required
                  >
                    {stations.map((stn) => (
                      <option key={`dest-${stn.code}`} value={stn.code}>
                        {stn.name} ({stn.code}) — {stn.line} ({stn.zone})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {!fareResult.isValid && (
              <p style={{ color: '#fb7185', fontSize: '0.82rem', marginTop: '8px' }}>
                {fareResult.error}
              </p>
            )}
          </div>

          {/* Travel Date & Commuter Details */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                <span>Travel Date <span className="req">*</span></span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="date"
                  className="form-input"
                  value={travelDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setTravelDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                <span>Passenger Headcount <span className="req">*</span></span>
                <span className="text-xs text-slate-400">Max 6 per booking</span>
              </label>
              <div className="passenger-selector">
                {[1, 2, 3, 4, 5, 6].map((num) => (
                  <button
                    key={num}
                    type="button"
                    className={`passenger-btn ${passengerCount === num ? 'selected' : ''}`}
                    onClick={() => setPassengerCount(num)}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Ticket Type Selector */}
          <div className="form-group">
            <div className="form-label">
              <span>Ticket Type <span className="req">*</span></span>
              <span className="text-xs text-slate-400">x_mtts_ticket_type</span>
            </div>

            <div className="ticket-type-grid">
              {TICKET_TYPES.map((type) => (
                <div
                  key={type.code}
                  className={`ticket-type-card ${ticketTypeCode === type.code ? 'selected' : ''}`}
                  onClick={() => setTicketTypeCode(type.code)}
                >
                  <div>
                    <div className="ticket-type-card-head">
                      <span className="ticket-type-name">{type.name}</span>
                      <span className="type-pill">{type.badge}</span>
                    </div>
                    <p className="ticket-type-desc">{type.description}</p>
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#38bdf8', fontWeight: 600 }}>
                    {type.code === 'PASS' ? '$50.00 Flat Rate' : type.code === 'RETURN' ? '1.8x Distance Rate' : '$2.50 / km (Min $10)'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Commuter Information */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                <span>Commuter Full Name <span className="req">*</span></span>
              </label>
              <input
                type="text"
                className="form-input"
                value={commuterName}
                onChange={(e) => setCommuterName(e.target.value)}
                placeholder="e.g. Alex Rivera"
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                <span>Notification Email <span className="req">*</span></span>
              </label>
              <input
                type="email"
                className="form-input"
                value={commuterEmail}
                onChange={(e) => setCommuterEmail(e.target.value)}
                placeholder="e.g. commuter@example.com"
                required
              />
            </div>
          </div>

          {/* Submit Action */}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '1.05rem' }}
            disabled={!fareResult.isValid}
          >
            <Sparkles size={18} />
            <span>Submit Booking to Service Catalog &amp; Generate QR</span>
          </button>
        </form>
      </div>

      {/* Right Column: Live Dynamic Fare Breakdown & Security Snapshot */}
      <div>
        <div className="fare-summary-panel">
          <div>
            <h3 className="summary-heading">
              <Calculator size={20} className="text-sky-400" />
              <span>Real-Time Tariff Breakdown</span>
            </h3>

            <div className="calculation-lines">
              <div className="calc-row">
                <span>Origin Station:</span>
                <strong>{STATIONS.find(s => s.code === sourceCode)?.name}</strong>
              </div>
              <div className="calc-row">
                <span>Destination Station:</span>
                <strong>{STATIONS.find(s => s.code === destCode)?.name}</strong>
              </div>
              <div className="calc-row">
                <span>Official Track Distance:</span>
                <strong>{fareResult.isValid ? `${fareResult.distanceKm.toFixed(2)} km` : '—'}</strong>
              </div>
              <div className="calc-row">
                <span>Selected Fare Model:</span>
                <strong>{fareResult.ticketType?.name || '—'}</strong>
              </div>
              <div className="calc-row">
                <span>Passenger Count:</span>
                <strong>{passengerCount} {passengerCount === 1 ? 'Passenger' : 'Passengers'}</strong>
              </div>

              <div className="calc-divider"></div>

              <div className="calc-row">
                <span>Base Unit Fare:</span>
                <strong>${fareResult.isValid ? fareResult.unitFare.toFixed(2) : '0.00'}</strong>
              </div>

              {fareResult.discountAmount > 0 && (
                <div className="calc-row discount">
                  <span>Round-Trip Multiplier Discount:</span>
                  <strong>-${(fareResult.discountAmount * passengerCount).toFixed(2)}</strong>
                </div>
              )}
            </div>

            {/* Total Fare Display Box */}
            <div className="calc-total-box">
              <div>
                <div className="total-label">Total Authorized Fare</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Authoritative BR_Booking_FinancialSnapshot calculation
                </div>
              </div>
              <div className="total-amount">
                ${fareResult.isValid ? fareResult.totalFare.toFixed(2) : '0.00'}
              </div>
            </div>

            {/* Platform Integrity Note */}
            <div className="calc-audit-note">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontWeight: 600, marginBottom: '4px' }}>
                <Shield size={14} />
                <span>ServiceNow Financial Tamper Protection</span>
              </div>
              <p>
                Client-side calculations are advisory. Upon submission, <code>BR_Booking_FinancialSnapshot</code> recalculates and commits unalterable financial fields to <code>x_mtts_booking_ticket</code>.
              </p>
            </div>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.78rem', color: '#94a3b8' }}>
            <strong>Calculation Proof:</strong><br />
            {fareResult.calculationMethod || 'Select route to inspect formula'}
          </div>
        </div>
      </div>
    </div>
  );
}
