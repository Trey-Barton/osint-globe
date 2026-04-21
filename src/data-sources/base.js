// Abstract base for all live data sources.
//
// Lifecycle:
//   const src = new MyDataSource(opts);
//   src.attach(viewer);   // wires up CustomDataSource on the Cesium viewer
//   src.start();          // begins polling
//   src.stop();           // pauses polling (entities remain visible until cleared)
//
// To create a new source: extend DataSource, implement async fetch(), and call
// this.upsert(id, props) for each observation. The entity factory passed to the
// constructor decides how each observation is rendered.

export class DataSource {
  /**
   * @param {object} opts
   * @param {string} opts.id        - stable id, used for layer toggle keys
   * @param {string} opts.name      - human-readable
   * @param {string} opts.color     - hex swatch color for the toggle
   * @param {number} opts.pollMs    - poll interval in ms
   * @param {(props, entity) => void} opts.applyEntity - mutator called on every upsert
   * @param {(id, props) => string} [opts.entityKey] - id strategy (default: opts arg)
   */
  constructor(opts) {
    this.id = opts.id;
    this.name = opts.name;
    this.color = opts.color;
    this.pollMs = opts.pollMs;
    this.applyEntity = opts.applyEntity;
    this.entityKey = opts.entityKey ?? ((id) => id);

    this.viewer = null;
    this.cesiumDS = null; // Cesium.CustomDataSource
    this._timer = null;
    this._lastSeenAt = new Map(); // entityKey -> timestamp
    this._listeners = new Set();
    this.status = { state: "idle", lastUpdate: 0, count: 0, error: null };
  }

  attach(viewer) {
    this.viewer = viewer;
    this.cesiumDS = new Cesium.CustomDataSource(this.id);
    viewer.dataSources.add(this.cesiumDS);
  }

  setVisible(visible) {
    if (this.cesiumDS) this.cesiumDS.show = visible;
  }

  start() {
    if (this._timer) return;
    let backoffSkips = 0;   // how many more ticks to skip
    let backoffLevel = 0;   // current exponential level (0..6 → 1..64 skips)

    const tick = async () => {
      // Rate-limit backoff: skip this tick if we're still cooling down.
      if (backoffSkips > 0) {
        backoffSkips--;
        return;
      }
      try {
        this.status.state = "polling";
        this._emit();
        await this.fetch();
        this.status.state = "ok";
        this.status.error = null;
        this.status.lastUpdate = Date.now();
        backoffLevel = 0; // success resets backoff
      } catch (err) {
        const msg = err?.message ?? String(err);
        console.warn(`[${this.id}] fetch failed:`, msg);
        this.status.state = "error";
        this.status.error = msg;
        // Backoff on rate-limit and 5xx.
        const isRateLimited = /429|Too Many|rate|503|502|timeout/i.test(msg);
        if (isRateLimited) {
          backoffLevel = Math.min(backoffLevel + 1, 6);
          backoffSkips = Math.pow(2, backoffLevel); // 2, 4, 8, 16, 32, 64
          this.status.error = `${msg} — backing off ${backoffSkips * (this.pollMs / 1000)}s`;
        }
      }
      // Always prune — otherwise stale entities linger during API outages.
      this.pruneStale();
      this.status.count = this.cesiumDS?.entities.values.length ?? 0;
      this._emit();
    };
    tick();
    this._timer = setInterval(tick, this.pollMs);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  /** Override in subclass. Should call upsert() per observation. */
  async fetch() {
    throw new Error("fetch() must be implemented by subclass");
  }

  /** Insert or update an entity by key. Marks it as recently seen. */
  upsert(rawId, props) {
    const key = this.entityKey(rawId, props);
    if (!key) return;
    let entity = this.cesiumDS.entities.getById(key);
    if (!entity) {
      entity = this.cesiumDS.entities.add({ id: key });
    }
    // Stash source on the entity so UI can render a tag.
    entity._sourceId = this.id;
    entity._props = props;
    this.applyEntity(props, entity);
    this._lastSeenAt.set(key, Date.now());
    return entity;
  }

  /** Remove entities not seen in the last N intervals. */
  pruneStale(maxAgeMs = this.pollMs * 4) {
    const now = Date.now();
    const expired = [];
    for (const [key, t] of this._lastSeenAt) {
      if (now - t > maxAgeMs) expired.push(key);
    }
    for (const key of expired) {
      this.cesiumDS.entities.removeById(key);
      this._lastSeenAt.delete(key);
    }
  }

  /** Subscribe to status changes. */
  onStatus(fn) {
    this._listeners.add(fn);
    fn(this.status);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    for (const fn of this._listeners) fn(this.status);
  }
}
