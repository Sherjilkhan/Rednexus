/**
 * In-memory Firestore-compatible shim.
 * Implements the subset of the firebase-admin Firestore API used by Raktasetu:
 *   db.collection(name).doc(id?) -> { id, get, set, update, delete }
 *   db.collection(name).add(data)
 *   db.collection(name).where(field, op, value).orderBy(field, dir).limit(n).get()
 *   snapshot: { exists, id, data() }  querySnapshot: { empty, size, docs, forEach }
 * Data is kept in plain JS objects so the demo runs with zero credentials.
 */

let counter = 0;
const genId = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${(++counter).toString(36)}`;

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const getPath = (obj, path) =>
  path.split('.').reduce((acc, key) => (acc === undefined || acc === null ? undefined : acc[key]), obj);

const compare = (a, b) => {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return a < b ? -1 : 1;
};

const matches = (data, [field, op, value]) => {
  const actual = getPath(data, field);
  switch (op) {
    case '==':
      return actual === value;
    case '!=':
      return actual !== value;
    case '>':
      return compare(actual, value) > 0;
    case '>=':
      return compare(actual, value) >= 0;
    case '<':
      return compare(actual, value) < 0;
    case '<=':
      return compare(actual, value) <= 0;
    case 'in':
      return Array.isArray(value) && value.includes(actual);
    case 'array-contains':
      return Array.isArray(actual) && actual.includes(value);
    default:
      throw new Error(`Unsupported operator: ${op}`);
  }
};

class Query {
  constructor(store, name, filters = [], orders = [], limitN = null) {
    this.store = store;
    this.name = name;
    this.filters = filters;
    this.orders = orders;
    this.limitN = limitN;
  }

  where(field, op, value) {
    return new Query(this.store, this.name, [...this.filters, [field, op, value]], this.orders, this.limitN);
  }

  orderBy(field, dir = 'asc') {
    return new Query(this.store, this.name, this.filters, [...this.orders, [field, dir]], this.limitN);
  }

  limit(n) {
    return new Query(this.store, this.name, this.filters, this.orders, n);
  }

  async get() {
    const bucket = this.store.get(this.name) || new Map();
    let rows = [...bucket.entries()].map(([id, data]) => ({ id, data }));
    rows = rows.filter((row) => this.filters.every((f) => matches(row.data, f)));
    for (const [field, dir] of [...this.orders].reverse()) {
      rows.sort((a, b) => compare(getPath(a.data, field), getPath(b.data, field)) * (dir === 'desc' ? -1 : 1));
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    const docs = rows.map((row) => ({
      id: row.id,
      exists: true,
      data: () => clone(row.data),
    }));
    return { empty: docs.length === 0, size: docs.length, docs, forEach: (fn) => docs.forEach(fn) };
  }
}

class DocRef {
  constructor(store, name, id) {
    this.store = store;
    this.name = name;
    this.id = id;
  }

  #bucket() {
    if (!this.store.has(this.name)) this.store.set(this.name, new Map());
    return this.store.get(this.name);
  }

  async set(data, options = {}) {
    const bucket = this.#bucket();
    const next = options.merge ? { ...(bucket.get(this.id) || {}), ...clone(data) } : clone(data);
    bucket.set(this.id, next);
    return { id: this.id };
  }

  async update(data) {
    const bucket = this.#bucket();
    if (!bucket.has(this.id)) throw new Error(`No document to update: ${this.name}/${this.id}`);
    bucket.set(this.id, { ...bucket.get(this.id), ...clone(data) });
    return { id: this.id };
  }

  async get() {
    const bucket = this.#bucket();
    const data = bucket.get(this.id);
    return { id: this.id, exists: data !== undefined, data: () => clone(data) };
  }

  async delete() {
    this.#bucket().delete(this.id);
  }
}

class CollectionRef extends Query {
  constructor(store, name) {
    super(store, name);
  }

  doc(id) {
    return new DocRef(this.store, this.name, id || genId(this.name));
  }

  async add(data) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

export function createMemoryFirestore() {
  const store = new Map();
  return {
    __memory: true,
    collection: (name) => new CollectionRef(store, name),
    async reset() {
      store.clear();
    },
  };
}

export { genId };
