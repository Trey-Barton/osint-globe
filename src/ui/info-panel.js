// Right-side info panel. Shows details for the currently selected entity and
// auto-refreshes when that entity's props change.

export class InfoPanel {
  constructor({ panelEl, contentEl, closeBtn }) {
    this.panelEl = panelEl;
    this.contentEl = contentEl;
    this.selected = null;
    this._refreshTimer = null;

    closeBtn.addEventListener("click", () => this.clear());
  }

  show(entity) {
    this.selected = entity;
    this.panelEl.classList.remove("hidden");
    this.render();
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    // Re-render frequently so live updates (altitude, speed, heading) are visible.
    this._refreshTimer = setInterval(() => {
      if (this.selected) this.render();
      else clearInterval(this._refreshTimer);
    }, 1000);
  }

  clear() {
    this.selected = null;
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
    // OSM link lets you see what the camera actually is / nearby context.
    const osmUrl = `https://www.openstreetmap.org/node/${p.id}`;
    // Google Street View at the camera coordinates is usually the closest
    // thing to "see what the camera sees" without scraping the camera itself.
    const streetUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lon}`;
    this.contentEl.innerHTML = `
      <div class="callsign">${escape(p.name || p.operator || `Camera ${p.id}`)}</div>
      <div class="meta">
        <span class="source-tag cam">${escape(p.source)}</span>
      </div>
      <div class="grid">
        ${row("Type",        p.type)}
        ${row("Zone",        p.zone)}
        ${row("Direction",   p.direction == null ? null : `${p.direction}°`)}
        ${row("Mount",       p.mount)}
        ${row("Operator",    p.operator)}
        ${row("Description", p.description)}
        ${row("Lat",         p.lat?.toFixed(5))}
        ${row("Lon",         p.lon?.toFixed(5))}
      </div>
      <div class="actions">
        <a class="btn" href="${osmUrl}" target="_blank" rel="noopener">View on OSM</a>
        <a class="btn" href="${streetUrl}" target="_blank" rel="noopener">Street View</a>
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
