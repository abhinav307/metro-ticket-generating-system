import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Unlock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  UserCheck, 
  LogOut, 
  RefreshCw, 
  Sparkles,
  Ticket,
  AlertCircle
} from 'lucide-react';
import { 
  approverLoginApi, 
  approverLogoutApi, 
  fetchApproverMeApi, 
  fetchPendingApprovalsApi, 
  approveBookingApi, 
  rejectBookingApi 
} from '../services/api';

export default function ApproverPortal({ onBookingApproved, onPendingCountChange }) {
  const isLocalHost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const [authStatus, setAuthStatus] = useState({ authenticated: false, approver: null, loading: true });
  const [loginForm, setLoginForm] = useState({ 
    username: isLocalHost ? 'station_duty_manager' : '', 
    password: isLocalHost ? 'DutyManager@2026' : '' 
  });
  const [loginError, setLoginError] = useState('');
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);

  const [pendingBookings, setPendingBookings] = useState([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);

  // Rejection modal state
  const [rejectModalBooking, setRejectModalBooking] = useState(null);
  const [rejectReason, setRejectReason] = useState('Train capacity exceeded for selected departure window');
  const [isRejecting, setIsRejecting] = useState(false);

  // Check existing approver session on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetchApproverMeApi();
      if (res && res.authenticated) {
        setAuthStatus({ authenticated: true, approver: res.approver, loading: false });
        loadPendingBookings();
        return;
      }
    } catch (err) {
      // Not authenticated
    }
    setAuthStatus({ authenticated: false, approver: null, loading: false });
  };

  const loadPendingBookings = async () => {
    setIsLoadingPending(true);
    try {
      const res = await fetchPendingApprovalsApi();
      if (res && Array.isArray(res.bookings)) {
        setPendingBookings(res.bookings);
        if (onPendingCountChange) {
          onPendingCountChange(res.bookings.length);
        }
      }
    } catch (err) {
      console.warn('[Approver Portal] Failed to load pending queue:', err.message);
    } finally {
      setIsLoadingPending(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsSubmittingLogin(true);

    try {
      const res = await approverLoginApi(loginForm);
      if (res && res.success) {
        setAuthStatus({ authenticated: true, approver: res.approver, loading: false });
        await loadPendingBookings();
        setActionFeedback({ type: 'success', text: 'Authenticated as Station Duty Approver.' });
        setTimeout(() => setActionFeedback(null), 3500);
      }
    } catch (err) {
      setLoginError(err.message || 'Invalid credentials. Please verify duty manager username and password.');
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleLogout = async () => {
    await approverLogoutApi();
    setAuthStatus({ authenticated: false, approver: null, loading: false });
    setPendingBookings([]);
    if (onPendingCountChange) onPendingCountChange(0);
  };

  const handleApprove = async (booking) => {
    try {
      const res = await approveBookingApi(booking.id);
      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          text: `Booking ${booking.booking_reference} APPROVED. Issued Ticket ${res.booking.ticket_number}. QR token minted.`
        });
        await loadPendingBookings();
        if (onBookingApproved) onBookingApproved();
      }
    } catch (err) {
      setActionFeedback({
        type: 'error',
        text: err.message || 'Failed to approve booking. Conflict or permission error.'
      });
    }
  };

  const handleOpenReject = (booking) => {
    setRejectModalBooking(booking);
    setRejectReason('Train capacity exceeded for selected departure window');
  };

  const handleConfirmReject = async () => {
    if (!rejectModalBooking) return;
    setIsRejecting(true);
    try {
      const res = await rejectBookingApi(rejectModalBooking.id, rejectReason);
      if (res && res.success) {
        setActionFeedback({
          type: 'warning',
          text: `Booking ${rejectModalBooking.booking_reference} REJECTED and Cancelled. Reason recorded: "${rejectReason}". No ticket issued.`
        });
        setRejectModalBooking(null);
        await loadPendingBookings();
        if (onBookingApproved) onBookingApproved();
      }
    } catch (err) {
      setActionFeedback({
        type: 'error',
        text: err.message || 'Failed to reject booking.'
      });
    } finally {
      setIsRejecting(false);
    }
  };

  if (authStatus.loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <RefreshCw size={24} className="animate-spin text-sky-400" style={{ margin: '0 auto 12px' }} />
        <p style={{ color: '#94a3b8' }}>Verifying approver authorization...</p>
      </div>
    );
  }

  // View A: Unauthenticated — Login Form
  if (!authStatus.authenticated) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <h2>
                <Lock size={20} className="text-sky-400" />
                <span>Station Duty Approver Workspace</span>
              </h2>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                ServiceNow Role: <code>x_mtts.approver</code> • Cryptographic Session Authentication
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} style={{ padding: '8px 0' }}>
            <div style={{ background: 'rgba(2, 132, 199, 0.08)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(2, 132, 199, 0.25)', marginBottom: '20px', fontSize: '0.82rem', color: '#cbd5e1' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 600, marginBottom: '6px' }}>
                <ShieldCheck size={16} />
                <span>Protected Station Duty Manager Access</span>
              </div>
              <p style={{ margin: 0, lineHeight: 1.5 }}>
                Authenticates Station Approvers authorized to review pending commuter requests, allocate sequential ticket numbers, and mint cryptographic QR boarding tokens.
              </p>
            </div>

            {loginError && (
              <div style={{ background: 'rgba(225, 29, 72, 0.15)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(225, 29, 72, 0.3)', color: '#fb7185', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} />
                <span>{loginError}</span>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                <span>Duty Approver Username</span>
              </label>
              <input
                type="text"
                className="form-input"
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>Approver Password</span>
              </label>
              <input
                type="password"
                className="form-input"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                required
              />
            </div>

            {isLocalHost ? (
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 12px', borderRadius: '6px', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '20px', fontFamily: 'var(--font-mono)' }}>
                Local Development Credentials: <code>station_duty_manager</code> / <code>DutyManager@2026</code>
              </div>
            ) : (
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 12px', borderRadius: '6px', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '20px' }}>
                Production Security: Enter the Station Duty Approver credentials configured via secret environment variables.
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px' }}
              disabled={isSubmittingLogin}
            >
              <UserCheck size={16} />
              <span>{isSubmittingLogin ? 'Authenticating...' : 'Authenticate as Station Duty Approver'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // View B: Authenticated Approver Queue Dashboard
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner / Session Bar */}
      <div className="card" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399' }}>
            <ShieldCheck size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#fff' }}>
                Station Duty Approver Workspace
              </h3>
              <span className="scope-badge" style={{ background: '#064e3b', color: '#34d399', borderColor: '#059669' }}>
                x_mtts.approver
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
              Authorized User: <strong>{authStatus.approver?.username}</strong> • Active Session Guard
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadPendingBookings}
            disabled={isLoadingPending}
          >
            <RefreshCw size={14} className={isLoadingPending ? 'animate-spin' : ''} />
            <span>Refresh Queue</span>
          </button>

          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            onClick={handleLogout}
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div style={{
          padding: '14px 18px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.88rem',
          background: actionFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : actionFeedback.type === 'warning' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(225, 29, 72, 0.15)',
          border: `1px solid ${actionFeedback.type === 'success' ? '#059669' : actionFeedback.type === 'warning' ? '#d97706' : '#e11d48'}`,
          color: actionFeedback.type === 'success' ? '#34d399' : actionFeedback.type === 'warning' ? '#fbbf24' : '#fb7185'
        }}>
          {actionFeedback.type === 'success' && <CheckCircle2 size={18} />}
          {actionFeedback.type === 'warning' && <AlertTriangle size={18} />}
          {actionFeedback.type === 'error' && <XCircle size={18} />}
          <span>{actionFeedback.text}</span>
        </div>
      )}

      {/* Pending Approvals Queue */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2>
              <Clock size={20} className="text-amber-400" />
              <span>Pending Booking Requests</span>
              <span className="tab-badge" style={{ marginLeft: '10px', background: '#d97706' }}>
                {pendingBookings.length}
              </span>
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              ServiceNow Table: <code>x_mtts_booking_ticket</code> • Status: <code>Pending</code> • Ticket allocation held until approved
            </p>
          </div>
        </div>

        {pendingBookings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#64748b' }}>
            <CheckCircle2 size={44} style={{ margin: '0 auto 12px', color: '#10b981', opacity: 0.8 }} />
            <p style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0' }}>Pending Approval Queue is Clear</p>
            <p style={{ fontSize: '0.82rem' }}>All submitted transit bookings have been processed. New commuter submissions will appear here for review.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Booking Reference</th>
                  <th>Commuter Details</th>
                  <th>Route &amp; Date</th>
                  <th>Ticket &amp; Tariff</th>
                  <th>Total Fare</th>
                  <th style={{ textAlign: 'right' }}>Approver Decision</th>
                </tr>
              </thead>
              <tbody>
                {pendingBookings.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                        {b.booking_reference}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        Submitted {new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{b.commuter_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{b.commuter_email}</div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {b.source_station_name} → {b.destination_station_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                        Date: {b.travel_date} ({b.distance_km ? `${b.distance_km.toFixed(1)} km` : 'Pass'})
                      </div>
                    </td>

                    <td>
                      <div>{b.ticket_type_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {b.passenger_count} {b.passenger_count === 1 ? 'Passenger' : 'Passengers'}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 700, color: '#34d399', fontSize: '1.05rem' }}>
                        ${b.total_fare?.toFixed(2)}
                      </div>
                      <span className="status-badge pending" style={{ marginTop: '4px' }}>
                        <Clock size={10} />
                        <span>Pending</span>
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-success btn-sm"
                          onClick={() => handleApprove(b)}
                          title="Approve booking and generate ticket"
                        >
                          <CheckCircle2 size={14} />
                          <span>Approve</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => handleOpenReject(b)}
                          title="Reject booking with reason"
                        >
                          <XCircle size={14} />
                          <span>Reject</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rejection Modal with Mandatory Reason */}
      {rejectModalBooking && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: '480px' }}>
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(225, 29, 72, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fb7185' }}>
                  <XCircle size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>Reject Booking Request</h4>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                    Reference: <code>{rejectModalBooking.booking_reference}</code>
                  </p>
                </div>
              </div>

              <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.5, marginBottom: '16px' }}>
                Rejecting this booking will record an administrative decision and cancel the request without issuing any ticket number or QR pass.
              </p>

              <div className="form-group">
                <label className="form-label">
                  <span>Mandatory Rejection Reason <span className="req">*</span></span>
                </label>
                <select
                  className="form-select"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  style={{ marginBottom: '10px' }}
                >
                  <option value="Train capacity exceeded for selected departure window">Train capacity exceeded for selected departure window</option>
                  <option value="Station platform maintenance on selected travel date">Station platform maintenance on selected travel date</option>
                  <option value="Duplicate booking request detected">Duplicate booking request detected</option>
                  <option value="Invalid travel schedule information">Invalid travel schedule information</option>
                  <option value="Administrative policy hold">Administrative policy hold</option>
                </select>
                <textarea
                  className="form-input"
                  rows={2}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter specific administrative reason..."
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setRejectModalBooking(null)}
                  disabled={isRejecting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleConfirmReject}
                  disabled={isRejecting || !rejectReason.trim()}
                >
                  {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
