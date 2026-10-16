import crypto from 'crypto';

/**
 * In-Memory MongoDB Engine (Mock)
 * 
 * Provides an in-process, zero-dependency MongoDB driver-compatible implementation
 * of Db, Collection, and Cursor for local development, unit testing, and offline environments.
 * Strictly emulates MongoDB Atlas behaviors, including unique index enforcement (E11000),
 * document filtering ($or, equality), atomic operators ($set, $inc), and cursor pagination.
 */

function matchDoc(doc, filter) {
  if (!filter || Object.keys(filter).length === 0) return true;

  for (const [key, val] of Object.entries(filter)) {
    if (key === '$or' && Array.isArray(val)) {
      const anyMatch = val.some(subFilter => matchDoc(doc, subFilter));
      if (!anyMatch) return false;
      continue;
    }

    if (key === '$and' && Array.isArray(val)) {
      const allMatch = val.every(subFilter => matchDoc(doc, subFilter));
      if (!allMatch) return false;
      continue;
    }

    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if ('$in' in val && Array.isArray(val.$in)) {
        if (!val.$in.includes(doc[key])) return false;
        continue;
      }
      if ('$ne' in val) {
        if (doc[key] === val.$ne) return false;
        continue;
      }
      if ('$type' in val) {
        const expectedType = val.$type;
        if (expectedType === 'string') {
          if (typeof doc[key] !== 'string') return false;
        } else if (expectedType === 'number') {
          if (typeof doc[key] !== 'number') return false;
        }
        continue;
      }
    }

    // Direct equality check
    if (doc[key] !== val) {
      return false;
    }
  }

  return true;
}

export class MemoryCursor {
  constructor(docs) {
    this._docs = docs.map(d => ({ ...d }));
    this._sortObj = null;
    this._limitNum = null;
  }

  sort(sortObj) {
    this._sortObj = sortObj;
    return this;
  }

  limit(num) {
    this._limitNum = num;
    return this;
  }

  async toArray() {
    let result = [...this._docs];

    if (this._sortObj) {
      const [field, direction] = Object.entries(this._sortObj)[0];
      const dir = direction === -1 || direction === 'desc' ? -1 : 1;
      result.sort((a, b) => {
        const valA = a[field] ?? '';
        const valB = b[field] ?? '';
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
      });
    }

    if (typeof this._limitNum === 'number' && this._limitNum >= 0) {
      result = result.slice(0, this._limitNum);
    }

    return result.map(d => ({ ...d }));
  }
}

export class MemoryCollection {
  constructor(name) {
    this.name = name;
    this._docs = [];
    this._indexes = [];
  }

  async createIndex(keys, options = {}) {
    const name = options.name || Object.keys(keys).join('_');
    const existingIdx = this._indexes.findIndex(i => (i.options?.name === name || Object.keys(i.keys).join('_') === name));
    if (existingIdx !== -1) {
      this._indexes[existingIdx] = { keys, options: { ...options, name } };
    } else {
      this._indexes.push({ keys, options: { ...options, name } });
    }
    return name;
  }

  async createIndexes(indexSpecs) {
    for (const spec of indexSpecs) {
      await this.createIndex(spec.key, spec);
    }
    return indexSpecs.map(s => s.name || Object.keys(s.key).join('_'));
  }

  async indexes() {
    return this._indexes.map(i => ({
      key: i.keys,
      name: i.options?.name || Object.keys(i.keys).join('_'),
      ...i.options
    }));
  }

  async dropIndex(name) {
    const idx = this._indexes.findIndex(i => 
      (i.options?.name === name || Object.keys(i.keys).join('_') === name)
    );
    if (idx !== -1) {
      this._indexes.splice(idx, 1);
      return true;
    }
    return false;
  }

  _checkUniqueIndexes(newDoc, ignoreId = null) {
    for (const idx of this._indexes) {
      if (idx.options && idx.options.unique) {
        // Evaluate partialFilterExpression if present
        if (idx.options.partialFilterExpression) {
          if (!matchDoc(newDoc, idx.options.partialFilterExpression)) {
            continue; // Skip uniqueness enforcement for non-matching documents
          }
        }

        for (const field of Object.keys(idx.keys)) {
          const val = newDoc[field];

          // Sparse index skips null and undefined
          if (idx.options.sparse && (val === undefined || val === null)) {
            continue;
          }

          if (val !== undefined && val !== null) {
            const collision = this._docs.find(d => 
              (ignoreId ? d._id !== ignoreId && d.id !== ignoreId : true) && 
              d[field] === val
            );
            if (collision) {
              const err = new Error(`E11000 duplicate key error collection: ${this.name} index: ${idx.options.name || field + '_1'} dup key: { ${field}: "${val}" }`);
              err.code = 11000;
              throw err;
            }
          } else if (!idx.options.sparse && !idx.options.partialFilterExpression) {
            // Standard unique index treats null/undefined as a value
            const collision = this._docs.find(d => 
              (ignoreId ? d._id !== ignoreId && d.id !== ignoreId : true) && 
              (d[field] === undefined || d[field] === null)
            );
            if (collision) {
              const err = new Error(`E11000 duplicate key error collection: ${this.name} index: ${idx.options.name || field + '_1'} dup key: { ${field}: null }`);
              err.code = 11000;
              throw err;
            }
          }
        }
      }
    }
  }

