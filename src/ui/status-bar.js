// Top-right status bar. Shows aggregate aircraft count + per-source last-update + errors.

export function renderStatusBar({ sources, container }) {
  container.innerHTML = "";
  const total = document.createElement("div");
  total.className = "stat";
  total.innerHTML = `<span class="label">AC</span><span class="value" data-role="total">0</span>`;
  container.appendChild(total);

  const clock = document.createElement("div");
  clock.className = "stat";
  clock.innerHTML = `<span class="label">UTC</span><span class="value" data-role="clock"></span>`;
  container.appendChild(clock);

  const srcStats = new Map();
  for (const src of sources) {
    const el = document.createElement("div");
    el.className = "stat";
    el.innerHTML = `
      <span class="label">${src.id}</span>
      <span class="value" data-role="src-${src.id}">···</span>
    `;
    container.appendChild(el);
    srcStats.set(src.id, el);

    src.onStatus((s) => update(el, s));
  }

  function update(el, s) {
    const v = el.querySelector(".value");
    el.classList.remove("error", "warn");
    if (s.state === "error") {
      el.classList.add("error");
      v.textContent = "err";
      v.title = s.error ?? "";
    } else if (s.state === "polling" && s.lastUpdate === 0) {
      v.textContent = "···";
    } else {
      const ago = Math.max(0, Math.round((Date.now() - s.lastUpdate) / 1000));
      v.textContent = `${s.count} · ${ago}s`;
    }
    // Recompute total across all sources.
    let total = 0;
    for (const src of sources) total += src.status.count ?? 0;
    container.querySelector("[data-role='total']").textContent = total.toLocaleString();
  }

  // Tick every second to refresh "Xs ago" + UTC clock.
  setInterval(() => {
    container.querySelector("[data-role='clock']").textContent = utc();
    for (const src of sources) update(srcStats.get(src.id), src.status);
  }, 1000);
}

function utc() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}
