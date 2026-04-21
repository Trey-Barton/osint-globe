// Layer toggle panel + filter wiring. Auto-renders a toggle row per data source.
// Also renders the globe-style picker.

export function renderGlobeStyles({ styles, container, current, onChange }) {
  container.innerHTML = "";
  for (const s of styles) {
    const row = document.createElement("button");
    row.className = "globe-style" + (s.id === current ? " active" : "");
    row.dataset.styleId = s.id;
    row.innerHTML = `
      <span class="swatch" style="background:${s.swatch}"></span>
      <span class="name">${s.name}</span>
    `;
    row.addEventListener("click", async () => {
      // Visual lock-in immediately, even before tiles load.
      for (const el of container.querySelectorAll(".globe-style")) {
        el.classList.toggle("active", el.dataset.styleId === s.id);
      }
      try {
        await onChange(s.id);
      } catch (err) {
        console.error(err);
        alert(`Failed to apply ${s.name}: ${err.message}`);
      }
    });
    container.appendChild(row);
  }
}

export function renderLayerToggles({ sources, container, onToggle }) {
  container.innerHTML = "";

  for (const src of sources) {
    const row = document.createElement("label");
    row.className = "layer-toggle";
    row.dataset.sourceId = src.id;
    row.innerHTML = `
      <span class="name">
        <span class="swatch" style="background:${src.color}"></span>
        <input type="checkbox" checked />
        <span>${src.name}</span>
      </span>
      <span class="count">—</span>
    `;
    const cb = row.querySelector("input");
    const countEl = row.querySelector(".count");

    cb.addEventListener("change", () => {
      onToggle(src, cb.checked);
    });

    src.onStatus((s) => {
      countEl.textContent = formatCount(s);
      countEl.style.color = s.state === "error" ? "#ff5050" : "";
      countEl.title = s.error ?? "";
    });

    container.appendChild(row);
  }
}

function formatCount(s) {
  if (s.state === "error") return "err";
  if (s.state === "polling" && s.lastUpdate === 0) return "···";
  return String(s.count ?? 0);
}

// Filter wiring. Applies a visibility predicate across all data sources.
export function wireFilters({ sources, minAltInput, callsignInput }) {
  const apply = () => {
    const minAlt = Number(minAltInput.value) || 0;
    const needle = callsignInput.value.trim().toUpperCase();

    for (const src of sources) {
      if (!src.cesiumDS) continue;
      for (const entity of src.cesiumDS.entities.values) {
        const p = entity._props ?? {};
        const altOk = !Number.isFinite(p.altFt) || p.altFt >= minAlt;
        const cs = (p.callsign ?? "").toUpperCase();
        const nameOk = !needle || cs.includes(needle);
        entity.show = altOk && nameOk;
      }
    }
  };

  minAltInput.addEventListener("input", apply);
  callsignInput.addEventListener("input", apply);
  // Also re-apply when any source updates — new entities should honor the filter.
  for (const src of sources) src.onStatus(apply);
}
