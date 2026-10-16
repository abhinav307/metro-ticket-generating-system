import dotenv from 'dotenv';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbDbName: process.env.MONGODB_DB_NAME || 'mtts_transit_db',
  isProduction,
  isTest: process.env.NODE_ENV === 'test',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Safety invariant: In production (NODE_ENV=production), credentials and signing secrets
  // MUST NOT fall back to hardcoded defaults. Missing variables leave credentials empty,
  // triggering fail-closed rejection for approver actions.
  // In local development and automated test modes only, defaults are supplied for zero-config testing.
  approverUsername: process.env.APPROVER_USERNAME || (isProduction ? '' : 'station_duty_manager'),
  approverPassword: process.env.APPROVER_PASSWORD || (isProduction ? '' : 'DutyManager@2026'),
  sessionSecret: process.env.SESSION_SECRET || (isProduction ? '' : 'mtts-dev-session-secret-salt-2026'),

  // Cancellation and Refund Safety Control
  // Mirrors ServiceNow system property x_mtts.cancellation.policy_status (baseline: UNCONFIGURED)
  // Prevents authorized refund calculation or financial claims until formal administrative policy activation.
  cancellationPolicyStatus: process.env.CANCELLATION_POLICY_STATUS || 'UNCONFIGURED'
};
