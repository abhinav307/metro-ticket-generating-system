import React from 'react';
import { Train, Ticket, ShieldCheck, QrCode, Layers, Info } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, bookingsCount, pendingApprovalsCount, backendStatus }) {
  const isBackendHealthy = backendStatus?.status === 'ok';

  return (
    <header className="app-header">
      {/* Simulation Disclaimer Banner */}
      <div className="demo-alert-banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
          <span className="demo-pill">Simulated Environment</span>
          <span style={{ flex: 1 }}>
            <strong>ServiceNow MTTS Full-Stack Demo</strong> — Scoped Application <code>x_mtts</code> emulation powered by Node.js/Express REST APIs &amp; MongoDB persistence. No live ServiceNow development instance is connected.
          </span>
          {isBackendHealthy && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#4ade80', whiteSpace: 'nowrap' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }}></span>
              REST API &amp; {backendStatus.database?.engine?.includes('atlas') ? 'MongoDB Atlas' : 'MongoDB'} Active
            </span>
          )}
        </div>
      </div>

      <div className="header-inner">
        {/* Brand */}
        <div className="brand-section">
          <div className="brand-icon-box">
            <Train size={24} />
          </div>
          <div className="brand-title-wrap">
            <h1>
              Metro Ticket Generating System
              <span className="scope-badge">x_mtts</span>
            </h1>
            <p>ServiceNow Enterprise Transit Architecture &amp; Turnstile Validation</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="nav-tabs" aria-label="Main Navigation">
          <button
            className={`nav-tab-btn ${activeTab === 'book' ? 'active' : ''}`}
            onClick={() => setActiveTab('book')}
          >
            <Ticket size={16} />
            <span>Book Ticket</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'bookings' ? 'active' : ''}`}
            onClick={() => setActiveTab('bookings')}
          >
            <Train size={16} />
            <span>My Bookings</span>
            {bookingsCount > 0 && (
              <span className="tab-badge">{bookingsCount}</span>
            )}
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'approvals' ? 'active' : ''}`}
            onClick={() => setActiveTab('approvals')}
          >
            <ShieldCheck size={16} />
            <span>Station Approvals</span>
            {pendingApprovalsCount > 0 && (
              <span className="tab-badge" style={{ background: '#d97706' }}>{pendingApprovalsCount}</span>
            )}
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'scanner' ? 'active' : ''}`}
            onClick={() => setActiveTab('scanner')}
          >
            <QrCode size={16} />
            <span>Turnstile Scanner</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'architecture' ? 'active' : ''}`}
            onClick={() => setActiveTab('architecture')}
          >
            <Layers size={16} />
            <span>Architecture &amp; Proof</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
