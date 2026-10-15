/**
 * mock_glide_env.js
 * High-fidelity scoped ServiceNow platform runtime mock for automated local test execution.
 */
var crypto = require('crypto');

// Global Class object for prototype inheritance
global.Class = {
    create: function() {
        return function() {
            if (this.initialize) {
                this.initialize.apply(this, arguments);
            }
        };
    }
};

Object.extendsObject = function(superClass, proto) {
    var newProto = Object.create(superClass.prototype || superClass);
    for (var k in proto) {
        newProto[k] = proto[k];
    }
    return newProto;
};

// AbstractAjaxProcessor Mock for Client-Callable Script Includes
global.AbstractAjaxProcessor = Class.create();
global.AbstractAjaxProcessor.prototype = {
    initialize: function(request, responseXML, gc) {
        this.request = request;
        this.responseXML = responseXML;
        this.gc = gc;
        this._params = {};
    },
    getParameter: function(name) {
        return this._params[name];
    },
    setParameter: function(name, value) {
        this._params[name] = value;
    }
};

// Global in-memory database store
global._db = {
    'x_mtts_station': [],
    'x_mtts_route': [],
    'x_mtts_ticket_type': [],
    'x_mtts_fare_rule': [],
    'x_mtts_booking_ticket': [],
    'x_mtts_daily_sequence': [],
    'x_mtts_scan_event': [],
    'sys_user': [],
    'sc_req_item': [],
    'sysapproval_approver': [],
    'sys_attachment': []
};

// Global system properties store
global._properties = {
    'x_mtts.default_currency': 'USD',
    'x_mtts.max_passengers_per_booking': '6',
    'x_mtts.max_advance_booking_days': '30',
    'x_mtts.cancellation_tier_greater_24h_pct': '90',
    'x_mtts.cancellation_tier_2_to_24h_pct': '75',
    'x_mtts.cancellation_tier_less_2h_pct': '0',
    'x_mtts.cancellation.policy_status': 'UNCONFIGURED',
    'x_mtts.lifecycle.enable_rejected_status': 'false',
    'x_mtts.scanner.rate_limit_window_sec': '60',
    'x_mtts.scanner.max_failed_attempts': '5',
    'x_mtts.scanner.audit_logging_enabled': 'true',
    'x_mtts.notifications.enabled': 'false',
    'x_mtts.notifications.sender_display_name': 'Metro Transit Operations',
    'x_mtts.audit.retention_policy_status': 'UNCONFIGURED',
    'x_mtts.audit.retention_days': '0'
};

// Global logs & events collector
global._logs = { info: [], warn: [], error: [] };
global._events = [];

// gs mock
global.gs = {
    getProperty: function(key, defaultVal) {
        return global._properties[key] !== undefined ? global._properties[key] : defaultVal;
    },
    setProperty: function(key, val) {
        global._properties[key] = val.toString();
    },
    getUserID: function() {
        return global._currentUserId || 'usr_test_commuter_001';
    },
    setUserID: function(id) {
        global._currentUserId = id;
    },
    generateGUID: function() {
        return crypto.randomBytes(16).toString('hex');
    },
    hasRole: function(role) {
        return (global._currentUserRoles || []).indexOf(role) !== -1;
    },
    setUserRoles: function(roles) {
        global._currentUserRoles = roles;
    },
    getUserName: function() {
        return global._currentUserName || 'commuter.01';
    },
    setUserName: function(name) {
        global._currentUserName = name;
    },
    getUserDisplayName: function() {
        return 'Test Commuter';
    },
    eventQueue: function(eventName, recordGr, parm1, parm2, queue) {
        global._events = global._events || [];
        global._events.push({
            name: eventName,
            table: recordGr ? recordGr._tableName : null,
            instance: recordGr ? recordGr.getUniqueValue() : null,
            parm1: parm1,
            parm2: parm2,
            queue: queue || 'default',
            timestamp: new Date().toISOString()
        });
    },
    info: function(msg) { global._logs.info.push(msg); },
    warn: function(msg) { global._logs.warn.push(msg); },
    error: function(msg) { global._logs.error.push(msg); },
    addErrorMessage: function(msg) { global._logs.error.push(msg); }
};

// GlideDate & GlideDateTime
global.GlideDate = function(val) {
    var d = val ? new Date(val) : new Date();
    this.getByFormat = function(fmt) {
        var y = d.getFullYear();
        var m = ('0' + (d.getMonth() + 1)).slice(-2);
        var day = ('0' + d.getDate()).slice(-2);
        if (fmt === 'yyyyMMdd') return '' + y + m + day;
        return '' + y + '-' + m + '-' + day;
    };
    this.toString = function() {
        return this.getByFormat('yyyy-MM-dd');
    };
};

