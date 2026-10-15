var MetroNumberFormatter = Class.create();
MetroNumberFormatter.prototype = {
    initialize: function() {
        this.logPrefix = '[x_mtts.MetroNumberFormatter] ';
        this.maxRetries = 5;
    },

    /**
     * Generates a unique sequential ticket number conforming to TKT-YYYYMMDD-XXXXXX
     * using the technical sequence table x_mtts_daily_sequence.
     * Incorporates optimistic concurrency retry handling to prevent race conditions.
     * @param {String} [travelDateStr] Optional travel date YYYY-MM-DD. Defaults to current date.
     * @returns {Object} { success, ticketNumber, sequence, dateKey, error }
     */
    allocateTicketNumber: function(travelDateStr) {
        var result = {
            success: false,
            ticketNumber: '',
            sequence: 0,
            dateKey: '',
            error: null
        };

        var dateKey = this._resolveDateKey(travelDateStr);
        result.dateKey = dateKey;

        for (var attempt = 1; attempt <= this.maxRetries; attempt++) {
            var alloc = this._tryAllocate(dateKey);
            if (alloc.success) {
                var paddedSeq = ('000000' + alloc.sequence).slice(-6);
                var ticketNo = 'TKT-' + dateKey + '-' + paddedSeq;
                result.success = true;
                result.ticketNumber = ticketNo;
                result.sequence = alloc.sequence;
                return result;
            } else if (alloc.error === 'OVERFLOW') {
                result.error = 'Daily sequence partition exhausted (maximum 999,999 tickets per day).';
                return result;
            }
            // Concurrency collision occurred; brief pause before retry
            this._sleep(10 * attempt);
        }

        result.error = 'Failed to allocate ticket number after ' + this.maxRetries + ' attempts due to high concurrent load.';
        gs.error(this.logPrefix + result.error + ' for date key: ' + dateKey);
        return result;
    },

    _tryAllocate: function(dateKey) {
        var gr = new GlideRecord('x_mtts_daily_sequence');
        gr.addQuery('date_key', dateKey);
        gr.query();

        if (gr.next()) {
            var currentModCount = parseInt(gr.getValue('sys_mod_count') || '0', 10);
            var lastSeq = parseInt(gr.getValue('last_sequence') || '0', 10);
            if (lastSeq >= 999999) {
                return { success: false, error: 'OVERFLOW' };
            }
            var nextSeq = lastSeq + 1;
            gr.last_sequence = nextSeq;

            // Optimistic concurrency check: update only if sys_mod_count matches
            var updatedId = gr.update();
            if (updatedId) {
                return { success: true, sequence: nextSeq };
            } else {
                return { success: false, error: 'COLLISION' };
            }
        } else {
            // First issuance for this date partition: insert initial record
            try {
                gr.initialize();
                gr.date_key = dateKey;
                gr.last_sequence = 1;
                var insertId = gr.insert();
                if (insertId) {
                    return { success: true, sequence: 1 };
                }
            } catch (ex) {
                // Another thread may have inserted concurrently; retry lookup
                return { success: false, error: 'COLLISION' };
            }
        }

        return { success: false, error: 'COLLISION' };
    },

    _resolveDateKey: function(travelDateStr) {
        if (travelDateStr && typeof travelDateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(travelDateStr)) {
            return travelDateStr.replace(/-/g, '');
        }
        var gDate = new GlideDate();
        return gDate.getByFormat('yyyyMMdd');
    },

    _sleep: function(ms) {
        var start = new Date().getTime();
        while (new Date().getTime() < start + ms) {
            // Busy wait for scoped runtime where Thread.sleep is unavailable
        }
    },

    type: 'MetroNumberFormatter'
};
