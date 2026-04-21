// Right-side info panel. Shows details for the currently selected entity and
// auto-refreshes when that entity's props change.

export class InfoPanel {
  constructor({ panelEl, contentEl, closeBtn, viewer, config }) {
    this.panelEl = panelEl;
    this.contentEl = contentEl;
    this.viewer = viewer;
    this.config = config ?? {};
    this.selected = null;
    this._refreshTimer = null;

    closeBtn.addEventListener("click", () => this.clear());

    // Delegate "Fly to street level" button clicks. One listener instead of
    // re-attaching on every render.
    contentEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action='fly-street']");
      if (!btn) return;
      const lat = parseFloat(btn.dataset.lat);
      const lon = parseFloat(btn.dataset.lon);
      const heading = parseFloat(btn.dataset.heading);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        this.flyToStreet(lat, lon, Number.isFinite(heading) ? heading : 0);
      }
    });
  }

  // Smoothly descend Cesium's main camera to street level at the given
  // coordinates. Works best with Google 3D Tiles active (photorealistic
  // buildings appear at this altitude).
  flyToStreet(lat, lon, headingDeg = 0) {
    if (!this.viewer) return;
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, 8),
      orientation: {
        heading: Cesium.Math.toRadians(headingDeg),
        pitch:   Cesium.Math.toRadians(-10),
        roll:    0,
      },
      duration: 3.0,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  }

  show(entity) {
    this.selected = entity;
    this._lastProps = entity?._props;
    this.panelEl.classList.remove("hidden");
    this.render();
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    // Event-driven refresh: check for prop changes at 1Hz but only re-render
    // when the underlying props object was replaced (i.e. new data arrived).
    this._refreshTimer = setInterval(() => {
      if (!this.selected) { clearInterval(this._refreshTimer); return; }
      if (this.selected._props !== this._lastProps) {
        this._lastProps = this.selected._props;
        this.render();
      }
    }, 1000);
  }

  clear() {
    this.selected = null;
    this._lastProps = null;
    this.panelEl.classList.add("hidden");
    if (this._refreshTimer) clearInterval(this._refreshTimer);
  }

  render() {
    const entity = this.selected;
    const p = entity?._props ?? {};
    const srcId = entity?._sourceId ?? "";

    if (srcId === "osmCams") return this.renderCamera(p);

    const isMil = srcId === "adsbMil";
    this.contentEl.innerHTML = `
      <div class="callsign">${escape(p.callsign ?? p.icao24?.toUpperCase() ?? "—")}</div>
      <div class="meta">
        <span class="source-tag ${isMil ? "mil" : ""}">${escape(p.source ?? srcId)}</span>
      </div>
      <div class="grid">
        ${row("ICAO24", p.icao24?.toUpperCase())}
        ${row("Registration", p.registration)}
        ${row("Type", p.typeCode)}
        ${row("Country", p.originCountry)}
        ${row("Altitude", fmtFt(p.altFt))}
        ${row("Speed",    fmtKts(p.groundSpeedKts))}
        ${row("Heading",  fmtDeg(p.headingDeg))}
        ${row("V/S",      fmtFpm(p.verticalRateFpm))}
        ${row("Squawk",   p.squawk)}
        ${row("On ground", p.onGround == null ? null : p.onGround ? "yes" : "no")}
        ${row("Lat",      p.lat?.toFixed(4))}
        ${row("Lon",      p.lon?.toFixed(4))}
      </div>
    `;
  }

  renderCamera(p) {
    const osmUrl   = `https://www.openstreetmap.org/node/${p.id}`;
    const mapsKey  = this.config?.GOOGLE_MAPS_KEY;
    // Google's Embed API serves Street View at any coordinates for free. If
    // no key is configured, we fall back to a "View on Maps" external link.
    const heading  = Number.isFinite(p.direction) ? p.direction : 0;
    const streetEmbed = mapsKey
      ? `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(mapsKey)}&location=${p.lat},${p.lon}&heading=${heading}&pitch=0&fov=90`
      : null;
    const openInMaps = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lon}${heading ? `&heading=${heading}` : ""}`;

    this.contentEl.innerHTML = `
      <div class="callsign">${escape(p.name || p.operator || `Camera ${p.id}`)}</div>
      <div class="meta">
        <span class="source-tag cam">${escape(p.source)}</span>
      </div>
      ${streetEmbed ? `
      <div class="street-view">
        <iframe
          src="${streetEmbed}"
          width="100%"
          height="180"
          frameborder="0"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          allowfullscreen></iframe>
        <div class="street-view-label">Street view · ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</div>
      </div>` : ""}
      <div class="grid">
        ${row("Type",        p.type)}
        ${row("Zone",        p.zone)}
        ${row("Direction",   p.direction == null ? null : `${p.direction}°`)}
        ${row("Mount",       p.mount)}
        ${row("Operator",    p.operator)}
        ${row("Description", p.description)}
      </div>
      <div class="actions">
        <button class="btn primary" data-action="fly-street" data-lat="${p.lat}" data-lon="${p.lon}" data-heading="${heading}">Fly to street level</button>
        <a class="btn" href="${openInMaps}" target="_blank" rel="noopener">Open in Maps</a>
        <a class="btn" href="${osmUrl}" target="_blank" rel="noopener">OSM</a>
      </div>
    `;
  }
}

function row(k, v) {
  if (v == null || v === "") return "";
  return `<div class="k">${escape(k)}</div><div class="v">${escape(String(v))}</div>`;
}

function fmtFt(ft)  { return Number.isFinite(ft)  ? `${Math.round(ft).toLocaleString()} ft` : null; }
function fmtKts(k)  { return Number.isFinite(k)   ? `${Math.round(k)} kt`  : null; }
function fmtDeg(d)  { return Number.isFinite(d)   ? `${Math.round(d)}°`    : null; }
function fmtFpm(f)  { return Number.isFinite(f)   ? `${Math.round(f)} fpm` : null; }

function escape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