global.GlideDateTime = function(val) {
    var d = val ? (val instanceof Date ? new Date(val.getTime()) : (val.getNumericValue ? new Date(val.getNumericValue()) : new Date(val))) : new Date();
    this.addDaysUTC = function(days) {
        d.setUTCDate(d.getUTCDate() + days);
    };
    this.addSeconds = function(sec) {
        d.setUTCSeconds(d.getUTCSeconds() + sec);
    };
    this.getNumericValue = function() {
        return d.getTime();
    };
    this.getValue = function() {
        return d.toISOString();
    };
    this.toString = function() {
        return d.toISOString();
    };
    this.toJSON = function() {
        return d.toISOString();
    };
};

// GlideDigest
global.GlideDigest = function() {
    this.getSHA256Hex = function(str) {
        return crypto.createHash('sha256').update(str).digest('hex');
    };
};

// GlideSecureRandomUtil
global.GlideSecureRandomUtil = {
    getSecureRandomString: function(len) {
        return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
    }
};

// GlideSysAttachment
global.GlideSysAttachment = function() {
    this.write = function(recordGr, fileName, contentType, content) {
        var attachId = 'att_' + crypto.randomBytes(8).toString('hex');
        global._db['sys_attachment'].push({
            sys_id: attachId,
            table_name: recordGr._tableName,
            table_sys_id: recordGr.getUniqueValue(),
            file_name: fileName,
            content_type: contentType,
            content_length: content ? content.length : 0,
            content: content || '',
            created_on: new Date().toISOString()
        });
        return attachId;
    };
    this.getContent = function(attachGr) {
        return attachGr.getValue('content') || '';
    };
    this.getContentStream = function(sysId) {
        var table = global._db['sys_attachment'] || [];
        for (var i = 0; i < table.length; i++) {
            if (table[i].sys_id === sysId) {
                return table[i].content;
            }
        }
        return null;
    };
};

