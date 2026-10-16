import React from 'react';
import { Loader2, CheckCircle, Terminal, ShieldAlert, ArrowRight, Clock, ShieldCheck, Ticket } from 'lucide-react';

export default function WorkflowModal({
  isOpen,
  stepData,
  isComplete,
  createdBooking,
  onCompleteViewBookings,
  onOpenApproverPortal
}) {
  if (!isOpen) return null;

  const steps = [
    { num: 1, title: 'Service Catalog Submission (sc_req_item)' },
    { num: 2, title: 'Financial Snapshotting (BR_Booking_FinancialSnapshot)' },
    { num: 3, title: 'Queued for Station Duty Approver Review (sysapproval_approver)' }
  ];

  const currentStepNum = stepData?.currentStep || 1;

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog" style={{ maxWidth: '640px' }}>
        <div style={{ padding: '24px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'rgba(2, 132, 199, 0.2)', padding: '8px', borderRadius: '8px', color: '#38bdf8' }}>
                <Terminal size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>
                  ServiceNow Flow Designer Submission
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  Execution Context: <code>x_mtts.MetroBookingApprovalAndFulfillmentFlow</code>
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span className="scope-badge">
                Step {Math.min(currentStepNum, steps.length)} of {steps.length}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{ width: '100%', height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden', marginBottom: '20px' }}>
            <div
              style={{
                width: `${(Math.min(currentStepNum, steps.length) / steps.length) * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #0284c7, #10b981)',
                transition: 'width 0.3s ease'
              }}
            ></div>
          </div>

          {/* Step Rows */}
          <div className="workflow-steps-list">
            {steps.map((st) => {
              const isPast = st.num < currentStepNum;
              const isCurrent = st.num === currentStepNum;
              const rowClass = isPast || (isCurrent && isComplete)
                ? 'workflow-step-row completed'
                : isCurrent
                ? 'workflow-step-row active'
                : 'workflow-step-row';

              return (
                <div key={st.num} className={rowClass}>
                  <div className="step-num-circle">
                    {isPast || (isCurrent && isComplete) ? (
                      <CheckCircle size={16} />
                    ) : isCurrent ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      st.num
                    )}
                  </div>
                  <div className="step-content" style={{ flex: 1 }}>
                    <h5>{st.title}</h5>
                    {isCurrent && !isComplete && (
                      <p>{stepData?.stepInfo?.status || 'Processing platform transaction...'}</p>
                    )}
                    {isCurrent && stepData?.stepInfo?.log && (
                      <div className="log-line">
                        {stepData.stepInfo.log}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Completed State Callout */}
          {isComplete && (
            <div style={{
              marginTop: '20px',
              padding: '16px',
              borderRadius: '8px',
              background: 'rgba(2, 132, 199, 0.1)',
              border: '1px solid rgba(2, 132, 199, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 700 }}>
                <Clock size={18} />
                <span>Request Received — Held in Pending Approval</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.84rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                Booking Reference <strong>{createdBooking?.booking_reference}</strong> has been saved with authoritative fare calculation. Per transit compliance policy, ticket numbers and QR boarding tokens are issued only after an authorized Station Duty Manager reviews and approves the request.
              </p>
            </div>
          )}

          {/* Bottom Controls */}
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              GlideRecord mutation committed to persistent MongoDB.
            </div>

            {isComplete ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onOpenApproverPortal}
                >
                  <ShieldCheck size={15} />
                  <span>Open Station Approvals</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onCompleteViewBookings}
                >
                  <span>View in My Bookings</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontSize: '0.85rem', fontWeight: 600 }}>
                <Loader2 size={16} className="animate-spin" />
                <span>Simulating ServiceNow Engine...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
