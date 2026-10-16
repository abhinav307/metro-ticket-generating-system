import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import BookingForm from './components/BookingForm';
import BookingsList from './components/BookingsList';
import ApproverPortal from './components/ApproverPortal';
import TurnstileScanner from './components/TurnstileScanner';
import ArchitectureView from './components/ArchitectureView';
import WorkflowModal from './components/WorkflowModal';
import TicketModal from './components/TicketModal';
import { getBookings, executeBookingWorkflow } from './services/workflowSimulator';
import { fetchBookings, createBookingApi, fetchHealth } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('book');
  const [bookings, setBookings] = useState(() => getBookings());
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [backendStatus, setBackendStatus] = useState(null);
  const [activeTicketModal, setActiveTicketModal] = useState(null);
  const [workflowState, setWorkflowState] = useState({
    isOpen: false,
    stepData: null,
    isComplete: false,
    createdBooking: null
  });
  const [scannerPreselectedTicket, setScannerPreselectedTicket] = useState('');

  // Count pending bookings across state
  const calculatePendingCount = (items) => {
    if (!Array.isArray(items)) return 0;
    return items.filter(b => b.status === 'Pending' || b.status === 'Pending Approval' || b.display_status === 'Pending Approval').length;
  };

  // Reload bookings from backend REST API (with localStorage fallback)
  const refreshBookings = async () => {
    try {
      const data = await fetchBookings();
      if (data && Array.isArray(data.bookings)) {
        setBookings(data.bookings);
        setPendingApprovalsCount(calculatePendingCount(data.bookings));
        return;
      }
    } catch (err) {
      console.warn('[MTTS] Could not fetch bookings from REST API, using local storage cache:', err.message);
    }
    const local = getBookings();
    setBookings(local);
    setPendingApprovalsCount(calculatePendingCount(local));
  };

  // Check backend health on initial mount
  useEffect(() => {
    fetchHealth()
      .then(info => {
        setBackendStatus(info);
      })
      .catch(err => {
        setBackendStatus({ status: 'offline', error: err.message });
      });
    refreshBookings();
  }, []);

  // Submit booking and trigger simulated Flow Designer & REST API persistence in Pending state
  const handleBookingSubmit = async (formData, calculation) => {
    setWorkflowState({
      isOpen: true,
      stepData: { currentStep: 1, totalSteps: 3, stepInfo: { status: 'Initializing Service Catalog submission...' } },
      isComplete: false,
      createdBooking: null
    });

    try {
      // Persist authoritatively via Express REST API to MongoDB
      let savedBooking = null;
      try {
        const apiRes = await createBookingApi(formData);
        if (apiRes && apiRes.booking) {
          savedBooking = apiRes.booking;
        }
      } catch (apiErr) {
        console.warn('[MTTS] Backend API persistence failed, using local simulation result:', apiErr.message);
      }

      // Execute visual journey across Service Catalog & Flow Designer state guards
      const localBooking = await executeBookingWorkflow(formData, calculation, (progress) => {
        setWorkflowState(prev => ({
          ...prev,
          stepData: progress
        }));
      });

      const finalBooking = savedBooking || localBooking;

      setWorkflowState(prev => ({
        ...prev,
        isComplete: true,
        createdBooking: finalBooking
      }));

      await refreshBookings();
    } catch (err) {
      console.error('Workflow submission error', err);
    }
  };

  const handleCloseWorkflowToBookings = () => {
    setWorkflowState({
      isOpen: false,
      stepData: null,
      isComplete: false,
      createdBooking: null
    });
    setActiveTab('bookings');
  };

  const handleOpenApproverFromWorkflow = () => {
    setWorkflowState({
      isOpen: false,
      stepData: null,
      isComplete: false,
      createdBooking: null
    });
    setActiveTab('approvals');
  };

  const handleTestInScanner = (booking) => {
    setActiveTicketModal(null);
    setScannerPreselectedTicket(booking.ticket_number || booking.booking_reference);
    setActiveTab('scanner');
  };

  return (
    <div className="app-container">
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        bookingsCount={bookings.filter(b => (b.status === 'Ticket Issued' || b.status === 'Generated' || b.display_status === 'Ticket Issued') && b.ticket_number).length}
        pendingApprovalsCount={pendingApprovalsCount}
        backendStatus={backendStatus}
      />

      {/* Main Content View */}
      <main className="main-content">
        {activeTab === 'book' && (
          <BookingForm onSubmitBooking={handleBookingSubmit} />
        )}

        {activeTab === 'bookings' && (
          <BookingsList
            bookings={bookings}
            onSelectTicket={(b) => setActiveTicketModal(b)}
            onBookingsUpdated={refreshBookings}
          />
        )}

        {activeTab === 'approvals' && (
          <ApproverPortal
            onBookingApproved={refreshBookings}
            onPendingCountChange={(cnt) => setPendingApprovalsCount(cnt)}
          />
        )}

        {activeTab === 'scanner' && (
          <TurnstileScanner
            bookings={bookings}
            preselectedTicket={scannerPreselectedTicket}
          />
        )}

        {activeTab === 'architecture' && (
          <ArchitectureView backendStatus={backendStatus} />
        )}
      </main>

      {/* Workflow Execution Modal */}
      <WorkflowModal
        isOpen={workflowState.isOpen}
        stepData={workflowState.stepData}
        isComplete={workflowState.isComplete}
        createdBooking={workflowState.createdBooking}
        onCompleteViewBookings={handleCloseWorkflowToBookings}
        onOpenApproverPortal={handleOpenApproverFromWorkflow}
      />

      {/* Digital QR Ticket Pass Modal */}
      {activeTicketModal && (
        <TicketModal
          booking={activeTicketModal}
          onClose={() => setActiveTicketModal(null)}
          onTestInScanner={handleTestInScanner}
        />
      )}

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-color)', padding: '24px 20px', textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <strong>Metro Ticket Generating System (MTTS)</strong> &bull; Scoped Application <code>x_mtts</code>
          </div>
          <div>
            Full-Stack Web App &bull; Render Web Service + MongoDB Atlas Persistent Storage
          </div>
          <div>
            Repository: <a href="https://github.com/abhinav307/metro-ticket-generating-system" target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'none' }}>abhinav307/metro-ticket-generating-system</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
