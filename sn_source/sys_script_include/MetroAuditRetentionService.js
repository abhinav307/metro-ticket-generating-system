/**
 * MetroAuditRetentionService.js
 * 
 * Scoped Application: x_mtts
 * Script Include: MetroAuditRetentionService
 * Client Callable: false
 * Active: true
 * 
 * Authoritative lifecycle management and data retention service for x_mtts_scan_event audit records.
 * 
 * Governance & Safety Gates:
 * 1. Default Inactive State:
 *    - Controlled by property 'x_mtts.audit.retention_policy_status'.
 *    - Defaults to 'UNCONFIGURED'.
 *    - Prohibits automated deletions, purges, or resets until formal stakeholder sign-off.
 * 2. Parameterized Retention Window:
 *    - Controlled by property 'x_mtts.audit.retention_days'.
 *    - Requires positive integer > 0 when policy is ACTIVE.
 * 3. Access Control Enforcement:
 *    - Strictly restricted to administrators possessing 'x_mtts.admin' and automated scheduled jobs.
 *    - Rejected with UNAUTHORIZED if invoked by passengers, approvers, or turnstile scanners.
 * 4. Audit Trail Logging:
 *    - All cleanup actions log administrative audit entries with execution timestamp, cutoff, and record counts.
 */
var MetroAuditRetentionService = Class.create();

MetroAuditRetentionService.prototype = {
    initialize: function() {
        this.logPrefix = '[x_mtts:MetroAuditRetentionService] ';
    },

    /**
     * Cleans expired turnstile scan event records older than the approved retention threshold.
     * Evaluates governance safety gates and caller authorization before taking any deletion action.
     * 
     * @param {Boolean} dryRun If true, computes eligible records without modifying or deleting data.
     * @returns {Object} Structured execution summary { success, code, message, eligibleCount, deletedCount }
     */
    cleanExpiredScanEvents: function(dryRun) {
        // 1. Role & Access Authorization Check
        if (!this._isAuthorizedAdmin()) {
            gs.warn(this.logPrefix + 'Unauthorized attempt to invoke audit retention service by user: ' + gs.getUserID());
            return {
                success: false,
                code: 'UNAUTHORIZED',
                message: 'Retention and purge operations are restricted exclusively to administrators and system scheduled jobs.',
                deletedCount: 0
            };
        }

        // 2. Governance Policy Safety Gate
        var policyStatus = gs.getProperty('x_mtts.audit.retention_policy_status', 'UNCONFIGURED');
        if (policyStatus !== 'ACTIVE') {
            gs.info(this.logPrefix + 'Retention policy status is ' + policyStatus + '. Automated deletion is disabled.');
            return {
                success: false,
                code: 'POLICY_UNCONFIGURED',
                message: 'Scan event retention policy is UNCONFIGURED. Automated deletion is disabled until formal stakeholder sign-off.',
                deletedCount: 0
            };
        }

        // 3. Validate Retention Window Parameter
        var retentionDays = parseInt(gs.getProperty('x_mtts.audit.retention_days', '0'), 10);
        if (isNaN(retentionDays) || retentionDays <= 0) {
            gs.warn(this.logPrefix + 'Invalid retention window configuration: ' + retentionDays);
            return {
                success: false,
                code: 'INVALID_RETENTION_PERIOD',
                message: 'Retention days property must be configured with a positive integer > 0.',
                deletedCount: 0
            };
        }

        // 4. Calculate Cutoff Timestamp
        var cutoff = new GlideDateTime();
        cutoff.addDaysUTC(-retentionDays);

        // 5. Query Eligible Records
        var gr = new GlideRecord('x_mtts_scan_event');
        gr.addQuery('scan_timestamp', '<', cutoff);
        gr.query();

        var eligibleIds = [];
        while (gr.next()) {
            eligibleIds.push(gr.getUniqueValue());
        }
        var eligibleCount = eligibleIds.length;

        // 6. Dry Run Simulation Mode
        if (dryRun) {
            gs.info(this.logPrefix + 'Dry-run retention check completed: ' + eligibleCount + ' records eligible for deletion older than ' + retentionDays + ' days.');
            return {
                success: true,
                code: 'DRY_RUN',
                message: 'Dry-run completed successfully. Zero records deleted.',
                eligibleCount: eligibleCount,
                deletedCount: 0,
                retentionDays: retentionDays,
                cutoffDate: cutoff.toString()
            };
        }

        // 7. Active Record Deletion
        var deletedCount = 0;
        for (var i = 0; i < eligibleIds.length; i++) {
            var delGr = new GlideRecord('x_mtts_scan_event');
            if (delGr.get(eligibleIds[i])) {
                delGr.deleteRecord();
                deletedCount++;
            }
        }

        gs.info(this.logPrefix + 'Administrative cleanup executed: ' + deletedCount + ' audit scan event records purged (retention: ' + retentionDays + ' days, cutoff: ' + cutoff.toString() + ').');

        return {
            success: true,
            code: 'CLEANUP_EXECUTED',
            message: 'Audit scan event records purged successfully.',
            deletedCount: deletedCount,
            retentionDays: retentionDays,
            cutoffDate: cutoff.toString()
        };
    },

    /**
     * Checks if current session caller possesses administrator authority.
     */
    _isAuthorizedAdmin: function() {
        return gs.hasRole('x_mtts.admin');
    },

    type: 'MetroAuditRetentionService'
};

if (typeof module !== 'undefined') {
    module.exports = MetroAuditRetentionService;
}
