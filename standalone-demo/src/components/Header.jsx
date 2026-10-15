import React from 'react';
import { Train, Ticket, ShieldCheck, QrCode, Layers, Info } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, bookingsCount }) {
  return (
    <header className="app-header">
      {/* Simulation Disclaimer Banner */}
      <div className="demo-alert-banner">
        <span className="demo-pill">Simulated Environment</span>
        <span>
          <strong>ServiceNow MTTS Standalone Demo</strong> — Scoped Application <code>x_mtts</code> emulation running in-browser (LocalStorage & Mock GlideRuntime). No live instance connected.
        </span>
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
