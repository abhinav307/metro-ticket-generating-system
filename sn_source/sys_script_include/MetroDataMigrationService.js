/**
 * MetroDataMigrationService.js
 * 
 * Scoped Application: x_mtts
 * Script Include: MetroDataMigrationService
 * Client Callable: false
 * Active: true
 * 
 * Production-ready master data validation, transformation, and idempotent migration engine.
 * Validates transit networks, fare schedules, and route matrices before database commits.
 * 
 * Core Capabilities:
 * 1. Pre-flight integrity validation:
 *    - Detects duplicate station codes, orphan foreign keys, and self-looping routes.
 *    - Validates route distances (> 0.00 km) and flags zero or negative distances.
 *    - Validates fare rule date periods, preventing overlapping active windows.
 *    - Verifies Distance_Based rules have rate/minimum fares, and Fixed Pass rules have fixed fares.
 * 2. Idempotent Upsert:
 *    - Running migration repeatedly never creates duplicate records; updates or skips cleanly.
 * 3. Synthetic Fixture vs Production Data Separation:
 *    - Explicitly tags dataset origins as DEVELOPMENT_FIXTURE vs PRODUCTION_AUTHORITY.
 *    - Prohibits treating unverified sample fixtures as production data.
 */
var MetroDataMigrationService = Class.create();