  find(filter = {}) {
    const matching = this._docs.filter(d => matchDoc(d, filter));
    return new MemoryCursor(matching);
  }

  async findOne(filter = {}) {
    const match = this._docs.find(d => matchDoc(d, filter));
    return match ? { ...match } : null;
  }

  async insertOne(doc) {
    const toInsert = { ...doc };
    if (!toInsert._id) {
      toInsert._id = crypto.randomBytes(12).toString('hex');
    }

    this._checkUniqueIndexes(toInsert);
    this._docs.push(toInsert);

    return {
      acknowledged: true,
      insertedId: toInsert._id
    };
  }

  async insertMany(docs) {
    const ids = [];
    for (const doc of docs) {
      const res = await this.insertOne(doc);
      ids.push(res.insertedId);
    }
    return {
      acknowledged: true,
      insertedCount: docs.length,
      insertedIds: ids
    };
  }

  async updateOne(filter, update, options = {}) {
    const docIndex = this._docs.findIndex(d => matchDoc(d, filter));
    if (docIndex === -1) {
      return { matchedCount: 0, modifiedCount: 0, acknowledged: true };
    }

    const doc = this._docs[docIndex];
    const updated = { ...doc };

    if (update.$set) {
      Object.assign(updated, update.$set);
    }

    if (update.$inc) {
      for (const [key, incVal] of Object.entries(update.$inc)) {
        updated[key] = (updated[key] || 0) + incVal;
      }
    }

    if (update.$currentDate) {
      for (const key of Object.keys(update.$currentDate)) {
        updated[key] = new Date().toISOString();
      }
    }

    this._checkUniqueIndexes(updated, doc._id);
    this._docs[docIndex] = updated;

    return {
      matchedCount: 1,
      modifiedCount: 1,
      acknowledged: true
    };
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const docIndex = this._docs.findIndex(d => matchDoc(d, filter));
    if (docIndex === -1) {
      return null;
    }

    const doc = this._docs[docIndex];
    const updated = { ...doc };

    if (update.$set) {
      Object.assign(updated, update.$set);
    }

    if (update.$inc) {
      for (const [key, incVal] of Object.entries(update.$inc)) {
        updated[key] = (updated[key] || 0) + incVal;
      }
    }

    if (update.$currentDate) {
      for (const key of Object.keys(update.$currentDate)) {
        updated[key] = new Date().toISOString();
      }
    }

    this._checkUniqueIndexes(updated, doc._id);
    this._docs[docIndex] = updated;

    if (options.returnDocument === 'before') {
      return { ...doc };
    }
    return { ...updated };
  }

  async countDocuments(filter = {}) {
    return this._docs.filter(d => matchDoc(d, filter)).length;
  }

  async deleteMany(filter = {}) {
    const beforeCount = this._docs.length;
    this._docs = this._docs.filter(d => !matchDoc(d, filter));
    return {
      acknowledged: true,
      deletedCount: beforeCount - this._docs.length
    };
  }
}

export class MemoryDb {
  constructor(dbName = 'mtts_transit_db') {
    this.databaseName = dbName;
    this._collections = new Map();
  }

  collection(name) {
    if (!this._collections.has(name)) {
      this._collections.set(name, new MemoryCollection(name));
    }
    return this._collections.get(name);
  }

  async command(cmd) {
    if (cmd.ping) {
      return { ok: 1 };
    }
    return { ok: 1 };
  }
}

export class MemoryMongoClient {
  constructor(uri, options = {}) {
    this.uri = uri;
    this._db = new MemoryDb('mtts_transit_db');
  }

  async connect() {
    return this;
  }

  db(dbName) {
    if (dbName && this._db.databaseName !== dbName) {
      this._db.databaseName = dbName;
    }
    return this._db;
  }

  async close() {
    return true;
  }
}
