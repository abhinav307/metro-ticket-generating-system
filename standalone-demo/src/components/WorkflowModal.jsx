import React from 'react';
import { Loader2, CheckCircle, Terminal, ShieldAlert, ArrowRight } from 'lucide-react';

export default function WorkflowModal({ isOpen, stepData, isComplete, onCompleteViewTicket }) {
  if (!isOpen) return null;

  const steps = [
    { num: 1, title: 'Service Catalog Submission (sc_req_item)' },
    { num: 2, title: 'Financial Snapshotting (BR_Booking_FinancialSnapshot)' },
    { num: 3, title: 'Station Approver Review (sysapproval_approver)' },
    { num: 4, title: 'Fulfillment & QR Token Hashing (MetroTicketGenerator)' },
    { num: 5, title: 'Notification Queued (sysevent_register: x_mtts.ticket.generated)' }
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
                  ServiceNow Flow Designer Simulation
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  Execution Context: <code>x_mtts.MetroBookingApprovalAndFulfillmentFlow</code>
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span className="scope-badge">
                Step {currentStepNum} of {steps.length}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{ width: '100%', height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden', marginBottom: '20px' }}>
            <div
              style={{
                width: `${(currentStepNum / steps.length) * 100}%`,
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

          {/* Bottom Controls */}
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              GlideRecord mutation committed to in-browser storage.
            </div>

            {isComplete ? (
              <button
                type="button"
                className="btn btn-success"
                onClick={onCompleteViewTicket}
              >
                <span>View Issued Digital QR Pass</span>
                <ArrowRight size={16} />
              </button>
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