MetroDataMigrationService.prototype = {
    initialize: function() {
        this.logPrefix = '[x_mtts:MetroDataMigrationService] ';
    },

    /**
     * Executes comprehensive pre-flight validation on raw master-data fixtures.
     * @param {Object} fixtures Master data dataset containing stations, ticketTypes, fareRules, routes
     * @returns {Object} Validation report { valid: boolean, errors: Array, warnings: Array, statistics: Object }
     */
    validateMasterData: function(fixtures) {
        fixtures = fixtures || {};
        var report = {
            valid: true,
            errors: [],
            warnings: [],
            statistics: {
                stationsChecked: 0,
                ticketTypesChecked: 0,
                routesChecked: 0,
                fareRulesChecked: 0
            }
        };

        var stations = fixtures.stations || [];
        var ticketTypes = fixtures.ticketTypes || [];
        var routes = fixtures.routes || [];
        var fareRules = fixtures.fareRules || [];

        var stationCodeMap = {};
        var ticketTypeMap = {};

        // 1. Validate Stations
        for (var s = 0; s < stations.length; s++) {
            report.statistics.stationsChecked++;
            var stn = stations[s];
            if (!stn.station_code) {
                report.errors.push('Station at index ' + s + ' missing station_code.');
                report.valid = false;
            } else if (stationCodeMap[stn.station_code]) {
                report.errors.push('Duplicate station_code detected: ' + stn.station_code);
                report.valid = false;
            } else {
                stationCodeMap[stn.station_code] = stn;
            }

            if (!stn.name || typeof stn.name !== 'string' || stn.name.trim() === '') {
                report.errors.push('Station ' + (stn.station_code || s) + ' has empty or invalid name.');
                report.valid = false;
            }
            if (stn.active === false) {
                report.warnings.push('Station ' + stn.station_code + ' is flagged inactive (development fixture or decommissioned).');
            }
        }

        // 2. Validate Ticket Types
        for (var t = 0; t < ticketTypes.length; t++) {
            report.statistics.ticketTypesChecked++;
            var tt = ticketTypes[t];
            if (!tt.code) {
                report.errors.push('Ticket type at index ' + t + ' missing code.');
                report.valid = false;
            } else if (ticketTypeMap[tt.code]) {
                report.errors.push('Duplicate ticket type code: ' + tt.code);
                report.valid = false;
            } else {
                ticketTypeMap[tt.code] = tt;
            }

            if (tt.pricing_model !== 'Distance_Based' && tt.pricing_model !== 'Fixed') {
                report.errors.push('Ticket type ' + tt.code + ' has unsupported pricing_model: ' + tt.pricing_model);
                report.valid = false;
            }
            if (!tt.validity_hours || parseInt(tt.validity_hours, 10) <= 0) {
                report.errors.push('Ticket type ' + tt.code + ' has invalid validity_hours.');
                report.valid = false;
            }
        }

        // 3. Validate Routes
        var routePairMap = {};
        for (var r = 0; r < routes.length; r++) {
            report.statistics.routesChecked++;
            var rt = routes[r];
            var orig = rt.origin_station;
            var dest = rt.destination_station;

            if (!orig || !dest) {
                report.errors.push('Route at index ' + r + ' missing origin or destination station.');
                report.valid = false;
                continue;
            }

            if (orig === dest) {
                report.errors.push('Route self-loop detected: origin and destination are identical (' + orig + ').');
                report.valid = false;
            }

            if (!stationCodeMap[orig]) {
                report.errors.push('Route references unknown origin station_code: ' + orig);
                report.valid = false;
            }
            if (!stationCodeMap[dest]) {
                report.errors.push('Route references unknown destination station_code: ' + dest);
                report.valid = false;
            }

            var pairKey = orig + '->' + dest;
            if (routePairMap[pairKey]) {
                report.errors.push('Duplicate route pair detected: ' + pairKey);
                report.valid = false;
            } else {
                routePairMap[pairKey] = true;
            }

            var dist = parseFloat(rt.distance_km);
            if (isNaN(dist) || dist <= 0.0) {
                report.errors.push('Route ' + pairKey + ' has invalid or non-positive distance: ' + rt.distance_km);
                report.valid = false;
            }
        }

        // 4. Validate Fare Rules
        var fareRuleTypeWindows = {};
        for (var f = 0; f < fareRules.length; f++) {
            report.statistics.fareRulesChecked++;
            var fr = fareRules[f];
            var typeCode = fr.ticket_type_code || fr.ticket_type;

            if (!typeCode || !ticketTypeMap[typeCode]) {
                report.errors.push('Fare rule at index ' + f + ' references invalid ticket type: ' + typeCode);
                report.valid = false;
                continue;
            }

            var targetType = ticketTypeMap[typeCode];
            if (targetType.pricing_model === 'Distance_Based') {
                var rate = parseFloat(fr.rate_per_km);
                var minFare = parseFloat(fr.minimum_fare);
                if (isNaN(rate) || rate <= 0) {
                    report.errors.push('Distance-based fare rule for ' + typeCode + ' requires positive rate_per_km.');
                    report.valid = false;
                }
                if (isNaN(minFare) || minFare <= 0) {
                    report.errors.push('Distance-based fare rule for ' + typeCode + ' requires positive minimum_fare.');
                    report.valid = false;
                }
            } else if (targetType.pricing_model === 'Fixed') {
                var fixedFare = parseFloat(fr.fixed_fare);
                if (isNaN(fixedFare) || fixedFare <= 0) {
                    report.errors.push('Fixed fare rule for ' + typeCode + ' requires positive fixed_fare.');
                    report.valid = false;
                }
            }

            // Currency code validation
            if (fr.currency && (!/^[A-Z]{3}$/.test(fr.currency))) {
                report.errors.push('Fare rule ' + fr.rule_code + ' specifies invalid currency code: ' + fr.currency + '. Must be 3-letter ISO-4217 code.');
                report.valid = false;
            }

            // Date period check
            if (fr.effective_from && fr.effective_to) {
                if (fr.effective_from > fr.effective_to) {
                    report.errors.push('Fare rule ' + fr.rule_code + ' effective_from (' + fr.effective_from + ') is after effective_to (' + fr.effective_to + ').');
                    report.valid = false;
                }
            }

            // Check overlapping windows
            var windows = fareRuleTypeWindows[typeCode] || [];
            var frFrom = fr.effective_from || '1970-01-01';
            var frTo = fr.effective_to || '9999-12-31';

            for (var w = 0; w < windows.length; w++) {
                var win = windows[w];
                // Overlap condition: (StartA <= EndB) and (EndA >= StartB)
                if (frFrom <= win.to && frTo >= win.from && fr.active && win.active) {
                    report.errors.push('Conflicting active fare rule date ranges detected for ' + typeCode + ' between ' + fr.rule_code + ' and ' + win.ruleCode);
                    report.valid = false;
                }
            }
            windows.push({ from: frFrom, to: frTo, active: !!fr.active, ruleCode: fr.rule_code });
            fareRuleTypeWindows[typeCode] = windows;
        }

        return report;
    },

    /**
     * Executes safe, idempotent migration of master data into target tables.
     * Upserts records by unique keys without duplicating rows on rerun.
     * @param {Object} fixtures Dataset
     * @param {Object} options Configuration flags (dryRun, environmentTag)
     * @returns {Object} Execution summary
     */
    importMasterData: function(fixtures, options) {
        options = options || {};
        var dryRun = !!options.dryRun;
        var envTag = options.environmentTag || 'DEVELOPMENT_FIXTURE';
        var mode = options.mode || 'DEVELOPMENT';

        // 1. Synthetic Fixture Protection in Production Mode
        if (mode === 'PRODUCTION' || envTag === 'PRODUCTION') {
            var isSynthetic = false;
            var synthReason = '';
            var stns = fixtures.stations || [];
            for (var si = 0; si < stns.length; si++) {
                if ((stns[si].name && stns[si].name.indexOf('[SYNTHETIC_TEST_DATA]') !== -1) ||
                    (stns[si].station_code && (stns[si].station_code.indexOf('TEST-') === 0 || stns[si].station_code.indexOf('MIG-') === 0))) {
                    isSynthetic = true;
                    synthReason = 'Station ' + stns[si].station_code + ' flagged as synthetic test fixture';
                    break;
                }
            }
            if (isSynthetic) {
                return {
                    success: false,
                    code: 'SYNTHETIC_DATA_IN_PRODUCTION',
                    environmentTag: envTag,
                    message: 'Production import mode strictly prohibits synthetic test fixtures or test keys: ' + synthReason
                };
            }
        }

        // 2. Pre-flight Dataset Integrity Check
        var valReport = this.validateMasterData(fixtures);
        if (!valReport.valid) {
            return {
                success: false,
                code: 'VALIDATION_FAILED',
                environmentTag: envTag,
                errors: valReport.errors,
                warnings: valReport.warnings,
                statistics: valReport.statistics
            };
        }

        // 3. Dry-Run Simulation Mode: Commits zero records
        if (dryRun) {
            return {
                success: true,
                code: 'DRY_RUN_PASSED',
                environmentTag: envTag,
                message: 'Pre-flight validation passed cleanly. Zero records committed in dry-run mode.',
                statistics: valReport.statistics
            };
        }

        var summary = {
            success: true,
            environmentTag: envTag,
            mode: mode,
            stations: { inserted: 0, updated: 0, skipped: 0, failed: 0 },
            ticketTypes: { inserted: 0, updated: 0, skipped: 0, failed: 0 },
            routes: { inserted: 0, updated: 0, skipped: 0, failed: 0 },
            fareRules: { inserted: 0, updated: 0, skipped: 0, failed: 0 },
            rowErrors: [],
            reconciliation: {
                totalProcessed: 0,
                totalSuccess: 0,
                totalFailed: 0,
                totalSkipped: 0
            },
            errors: []
        };

        try {
            var stationSysIdMap = {};

            // 1. Upsert Stations
            var stations = fixtures.stations || [];
            for (var s = 0; s < stations.length; s++) {
                summary.reconciliation.totalProcessed++;
                var sData = stations[s];
                try {
                    var sGr = new GlideRecord('x_mtts_station');
                    sGr.addQuery('station_code', sData.station_code);
                    sGr.query();

                    if (sGr.next()) {
                        sGr.setValue('name', sData.name);
                        sGr.setValue('line_zone', sData.line_zone);
                        sGr.setValue('active', sData.active !== false);
                        sGr.setValue('order', sData.order || 0);
                        sGr.update();
                        summary.stations.updated++;
                        summary.reconciliation.totalSuccess++;
                        stationSysIdMap[sData.station_code] = sGr.getUniqueValue();
                    } else {
                        sGr.initialize();
                        sGr.setValue('station_code', sData.station_code);
                        sGr.setValue('name', sData.name);
                        sGr.setValue('line_zone', sData.line_zone);
                        sGr.setValue('active', sData.active !== false);
                        sGr.setValue('order', sData.order || 0);
                        var newId = sGr.insert();
                        summary.stations.inserted++;
                        summary.reconciliation.totalSuccess++;
                        stationSysIdMap[sData.station_code] = newId;
                    }
                } catch (stnErr) {
                    summary.stations.failed++;
                    summary.reconciliation.totalFailed++;
                    summary.rowErrors.push({ entity: 'station', key: sData.station_code, error: stnErr.message });
                }
            }

            // 2. Upsert Ticket Types
            var ticketTypeSysIdMap = {};
            var types = fixtures.ticketTypes || [];
            for (var t = 0; t < types.length; t++) {
                summary.reconciliation.totalProcessed++;
                var tData = types[t];
                try {
                    var tGr = new GlideRecord('x_mtts_ticket_type');
                    tGr.addQuery('code', tData.code);
                    tGr.query();

                    if (tGr.next()) {
                        tGr.setValue('name', tData.name);
                        tGr.setValue('pricing_model', tData.pricing_model);
                        tGr.setValue('validity_hours', tData.validity_hours);
                        tGr.setValue('active', tData.active !== false);
                        tGr.update();
                        summary.ticketTypes.updated++;
                        summary.reconciliation.totalSuccess++;
                        ticketTypeSysIdMap[tData.code] = tGr.getUniqueValue();
                    } else {
                        tGr.initialize();
                        tGr.setValue('code', tData.code);
                        tGr.setValue('name', tData.name);
                        tGr.setValue('pricing_model', tData.pricing_model);
                        tGr.setValue('validity_hours', tData.validity_hours);
                        tGr.setValue('active', tData.active !== false);
                        var tId = tGr.insert();
                        summary.ticketTypes.inserted++;
                        summary.reconciliation.totalSuccess++;
                        ticketTypeSysIdMap[tData.code] = tId;
                    }
                } catch (typeErr) {
                    summary.ticketTypes.failed++;
                    summary.reconciliation.totalFailed++;
                    summary.rowErrors.push({ entity: 'ticket_type', key: tData.code, error: typeErr.message });
                }
            }

            // 3. Upsert Routes
            var routes = fixtures.routes || [];
            for (var r = 0; r < routes.length; r++) {
                summary.reconciliation.totalProcessed++;
                var rData = routes[r];
                try {
                    var origId = stationSysIdMap[rData.origin_station] || rData.origin_station;
                    var destId = stationSysIdMap[rData.destination_station] || rData.destination_station;

                    var rGr = new GlideRecord('x_mtts_route');
                    rGr.addQuery('origin_station', origId);
                    rGr.addQuery('destination_station', destId);
                    rGr.query();

                    if (rGr.next()) {
                        rGr.setValue('distance_km', parseFloat(rData.distance_km));
                        rGr.setValue('active', rData.active !== false);
                        rGr.update();
                        summary.routes.updated++;
                        summary.reconciliation.totalSuccess++;
                    } else {
                        rGr.initialize();
                        rGr.setValue('origin_station', origId);
                        rGr.setValue('destination_station', destId);
                        rGr.setValue('distance_km', parseFloat(rData.distance_km));
                        rGr.setValue('active', rData.active !== false);
                        rGr.insert();
                        summary.routes.inserted++;
                        summary.reconciliation.totalSuccess++;
                    }
                } catch (rtErr) {
                    summary.routes.failed++;
                    summary.reconciliation.totalFailed++;
                    summary.rowErrors.push({ entity: 'route', key: rData.origin_station + '->' + rData.destination_station, error: rtErr.message });
                }
            }

            // 4. Upsert Fare Rules
            var rules = fixtures.fareRules || [];
            for (var f = 0; f < rules.length; f++) {
                summary.reconciliation.totalProcessed++;
                var fData = rules[f];
                try {
                    var ttCode = fData.ticket_type_code || fData.ticket_type;
                    var ttSysId = ticketTypeSysIdMap[ttCode] || ttCode;

                    var fGr = new GlideRecord('x_mtts_fare_rule');
                    fGr.addQuery('rule_code', fData.rule_code);
                    fGr.query();

                    if (fGr.next()) {
                        fGr.setValue('ticket_type', ttSysId);
                        fGr.setValue('rate_per_km', fData.rate_per_km || 0.0);
                        fGr.setValue('minimum_fare', fData.minimum_fare || 0.0);
                        fGr.setValue('fixed_fare', fData.fixed_fare || 0.0);
                        fGr.setValue('return_multiplier', fData.return_multiplier || 1.8);
                        fGr.setValue('effective_from', fData.effective_from || '2026-01-01');
                        fGr.setValue('effective_to', fData.effective_to || '2099-12-31');
                        fGr.setValue('active', fData.active !== false);
                        fGr.update();
                        summary.fareRules.updated++;
                        summary.reconciliation.totalSuccess++;
                    } else {
                        fGr.initialize();
                        fGr.setValue('rule_code', fData.rule_code);
                        fGr.setValue('ticket_type', ttSysId);
                        fGr.setValue('rate_per_km', fData.rate_per_km || 0.0);
                        fGr.setValue('minimum_fare', fData.minimum_fare || 0.0);
                        fGr.setValue('fixed_fare', fData.fixed_fare || 0.0);
                        fGr.setValue('return_multiplier', fData.return_multiplier || 1.8);
                        fGr.setValue('effective_from', fData.effective_from || '2026-01-01');
                        fGr.setValue('effective_to', fData.effective_to || '2099-12-31');
                        fGr.setValue('active', fData.active !== false);
                        fGr.insert();
                        summary.fareRules.inserted++;
                        summary.reconciliation.totalSuccess++;
                    }
                } catch (frErr) {
                    summary.fareRules.failed++;
                    summary.reconciliation.totalFailed++;
                    summary.rowErrors.push({ entity: 'fare_rule', key: fData.rule_code, error: frErr.message });
                }
            }

            if (summary.rowErrors.length > 0) {
                summary.success = false;
                summary.code = 'PARTIAL_IMPORT_COMPLETED';
                gs.warn(this.logPrefix + 'Partial migration completed with ' + summary.rowErrors.length + ' row errors.');
            } else {
                gs.info(this.logPrefix + 'Migration successfully executed. Tag: ' + envTag);
            }
        } catch (ex) {
            summary.success = false;
            summary.errors.push(ex.message);
            gs.error(this.logPrefix + 'Migration execution exception: ' + ex.message);
        }

        return summary;
    },

    type: 'MetroDataMigrationService'
};

if (typeof module !== 'undefined') {
    module.exports = MetroDataMigrationService;
}
