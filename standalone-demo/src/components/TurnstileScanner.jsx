import React, { useState, useEffect } from 'react';
import { QrCode, ShieldAlert, CheckCircle2, XCircle, Clock, Radio, Activity, RefreshCw } from 'lucide-react';
import { scanTicket, getScanEvents } from '../services/workflowSimulator';
import { verifyTicketApi, fetchScanEvents } from '../services/api';

export default function TurnstileScanner({ bookings, preselectedTicket }) {
  const [ticketInput, setTicketInput] = useState(preselectedTicket || '');
  const [gateId, setGateId] = useState('GATE-NORTH-01');
  const [scanResult, setScanResult] = useState(null);
  const [events, setEvents] = useState(() => getScanEvents());
  const [isGateOpen, setIsGateOpen] = useState(false);

  const issuedBookings = bookings.filter(b => b.status === 'Ticket Issued');
  const cancelledBookings = bookings.filter(b => b.status === 'Cancelled');

  // Load persistent scan events from PostgreSQL backend on mount
  const refreshScanHistory = async () => {
    try {
      const data = await fetchScanEvents();
      if (data && Array.isArray(data.events)) {
        setEvents(data.events);
        return;
      }
    } catch (e) {
      // offline fallback
    }
    setEvents(getScanEvents());
  };

  useEffect(() => {
    refreshScanHistory();
  }, []);

  const handleScan = async (ticketToScan) => {
    const ticket = ticketToScan || ticketInput;
    if (!ticket) return;

    try {
      const res = await verifyTicketApi({
        ticketNumber: ticket,
        gateId,
        stationCode: 'STN-01'
      });

      setScanResult({
        scanEvent: res.scanEvent,
        matchedBooking: res.matchedBooking
      });
      await refreshScanHistory();

      if (res.scanEvent && res.scanEvent.gate_status === 'OPEN') {
        setIsGateOpen(true);
        setTimeout(() => setIsGateOpen(false), 2400);
      } else {
        setIsGateOpen(false);
      }
    } catch (err) {
      if (err.data && err.data.scanEvent) {
        setScanResult({
          scanEvent: err.data.scanEvent,
          matchedBooking: err.data.matchedBooking || null
        });
        await refreshScanHistory();
        setIsGateOpen(false);
        return;
      }

      // Offline fallback to local engine
      console.warn('[MTTS] Turnstile scanner REST API unreachable, using local fallback:', err.message);
      const result = scanTicket(ticket, gateId);
      setScanResult(result);
      setEvents(getScanEvents());

      if (result.scanEvent.gate_status === 'OPEN') {
        setIsGateOpen(true);
        setTimeout(() => setIsGateOpen(false), 2400);
      } else {
        setIsGateOpen(false);
      }
    }
  };

  const handleQuickSelect = (tkt) => {
    setTicketInput(tkt);
    handleScan(tkt);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '28px' }}>
      {/* Left Column: Turnstile Scanner Hardware Interface */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2>
              <Radio size={22} className="text-sky-400" />
              <span>Turnstile Scanner Validation Terminal</span>
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              ServiceNow REST API Simulation: <code>POST /api/x_mtts/scanner/verify-ticket</code>
            </p>
          </div>
          <span className="scope-badge">Turnstile Service Role: x_mtts.scanner</span>
        </div>

        {/* Turnstile Visual Simulator */}
        <div className="turnstile-stage">
          <div className={`scanner-led ${isGateOpen ? 'unlocked' : ''}`}></div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isGateOpen ? '#34d399' : '#f87171', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {isGateOpen ? '● TURNSTILE UNLOCKED — BOARDING AUTHORIZED' : '● TURNSTILE LOCKED — SCAN TICKET'}
          </div>

          <div className="gate-visual-box">
            <div className="gate-post"></div>
            <div className={`gate-barrier ${isGateOpen ? 'open' : ''}`}></div>
            <div className="gate-post"></div>
          </div>

          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Location: <strong>Central Terminus (STN-01)</strong> • Turnstile: <strong>{gateId}</strong>
          </div>
        </div>

        {/* Scan Input Controls */}
        <div className="form-group">
          <label className="form-label">
            <span>Ticket Number or Bearer Token <span className="req">*</span></span>
            <span className="text-xs text-slate-400">Scan payload string or TKT-YYYYMMDD-XXXXX</span>
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              className="form-input"
              value={ticketInput}
              onChange={(e) => setTicketInput(e.target.value)}
              placeholder="e.g. TKT-20261016-00008"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleScan()}
            >
              <QrCode size={18} />
              <span>Verify</span>
            </button>
          </div>
        </div>

        {/* Quick Test Chips */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, marginBottom: '8px' }}>
            Quick Verification Presets (Click to Scan):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {issuedBookings.slice(0, 3).map((b) => (
              <button
                key={b.id}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleQuickSelect(b.ticket_number)}
                title={`Scan valid ticket for ${b.commuter_name}`}
              >
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span>{b.ticket_number} (Valid)</span>
              </button>
            ))}

            {cancelledBookings.length > 0 && (
              <button
                type="button"
                className="btn btn-outline-danger btn-sm"
                onClick={() => handleQuickSelect(cancelledBookings[0].ticket_number || cancelledBookings[0].booking_reference)}
                title="Scan a cancelled ticket to test turnstile gate rejection"
              >
                <XCircle size={13} />
                <span>{cancelledBookings[0].ticket_number || 'Cancelled Ticket'} (Cancelled)</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171' }}
              onClick={() => handleQuickSelect('TKT-FORGED-TOKEN-99999')}
              title="Scan a non-existent or forged ticket"
            >
              <ShieldAlert size={13} />
              <span>TKT-FORGED-99999 (Forgery Test)</span>
            </button>
          </div>
        </div>

        {/* HTTP Outcome Box */}
        {scanResult && (
          <div style={{
            background: scanResult.scanEvent.http_code === 200 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${scanResult.scanEvent.http_code === 200 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            borderRadius: '10px',
            padding: '16px',
            animation: 'fadeIn 0.2s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {scanResult.scanEvent.http_code === 200 ? (
                  <CheckCircle2 size={20} className="text-emerald-400" />
                ) : (
                  <XCircle size={20} className="text-rose-400" />
                )}
                <strong style={{ fontSize: '1rem', color: scanResult.scanEvent.http_code === 200 ? '#34d399' : '#fb7185' }}>
                  HTTP {scanResult.scanEvent.http_code}: {scanResult.scanEvent.outcome}
                </strong>
              </div>
              <span className="mono-text" style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                {scanResult.scanEvent.response_time_ms}ms latency
              </span>
            </div>
            <p style={{ fontSize: '0.86rem', color: '#e2e8f0', marginBottom: '8px' }}>
              {scanResult.scanEvent.message}
            </p>
            <div className="mono-text" style={{ fontSize: '0.72rem', color: '#64748b', wordBreak: 'break-all' }}>
              Checksum: {scanResult.scanEvent.checksum}
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Turnstile Scan Audit Trail (x_mtts_scan_event) */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2>
              <Activity size={22} className="text-sky-400" />
              <span>Turnstile Audit Trail</span>
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              ServiceNow Table: <code>x_mtts_scan_event</code> • Append-Only Log
            </p>
          </div>
          <span className="card-header-badge">{events.length} Scans</span>
        </div>

        <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '14px' }}>
          Every turnstile verification generates an immutable audit record containing correlation ID, turnstile gate, outcome, execution latency, and non-repudiation checksum.
        </p>

        <div className="table-responsive" style={{ maxHeight: '420px', overflowY: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Ticket</th>
                <th>Outcome</th>
                <th>Gate</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td className="mono-text" style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {ev.scan_timestamp.slice(11)}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{ev.ticket_number}</div>
                    <div className="mono-text" style={{ fontSize: '0.68rem', color: '#64748b' }}>
                      {ev.correlation_id.slice(0, 16)}...
                    </div>
                  </td>
                  <td>
                    <span className={`status-badge ${ev.http_code === 200 ? 'issued' : 'cancelled'}`} style={{ fontSize: '0.7rem' }}>
                      {ev.outcome}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                    {ev.gate_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
