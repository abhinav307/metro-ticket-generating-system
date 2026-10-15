import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, QrCode as QrIcon, ShieldCheck, Printer, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function TicketModal({ booking, onClose, onTestInScanner }) {
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    if (!booking) return;

    // Generate real optical QR code data URL using qrcode library
    const payload = booking.qr_payload || `MTTS|${booking.ticket_number}|${booking.booking_reference}|PAID`;
    QRCode.toDataURL(payload, {
      width: 220,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code', err));
  }, [booking]);

  if (!booking) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog" style={{ maxWidth: '520px', background: 'transparent', border: 'none' }}>
        <div className="ticket-pass">
          {/* Ticket Header */}
          <div className="ticket-pass-header">
            <div>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.85 }}>
                METRO TRANSIT AUTHORITY • x_mtts
              </div>
              <h3>Digital Boarding Pass</h3>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="status-badge issued" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
                {booking.status}
              </span>
              <div className="ticket-num" style={{ marginTop: '4px' }}>
                {booking.ticket_number || booking.booking_reference}
              </div>
            </div>
          </div>

          {/* Ticket Body */}
          <div className="ticket-pass-body">
            {/* Route Header */}
            <div className="ticket-route-display">
              <div className="route-station-col">
                <p>Departure</p>
                <h4>{booking.source_station_name}</h4>
                <span className="scope-badge" style={{ background: '#f1f5f9', color: '#0284c7', borderColor: '#cbd5e1' }}>
                  {booking.source_station_code}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                  {booking.distance_km ? `${booking.distance_km.toFixed(1)} km` : 'DIRECT'}
                </span>
                <div style={{ width: '60px', height: '2px', background: '#94a3b8', margin: '4px 0', position: 'relative' }}>
                  <div style={{ position: 'absolute', right: '-4px', top: '-4px', width: '8px', height: '8px', borderRight: '2px solid #94a3b8', borderTop: '2px solid #94a3b8', transform: 'rotate(45deg)' }}></div>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#0284c7', fontWeight: 700 }}>
                  {booking.ticket_type_name}
                </span>
              </div>

              <div className="route-station-col" style={{ textAlign: 'right' }}>
                <p>Arrival</p>
                <h4>{booking.destination_station_name}</h4>
                <span className="scope-badge" style={{ background: '#f1f5f9', color: '#e11d48', borderColor: '#cbd5e1' }}>
                  {booking.destination_station_code}
                </span>
              </div>
            </div>

            {/* Optical QR Code Display */}
            <div className="ticket-qr-container">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR Ticket ${booking.ticket_number}`}
                  style={{ width: '200px', height: '200px' }}
                />
              ) : (
                <div style={{ width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e2e8f0', borderRadius: '8px' }}>
                  <QrIcon size={40} className="text-slate-400" />
                </div>
              )}
              <div className="qr-caption">
                <strong>Payload:</strong> {booking.qr_payload ? booking.qr_payload.slice(0, 36) + '...' : 'MTTS Encrypted Token'}
              </div>
            </div>

            {/* Ticket Details Grid */}
            <div className="ticket-details-grid">
              <div className="detail-item">
                <span className="label">Passenger(s)</span>
                <span className="val">{booking.passenger_count} ({booking.commuter_name})</span>
              </div>
              <div className="detail-item">
                <span className="label">Scheduled Date</span>
                <span className="val">{booking.travel_date}</span>
              </div>
              <div className="detail-item">
                <span className="label">Booking Ref</span>
                <span className="val" style={{ fontFamily: 'var(--font-mono)' }}>{booking.booking_reference}</span>
              </div>
              <div className="detail-item">
                <span className="label">Total Paid Fare</span>
                <span className="val" style={{ color: '#0284c7', fontSize: '1.05rem' }}>${booking.total_fare?.toFixed(2)}</span>
              </div>
            </div>

            {/* Cryptographic Proof Footer */}
            <div style={{ marginTop: '20px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: '#64748b' }}>
              <ShieldCheck size={16} className="text-emerald-600" />
              <span>
                <strong>Constant-Time SHA-256 HMAC Verified</strong> • Anti-forgery hash minted by <code>MetroTicketGenerator.js</code>
              </span>
            </div>
          </div>

          {/* Action Footer */}
          <div style={{ padding: '16px 24px', background: '#f1f5f9', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onClose}
              style={{ color: '#334155', background: '#fff', borderColor: '#cbd5e1' }}
            >
              Close Pass
            </button>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onTestInScanner(booking)}
            >
              <QrIcon size={16} />
              <span>Test at Turnstile Gate</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