// GlideRecord Mock with Proxy
global.GlideRecord = function(tableName) {
    var self = this;
    this._tableName = tableName;
    this._queries = [];
    this._data = null;
    this._index = -1;
    this._isNew = false;
    this._fields = {};
    this._abortAction = false;
    this._orderBys = [];
    this._limit = 0;

    this.orderBy = function(f) { this._orderBys.push({ field: f, desc: false }); };
    this.orderByDesc = function(f) { this._orderBys.push({ field: f, desc: true }); };
    this.setLimit = function(n) { this._limit = n; };
    this.getRowCount = function() {
        if (!this._data) this.query();
        return this._data.length;
    };

    this.initialize = function() {
        this._isNew = true;
        this._fields = {
            sys_id: crypto.randomBytes(16).toString('hex'),
            sys_mod_count: 0,
            sys_created_on: new Date().toISOString(),
            sys_updated_on: new Date().toISOString()
        };
    };

    this.isNewRecord = function() {
        return this._isNew;
    };

    this.setAbortAction = function(val) {
        this._abortAction = !!val;
    };

    this.addQuery = function(field, opOrVal, optVal) {
        var op = '=';
        var val = opOrVal;
        if (optVal !== undefined) {
            op = opOrVal;
            val = optVal;
        }
        var queryObj = { field: field, op: op, val: val, isOr: false };
        this._queries.push(queryObj);
        return {
            addOrCondition: function(f, v) {
                self._queries.push({ field: f, op: '=', val: v, isOr: true });
            }
        };
    };

    this.query = function() {
        var table = global._db[this._tableName] || [];
        var filtered = [];

        for (var i = 0; i < table.length; i++) {
            var row = table[i];
            var match = true;

            for (var q = 0; q < this._queries.length; q++) {
                var query = this._queries[q];
                var rowVal = row[query.field];
                var targetVal = query.val;
                var conditionPassed = false;

                var rComp = (rowVal && rowVal.toString) ? rowVal.toString() : rowVal;
                var tComp = (targetVal && targetVal.toString) ? targetVal.toString() : targetVal;

                if (query.op === '=') {
                    conditionPassed = (rComp == tComp);
                } else if (query.op === '<') {
                    conditionPassed = (rComp < tComp);
                } else if (query.op === '>') {
                    conditionPassed = (rComp > tComp);
                } else if (query.op === '<=') {
                    conditionPassed = (rComp <= tComp);
                } else if (query.op === '>=') {
                    conditionPassed = (rComp >= tComp);
                }

                if (query.isOr) {
                    match = match || conditionPassed;
                } else {
                    match = match && conditionPassed;
                }
            }

            if (match) {
                filtered.push(JSON.parse(JSON.stringify(row)));
            }
        }

        if (this._orderBys.length > 0) {
            filtered.sort(function(a, b) {
                for (var o = 0; o < self._orderBys.length; o++) {
                    var ord = self._orderBys[o];
                    var valA = a[ord.field];
                    var valB = b[ord.field];
                    if (valA < valB) return ord.desc ? 1 : -1;
                    if (valA > valB) return ord.desc ? -1 : 1;
                }
                return 0;
            });
        }

        if (this._limit > 0 && filtered.length > this._limit) {
            filtered = filtered.slice(0, this._limit);
        }

        this._data = filtered;
        this._index = -1;
    };

    this.next = function() {
        if (!this._data) this.query();
        if (this._index + 1 < this._data.length) {
            this._index++;
            this._fields = this._data[this._index];
            this._isNew = false;
            return true;
        }
        return false;
    };

    this.hasNext = function() {
        if (!this._data) this.query();
        return (this._index + 1 < this._data.length);
    };

    this.get = function(id) {
        var table = global._db[this._tableName] || [];
        for (var i = 0; i < table.length; i++) {
            if (table[i].sys_id === id) {
                this._fields = JSON.parse(JSON.stringify(table[i]));
                this._isNew = false;
                return true;
            }
        }
        return false;
    };

    this.getValue = function(field) {
        return this._fields[field];
    };

    this.setValue = function(field, val) {
        this._fields[field] = val;
    };

    this.getUniqueValue = function() {
        return this._fields.sys_id;
    };

    this.insert = function() {
        if (this._abortAction) return null;
        var table = global._db[this._tableName] = global._db[this._tableName] || [];

        // Check unique constraints
        if (this._tableName === 'x_mtts_station') {
            for (var s = 0; s < table.length; s++) {
                if (table[s].station_code === this._fields.station_code) {
                    throw new Error('Duplicate key on x_mtts_station: ' + this._fields.station_code);
                }
            }
        } else if (this._tableName === 'x_mtts_daily_sequence') {
            for (var d = 0; d < table.length; d++) {
                if (table[d].date_key === this._fields.date_key) {
                    throw new Error('Duplicate key on x_mtts_daily_sequence: ' + this._fields.date_key);
                }
            }
        } else if (this._tableName === 'x_mtts_route') {
            for (var r = 0; r < table.length; r++) {
                if (table[r].origin_station === this._fields.origin_station && table[r].destination_station === this._fields.destination_station) {
                    throw new Error('Duplicate composite key on x_mtts_route');
                }
            }
        }

        this._fields.sys_created_on = new Date().toISOString();
        this._fields.sys_updated_on = new Date().toISOString();
        this._fields.sys_mod_count = 0;
        table.push(JSON.parse(JSON.stringify(this._fields)));
        return this._fields.sys_id;
    };

    this.update = function() {
        if (this._abortAction) return null;
        var table = global._db[this._tableName] || [];
        for (var i = 0; i < table.length; i++) {
            if (table[i].sys_id === this._fields.sys_id) {
                // Optimistic concurrency verification
                if (table[i].sys_mod_count !== this._fields.sys_mod_count) {
                    return null; // Concurrency collision
                }
                this._fields.sys_mod_count++;
                this._fields.sys_updated_on = new Date().toISOString();
                table[i] = JSON.parse(JSON.stringify(this._fields));
                return this._fields.sys_id;
            }
        }
        return null;
    };

    this.deleteRecord = function() {
        if (this._abortAction) return false;
        var table = global._db[this._tableName] || [];
        for (var i = 0; i < table.length; i++) {
            if (table[i].sys_id === this._fields.sys_id) {
                table.splice(i, 1);
                return true;
            }
        }
        return false;
    };

    // Return Proxy to allow direct field access: gr.station_code, gr.status, etc.
    return new Proxy(this, {
        get: function(target, prop) {
            if (typeof prop === 'symbol' || prop in target) {
                return target[prop];
            }
            return target._fields[prop];
        },
        set: function(target, prop, value) {
            if (typeof prop === 'symbol' || prop in target) {
                target[prop] = value;
            } else {
                target._fields[prop] = value;
            }
            return true;
        }
    });
};

module.exports = {
    resetDb: function() {
        for (var k in global._db) {
            global._db[k] = [];
        }
        global._logs = { info: [], warn: [], error: [] };
    }
};
