import React, { useState } from 'react';
import { Ticket, QrCode, AlertTriangle, XCircle, Clock, CheckCircle2, RefreshCw, ChevronRight } from 'lucide-react';
import { cancelBooking } from '../services/workflowSimulator';

export default function BookingsList({ bookings, onSelectTicket, onBookingsUpdated }) {
  const [filter, setFilter] = useState('ALL');
  const [cancelModalBooking, setCancelModalBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('Commuter schedule change');
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState('');

  const filteredBookings = bookings.filter((b) => {
    if (filter === 'ALL') return true;
    if (filter === 'ISSUED') return b.status === 'Ticket Issued';
    if (filter === 'PENDING') return b.status === 'Pending Approval' || b.status === 'Pending';
    if (filter === 'CANCELLED') return b.status === 'Cancelled';
    return true;
  });

  const handleOpenCancel = (booking) => {
    setCancelModalBooking(booking);
    setCancelSuccessMsg('');
  };

  const handleConfirmCancel = () => {
    if (!cancelModalBooking) return;
    const res = cancelBooking(cancelModalBooking.id, cancelReason);
    if (res.success) {
      setCancelSuccessMsg(`Booking cancelled successfully. Refund of $${res.refundAmount.toFixed(2)} processed to original payment method.`);
      if (onBookingsUpdated) onBookingsUpdated();
      setTimeout(() => {
        setCancelModalBooking(null);
        setCancelSuccessMsg('');
      }, 1800);
    }
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="card-header">
        <div>
          <h2>
            <Ticket size={22} className="text-sky-400" />
            <span>My Metro Bookings</span>
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Service Portal Component: <code>widget_my_metro_bookings</code> • Real-time status tracking
          </p>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-input)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          {[
            { id: 'ALL', label: 'All' },
            { id: 'ISSUED', label: 'Ticket Issued' },
            { id: 'PENDING', label: 'Pending Approval' },
            { id: 'CANCELLED', label: 'Cancelled' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`btn btn-sm ${filter === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ border: 'none', padding: '4px 10px', fontSize: '0.78rem' }}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings Table */}
      {filteredBookings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
          <Ticket size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#94a3b8' }}>No bookings found in this category.</p>
          <p style={{ fontSize: '0.82rem' }}>Submit a ticket booking from the Service Catalog to generate your first digital pass.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Booking / Ticket No</th>
                <th>Route &amp; Line</th>
                <th>Travel Date</th>
                <th>Passengers</th>
                <th>Total Fare</th>
                <th>Lifecycle Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div style={{ fontWeight: 700, color: '#fff' }}>
                      {b.ticket_number || b.booking_reference}
                    </div>
                    {b.ticket_number && (
                      <div className="mono-text" style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        Ref: {b.booking_reference}
                      </div>
                    )}
                  </td>

                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {b.source_station_name} → {b.destination_station_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                      {b.ticket_type_name} • {b.distance_km ? `${b.distance_km.toFixed(1)} km` : 'Standard'}
                    </div>
                  </td>

                  <td>
                    <div style={{ color: '#e2e8f0' }}>{b.travel_date}</div>
                  </td>

                  <td>
                    <div>{b.passenger_count} {b.passenger_count === 1 ? 'Commuter' : 'Commuters'}</div>
                  </td>

                  <td>
                    <div style={{ fontWeight: 700, color: '#38bdf8' }}>
                      ${b.total_fare?.toFixed(2)}
                    </div>
                  </td>

                  <td>
                    <span className={`status-badge ${
                      b.status === 'Ticket Issued' ? 'issued' :
                      b.status === 'Cancelled' ? 'cancelled' : 'pending'
                    }`}>
                      {b.status === 'Ticket Issued' && <CheckCircle2 size={12} />}
                      {b.status === 'Pending Approval' && <Clock size={12} />}
                      {b.status === 'Cancelled' && <XCircle size={12} />}
                      <span>{b.status}</span>
                    </span>
                    {b.status === 'Cancelled' && b.refund_amount > 0 && (
                      <div style={{ fontSize: '0.7rem', color: '#f87171', marginTop: '2px' }}>
                        Refund: ${b.refund_amount.toFixed(2)}
                      </div>
                    )}
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      {b.status === 'Ticket Issued' && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onSelectTicket(b)}
                          title="View Digital QR Pass"
                        >
                          <QrCode size={14} />
                          <span>QR Pass</span>
                        </button>
                      )}

                      {b.status !== 'Cancelled' && (
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => handleOpenCancel(b)}
                          title="Cancel Booking & Refund"
                        >
                          <span>Cancel</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cancellation Modal (Faithfully mirrors widget_my_metro_bookings template lines 184-232) */}
      {cancelModalBooking && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: '480px' }}>
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '8px', borderRadius: '8px', color: '#f87171' }}>
                    <AlertTriangle size={22} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>Cancel Metro Booking</h3>
                    <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Ref: {cancelModalBooking.booking_reference}</p>
                  </div>
                </div>
              </div>

              {cancelSuccessMsg ? (
                <div style={{ padding: '16px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '8px', color: '#34d399', fontSize: '0.9rem' }}>
                  <p>{cancelSuccessMsg}</p>
                </div>
              ) : (
                <>
                  <div style={{ background: 'rgba(16, 25, 40, 0.6)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ color: '#94a3b8' }}>Original Total Fare:</span>
                      <strong>${cancelModalBooking.total_fare?.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ color: '#94a3b8' }}>Policy Refund Rate:</span>
                      <strong style={{ color: '#10b981' }}>80% (MetroRefundCalculator)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                      <span style={{ color: '#bae6fd' }}>Refund Amount:</span>
                      <strong style={{ color: '#38bdf8', fontSize: '1rem' }}>
                        ${(cancelModalBooking.total_fare * 0.8).toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      <span>Reason for Cancellation</span>
                    </label>
                    <select
                      className="form-select"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    >
                      <option value="Commuter schedule change">Commuter schedule change</option>
                      <option value="Booking error / incorrect station">Booking error / incorrect station</option>
                      <option value="Transit line delay notice">Transit line delay notice</option>
                      <option value="Personal travel cancellation">Personal travel cancellation</option>
                    </select>
                  </div>

                  <p style={{ fontSize: '0.75rem', color: '#f43f5e', marginBottom: '20px' }}>
                    Warning: Cancellation permanently revokes turnstile boarding privileges for Ticket {cancelModalBooking.ticket_number || cancelModalBooking.booking_reference}.
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setCancelModalBooking(null)}
                    >
                      Keep Booking
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={handleConfirmCancel}
                    >
                      Confirm Cancellation &amp; Revoke Pass
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
