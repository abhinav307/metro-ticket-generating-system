import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import BookingForm from './components/BookingForm';
import BookingsList from './components/BookingsList';
import TurnstileScanner from './components/TurnstileScanner';
import ArchitectureView from './components/ArchitectureView';
import WorkflowModal from './components/WorkflowModal';
import TicketModal from './components/TicketModal';
import { getBookings, executeBookingWorkflow } from './services/workflowSimulator';

export default function App() {
  const [activeTab, setActiveTab] = useState('book');
  const [bookings, setBookings] = useState(() => getBookings());
  const [activeTicketModal, setActiveTicketModal] = useState(null);
  const [workflowState, setWorkflowState] = useState({
    isOpen: false,
    stepData: null,
    isComplete: false,
    createdBooking: null
  });
  const [scannerPreselectedTicket, setScannerPreselectedTicket] = useState('');

  // Reload bookings from storage
  const refreshBookings = () => {
    setBookings(getBookings());
  };

  // Submit booking and trigger simulated Flow Designer
  const handleBookingSubmit = async (formData, calculation) => {
    setWorkflowState({
      isOpen: true,
      stepData: { currentStep: 1, totalSteps: 5, stepInfo: { status: 'Initializing Service Catalog submission...' } },
      isComplete: false,
      createdBooking: null
    });

    try {
      const created = await executeBookingWorkflow(formData, calculation, (progress) => {
        setWorkflowState(prev => ({
          ...prev,
          stepData: progress
        }));
      });

      setWorkflowState(prev => ({
        ...prev,
        isComplete: true,
        createdBooking: created
      }));

      refreshBookings();
    } catch (err) {
      console.error('Workflow simulation error', err);
    }
  };

  const handleFinishWorkflow = () => {
    const booking = workflowState.createdBooking;
    setWorkflowState({
      isOpen: false,
      stepData: null,
      isComplete: false,
      createdBooking: null
    });
    if (booking) {
      setActiveTicketModal(booking);
      setActiveTab('bookings');
    }
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
        bookingsCount={bookings.filter(b => b.status === 'Ticket Issued').length}
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

        {activeTab === 'scanner' && (
          <TurnstileScanner
            bookings={bookings}
            preselectedTicket={scannerPreselectedTicket}
          />
        )}

        {activeTab === 'architecture' && (
          <ArchitectureView />
        )}
      </main>

      {/* Workflow Execution Modal */}
      <WorkflowModal
        isOpen={workflowState.isOpen}
        stepData={workflowState.stepData}
        isComplete={workflowState.isComplete}
        onCompleteViewTicket={handleFinishWorkflow}
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
            Interactive Standalone Web Demo &bull; Deployable to Render Static Site
          </div>
          <div>
            Repository: <a href="https://github.com/abhinav307/metro-ticket-generating-system" target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'none' }}>abhinav307/metro-ticket-generating-system</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
