import React from 'react';
import { Layers, CheckCircle2, ShieldCheck, Database, GitBranch, Terminal, ExternalLink } from 'lucide-react';

export default function ArchitectureView() {
  const tables = [
    { name: 'x_mtts_station', purpose: 'Station Master (Codes, names, line zones, sequence order)' },
    { name: 'x_mtts_route', purpose: 'Route Network Matrix (Origin, destination, official track distance in km)' },
    { name: 'x_mtts_ticket_type', purpose: 'Fare Products (Single Journey, Return Ticket, Daily Pass)' },
    { name: 'x_mtts_fare_rule', purpose: 'Tariff Schedule (Rate per km $2.50, Minimum fare $10.00, Multiplier 1.80x)' },
    { name: 'x_mtts_daily_sequence', purpose: 'Atomic Daily Counter for non-colliding booking and ticket numbers' },
    { name: 'x_mtts_booking_ticket', purpose: 'Core Transactional Record (Lifecycle, financial snapshot, QR token hash)' },
    { name: 'x_mtts_scan_event', purpose: 'Append-Only Turnstile Audit Log (Gate ID, outcome, cryptographic checksum)' }
  ];

  const scriptIncludes = [
    'MetroFareCalculator', 'MetroFareCalculatorAjax', 'MetroNumberFormatter',
    'MetroQRGenerator', 'MetroTicketGenerator', 'MetroBookingService',
    'MetroPortalService', 'MetroRefundCalculator', 'MetroScannerVerificationService',
    'MetroAuditRetentionService', 'MetroNotificationService', 'MetroDataMigrationService'
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Banner */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #182234 0%, #0d1522 100%)', borderColor: 'rgba(2, 132, 199, 0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
          <div style={{ background: 'rgba(2, 132, 199, 0.2)', padding: '10px', borderRadius: '12px', color: '#38bdf8' }}>
            <Layers size={28} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
              ServiceNow Scoped Application Architecture: <code>x_mtts</code>
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
              Verified Platform Implementation &bull; Status: <strong>GO — DEVELOPMENT VALIDATED, PRODUCTION PENDING</strong>
            </p>
          </div>
        </div>

        <div style={{ background: 'rgba(2, 132, 199, 0.08)', border: '1px solid rgba(2, 132, 199, 0.25)', borderRadius: '10px', padding: '16px', fontSize: '0.85rem', color: '#e2e8f0', lineHeight: 1.6 }}>
          <strong>Notice on Demonstration Reality:</strong> This web application is a standalone interactive reference demonstration designed to showcase the transit ticketing, tariff calculations, approval workflows, QR ticket generation, and turnstile validation logic of the <strong>Metro Ticket Generating System in ServiceNow</strong>. All GlideRecord and Flow Designer actions run locally in an emulated browser engine. No live ServiceNow development instance is connected.
        </div>
      </div>

      {/* Two Column Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
        {/* Left: 7 Custom Tables */}
        <div className="card">
          <div className="card-header">
            <h3>
              <Database size={20} className="text-sky-400" />
              <span>7 Canonical Database Tables (sys_db_object)</span>
            </h3>
            <span className="scope-badge">Scope: x_mtts</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {tables.map((t) => (
              <div
                key={t.name}
                style={{
                  background: 'rgba(16, 25, 40, 0.6)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '12px 14px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <code style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.85rem' }}>{t.name}</code>
                  <CheckCircle2 size={14} className="text-emerald-400" />
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{t.purpose}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Automated Test Proof & Script Includes */}
        <div className="card">
          <div className="card-header">
            <h3>
              <ShieldCheck size={20} className="text-emerald-400" />
              <span>Automated Test Proof (100% Passing)</span>
            </h3>
            <span className="status-badge issued">268 of 268 Passed</span>
          </div>

          <div style={{ background: '#090d16', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#a5f3fc', lineHeight: 1.5, marginBottom: '20px' }}>
            <div>$ node sn_source/test/run_all_tests.js</div>
            <div style={{ color: '#34d399' }}>✓ Suite 1: MetroFareCalculator Unit Tests (29 passed)</div>
            <div style={{ color: '#34d399' }}>✓ Suite 2: Number Formatter &amp; Sequence Tests (14 passed)</div>
            <div style={{ color: '#34d399' }}>✓ Suite 3: QR Generator &amp; Verification Logic (27 passed)</div>
            <div style={{ color: '#34d399' }}>✓ Suite 4: Booking, Lifecycle &amp; Refund Tests (30 passed)</div>
            <div style={{ color: '#34d399' }}>✓ Suite 5: Phase 3 UI, Catalog &amp; Portal Tests (53 passed)</div>
            <div style={{ color: '#34d399' }}>✓ Suite 6: Real Optical QR Decoding (jsQR) (33 passed)</div>
            <div style={{ color: '#34d399' }}>✓ Suite 7: Secure Scanner REST API Tests (16 passed)</div>
            <div style={{ color: '#34d399' }}>✓ Suite 8: Turnstile Verification Audit Logging (14 passed)</div>
            <div style={{ color: '#34d399' }}>✓ Suite 9: Automated Email Notifications (12 passed)</div>
            <div style={{ color: '#34d399' }}>✓ Suite 10: Master Data Migration &amp; Validation (17 passed)</div>
            <div style={{ color: '#34d399' }}>✓ Suite 11: Security Controls &amp; Full Acceptance (8 passed)</div>
            <div style={{ color: '#34d399' }}>✓ Suite 12: Phase 5 Controlled Deployment &amp; Smoke (15 passed)</div>
            <div style={{ borderTop: '1px solid #1e293b', marginTop: '8px', paddingTop: '6px', color: '#38bdf8' }}>
              TOTAL: 12 Suites | 268 Assertions Executed | 0 Failures (100%)
            </div>
          </div>

          <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '8px' }}>
            12 Scoped Script Includes (sys_script_include):
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {scriptIncludes.map((s) => (
              <span
                key={s}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  color: '#e2e8f0'
                }}
              >
                x_mtts.{s}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Fail-Closed Governance Table */}
      <div className="card">
        <div className="card-header">
          <h3>
            <Terminal size={20} className="text-amber-400" />
            <span>Active Fail-Closed Safety Invariants</span>
          </h3>
          <span className="card-header-badge">Governance Safeguards</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <div style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 700, color: '#fbbf24', fontSize: '0.82rem', marginBottom: '4px' }}>
              Cancellation Policy Status: UNCONFIGURED
            </div>
            <p style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
              Commuter cancellation is locked by default until formal commercial tariff schedules are approved by transit operations.
            </p>
          </div>

          <div style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 700, color: '#fbbf24', fontSize: '0.82rem', marginBottom: '4px' }}>
              Audit Log Retention: UNCONFIGURED (0 Days)
            </div>
            <p style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
              Turnstile scan audit records in <code>x_mtts_scan_event</code> cannot be purged automatically without formal stakeholder approval.
            </p>
          </div>

          <div style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 700, color: '#fbbf24', fontSize: '0.82rem', marginBottom: '4px' }}>
              Outbound Notifications: DISABLED (false)
            </div>
            <p style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
              Master property switch <code>x_mtts.notifications.enabled</code> prevents accidental email dispatch during pre-production verification.
            </p>
          </div>

          <div style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 700, color: '#fbbf24', fontSize: '0.82rem', marginBottom: '4px' }}>
              Authoritative Commuter Role: x_mtts.user
            </div>
            <p style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
              Standardized across all ACLs and catalog definitions. Station approver role is <code>x_mtts.approver</code>; turnstile role is <code>x_mtts.scanner</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
