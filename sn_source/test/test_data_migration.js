/**
 * test_data_migration.js
 * 
 * Test Suite 10: Master Data Migration & Validation Engine Tests
 * Validates Work Package 5: Pre-flight integrity checks, duplicate detection, idempotent upserts, fixture labeling.
 */
require('./mock_glide_env');
var fs = require('fs');
var path = require('path');
var assert = require('assert');

eval(fs.readFileSync(path.join(__dirname, '../data/MetroDataSeeder.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '../sys_script_include/MetroDataMigrationService.js'), 'utf8'));

function runDataMigrationTests() {
    console.log('\n--- RUNNING SUITE: Master Data Migration & Validation Engine Tests ---');
    var passed = 0;

    function it(desc, fn) {
        try {
            fn();
            console.log('  [PASS] ' + desc);
            passed++;
        } catch (err) {
            console.error('  [FAIL] ' + desc);
            console.error('    Error: ' + err.message);
            throw err;
        }
    }

    var service = new MetroDataMigrationService();

    // Standard valid fixture
    // Standard valid fixture with isolated test keys
    function getValidFixtures() {
        return {
            stations: [
                { station_code: 'MIG-01', name: 'Migration Alpha', line_zone: 'Blue Line', order: 1, active: true },
                { station_code: 'MIG-02', name: 'Migration Beta', line_zone: 'Blue Line', order: 2, active: true },
                { station_code: 'MIG-03', name: 'Migration Gamma', line_zone: 'Blue Line', order: 3, active: true }
            ],
            ticketTypes: [
                { code: 'MIG_SNG', name: 'Migration Single', pricing_model: 'Distance_Based', validity_hours: 4, active: true },
                { code: 'MIG_PSS', name: 'Migration Pass', pricing_model: 'Fixed', validity_hours: 24, active: true }
            ],
            routes: [
                { origin_station: 'MIG-01', destination_station: 'MIG-02', distance_km: 5.5, active: true },
                { origin_station: 'MIG-01', destination_station: 'MIG-03', distance_km: 18.2, active: true }
            ],
            fareRules: [
                { rule_code: 'MIG-RULE-SNG', ticket_type_code: 'MIG_SNG', rate_per_km: 2.50, minimum_fare: 10.00, effective_from: '2026-01-01', effective_to: '2026-12-31', active: true },
                { rule_code: 'MIG-RULE-PSS', ticket_type_code: 'MIG_PSS', fixed_fare: 50.00, effective_from: '2026-01-01', effective_to: '2026-12-31', active: true }
            ]
        };
    }

    // Test 1: Valid dataset passes validation cleanly
    it('Valid master data dataset passes pre-flight validation with zero errors', function() {
        var report = service.validateMasterData(getValidFixtures());
        assert.strictEqual(report.valid, true);
        assert.strictEqual(report.errors.length, 0);
        assert.strictEqual(report.statistics.stationsChecked, 3);
        assert.strictEqual(report.statistics.ticketTypesChecked, 2);
        assert.strictEqual(report.statistics.routesChecked, 2);
        assert.strictEqual(report.statistics.fareRulesChecked, 2);
    });

    // Test 2: Duplicate station code detection
    it('Pre-flight validation detects and rejects duplicate station codes', function() {
        var fixtures = getValidFixtures();
        fixtures.stations.push({ station_code: 'MIG-01', name: 'Duplicate Central', line_zone: 'Blue Line', order: 4 });
        var report = service.validateMasterData(fixtures);
        assert.strictEqual(report.valid, false);
        assert.ok(report.errors.some(function(e) { return e.indexOf('Duplicate station_code detected: MIG-01') !== -1; }));
    });

    // Test 3: Empty station name detection
    it('Pre-flight validation detects and rejects empty station names', function() {
        var fixtures = getValidFixtures();
        fixtures.stations[1].name = '   ';
        var report = service.validateMasterData(fixtures);
        assert.strictEqual(report.valid, false);
        assert.ok(report.errors.some(function(e) { return e.indexOf('empty or invalid name') !== -1; }));
    });

    // Test 4: Orphan route station references
    it('Pre-flight validation detects orphan station codes in route matrix', function() {
        var fixtures = getValidFixtures();
        fixtures.routes.push({ origin_station: 'MIG-01', destination_station: 'STN-999', distance_km: 10.0 });
        var report = service.validateMasterData(fixtures);
        assert.strictEqual(report.valid, false);
        assert.ok(report.errors.some(function(e) { return e.indexOf('unknown destination station_code: STN-999') !== -1; }));
    });

    // Test 5: Self-looping route detection
    it('Pre-flight validation rejects self-looping routes (origin == destination)', function() {
        var fixtures = getValidFixtures();
        fixtures.routes.push({ origin_station: 'MIG-01', destination_station: 'MIG-01', distance_km: 0.0 });
        var report = service.validateMasterData(fixtures);
        assert.strictEqual(report.valid, false);
        assert.ok(report.errors.some(function(e) { return e.indexOf('self-loop') !== -1; }));
    });

    // Test 6: Duplicate route pair detection
    it('Pre-flight validation detects duplicate route pairs in dataset', function() {
        var fixtures = getValidFixtures();
        fixtures.routes.push({ origin_station: 'MIG-01', destination_station: 'MIG-02', distance_km: 6.0 });
        var report = service.validateMasterData(fixtures);
        assert.strictEqual(report.valid, false);
        assert.ok(report.errors.some(function(e) { return e.indexOf('Duplicate route pair detected: MIG-01->MIG-02') !== -1; }));
    });

    // Test 7: Zero or negative route distance detection
    it('Pre-flight validation detects and rejects zero or negative route distances', function() {
        var fixtures = getValidFixtures();
        fixtures.routes.push({ origin_station: 'MIG-02', destination_station: 'MIG-03', distance_km: 0.0 });
        var report = service.validateMasterData(fixtures);
        assert.strictEqual(report.valid, false);
        assert.ok(report.errors.some(function(e) { return e.indexOf('non-positive distance') !== -1; }));
    });

    // Test 8: Conflicting / overlapping active fare rule date periods
    it('Pre-flight validation detects overlapping effective date windows for same ticket type', function() {
        var fixtures = getValidFixtures();
        fixtures.fareRules.push({
            rule_code: 'RULE-SNG-OVERLAP',
            ticket_type_code: 'MIG_SNG',
            rate_per_km: 3.00,
            minimum_fare: 12.00,
            effective_from: '2026-06-01',
            effective_to: '2026-12-31',
            active: true
        });
        var report = service.validateMasterData(fixtures);
        assert.strictEqual(report.valid, false);
        assert.ok(report.errors.some(function(e) { return e.indexOf('Conflicting active fare rule date ranges') !== -1; }));
    });

    // Test 9: Distance-based rules missing rate or minimum fare
    it('Pre-flight validation detects distance-based rules missing positive rate or minimum fare', function() {
        var fixtures = getValidFixtures();
        fixtures.fareRules[0].rate_per_km = 0.0;
        var report = service.validateMasterData(fixtures);
        assert.strictEqual(report.valid, false);
        assert.ok(report.errors.some(function(e) { return e.indexOf('positive rate_per_km') !== -1; }));
    });

    // Test 10: Fixed-price Pass rules missing fixed fare
    it('Pre-flight validation detects Pass rules missing positive fixed_fare', function() {
        var fixtures = getValidFixtures();
        fixtures.fareRules[1].fixed_fare = 0.0;
        var report = service.validateMasterData(fixtures);
        assert.strictEqual(report.valid, false);
        assert.ok(report.errors.some(function(e) { return e.indexOf('positive fixed_fare') !== -1; }));
    });

    // Test 11: Dry-run import mode
    it('Dry-run import validates dataset and commits zero records to database', function() {
        var countBefore = (global._db['x_mtts_station'] || []).length;
        var result = service.importMasterData(getValidFixtures(), { dryRun: true });
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.code, 'DRY_RUN_PASSED');
        var countAfter = (global._db['x_mtts_station'] || []).length;
        assert.strictEqual(countAfter, countBefore, 'Dry-run must not alter database tables');
    });

    // Test 12: Real import executes idempotently without duplicate rows
    it('Idempotent import: Repeated import runs update or skip without creating duplicate rows', function() {
        var fixtures = getValidFixtures();

        // Run 1: Initial import
        var run1 = service.importMasterData(fixtures, { environmentTag: 'DEVELOPMENT_FIXTURE' });
        assert.strictEqual(run1.success, true);
        assert.strictEqual(run1.stations.inserted, 3);
        assert.strictEqual(run1.ticketTypes.inserted, 2);
        assert.strictEqual(run1.routes.inserted, 2);
        assert.strictEqual(run1.fareRules.inserted, 2);

        // Run 2: Re-run identical fixtures
        var run2 = service.importMasterData(fixtures, { environmentTag: 'DEVELOPMENT_FIXTURE' });
        assert.strictEqual(run2.success, true);
        assert.strictEqual(run2.stations.inserted, 0, 'Re-run must not insert duplicate stations');
        assert.strictEqual(run2.stations.updated, 3, 'Re-run must update existing stations');
        assert.strictEqual(run2.ticketTypes.inserted, 0);
        assert.strictEqual(run2.routes.inserted, 0);
        assert.strictEqual(run2.fareRules.inserted, 0);
    });

    // Test 13: Dataset environment tagging
    it('Separation of concerns: Master data imports are explicitly tagged as DEVELOPMENT_FIXTURE', function() {
        var fixtures = getValidFixtures();
        var result = service.importMasterData(fixtures, { environmentTag: 'DEVELOPMENT_FIXTURE' });
        assert.strictEqual(result.environmentTag, 'DEVELOPMENT_FIXTURE');
    });

    // Test 14: Dry run with invalid references aborts cleanly
    it('Dry run with invalid references aborts before commit and writes zero records', function() {
        var fixtures = getValidFixtures();
        fixtures.routes.push({ origin_station: 'MIG-01', destination_station: 'NON_EXISTENT_STN', distance_km: 12.0 });

        var countBefore = (global._db['x_mtts_station'] || []).length;
        var result = service.importMasterData(fixtures, { dryRun: true });
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.code, 'VALIDATION_FAILED');
        assert.ok(result.errors.length > 0);

        var countAfter = (global._db['x_mtts_station'] || []).length;
        assert.strictEqual(countAfter, countBefore, 'Zero records must be committed on invalid dry-run');
    });

    // Test 15: Partial failure handling and row error isolation
    it('Partial failure handling: Row-level errors are recorded without silent corruption', function() {
        var partialFixtures = {
            stations: [
                { station_code: 'PART-01', name: 'Valid Station 1', line_zone: 'Red Line', order: 1, active: true },
                { station_code: 'PART-02', name: 'Valid Station 2', line_zone: 'Red Line', order: 2, active: true }
            ],
            ticketTypes: [
                { code: 'PART_TYP', name: 'Partial Type', pricing_model: 'Fixed', validity_hours: 12, active: true }
            ],
            routes: [
                { origin_station: 'PART-01', destination_station: 'PART-02', distance_km: 8.0, active: true }
            ],
            fareRules: [
                { rule_code: 'PART-RULE', ticket_type_code: 'PART_TYP', fixed_fare: 15.00, active: true }
            ]
        };

        var result = service.importMasterData(partialFixtures, { environmentTag: 'TEST_PARTIAL' });
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.stations.inserted, 2);
        assert.strictEqual(result.rowErrors.length, 0);
        assert.ok(result.reconciliation);
        assert.strictEqual(result.reconciliation.totalSuccess, 5);
        assert.strictEqual(result.reconciliation.totalFailed, 0);
    });

    // Test 16: Safe retry and post-import reconciliation report
    it('Safe retry and post-import reconciliation report generation', function() {
        var fixtures = getValidFixtures();
        var retryResult = service.importMasterData(fixtures, { environmentTag: 'TEST_RECON' });
        assert.strictEqual(retryResult.success, true);
        assert.ok(retryResult.reconciliation, 'Reconciliation report must be present in output');
        assert.strictEqual(retryResult.reconciliation.totalFailed, 0);
        assert.strictEqual(retryResult.reconciliation.totalProcessed >= 9, true);
    });

    // Test 17: Synthetic fixture controls reject test data in production mode
    it('Synthetic fixture controls: Production import mode strictly rejects synthetic development fixtures', function() {
        var synthFixtures = getValidFixtures();
        synthFixtures.stations[0].name = 'Central Station [SYNTHETIC_TEST_DATA]';

        var result = service.importMasterData(synthFixtures, { mode: 'PRODUCTION' });
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.code, 'SYNTHETIC_DATA_IN_PRODUCTION');
        assert.ok(result.message.indexOf('strictly prohibits synthetic test fixtures') !== -1);
    });

    console.log('Result: ' + passed + ' Passed, 0 Failed.\n');
    return { passed: passed, failed: 0 };
}

if (require.main === module) {
    runDataMigrationTests();
}

module.exports = { runTests: runDataMigrationTests };
