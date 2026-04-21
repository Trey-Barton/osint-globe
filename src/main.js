// App bootstrap. Wires viewer + data sources + UI.

import { createViewer } from "./viewer.js";
import { applyStyle, availableStyles } from "./imagery.js";
import { sources as buildSources } from "./data-sources/registry.js";
import { renderLayerToggles, renderGlobeStyles, wireFilters } from "./ui/controls.js";
import { renderStatusBar } from "./ui/status-bar.js";
import { InfoPanel } from "./ui/info-panel.js";

main().catch(showBootError);

async function main() {
  if (typeof Cesium === "undefined") {
    throw new Error(
      "Cesium failed to load from CDN. Check your network / ad blocker, " +
      "or download Cesium locally and swap the script tag in index.html.",
    );
  }

  const config = window.OSINT_CONFIG ?? {};
  const viewer = await createViewer("cesiumContainer");

  // Build data sources from registry; attach + start each.
  const sources = buildSources(config, { viewer });
  for (const src of sources) {
    src.attach(viewer);
    src.start();
  }

  // UI
  renderGlobeStyles({
    styles: availableStyles(config),
    container: document.getElementById("globeStyles"),
    current: config.GLOBE_STYLE ?? "esriAerial",
    onChange: (styleId) => applyStyle(viewer, styleId, config),
  });

  renderLayerToggles({
    sources,
    container: document.getElementById("layerToggles"),
    onToggle: (src, visible) => src.setVisible(visible),
  });

  renderStatusBar({
    sources,
    container: document.getElementById("statusBar"),
  });

  wireFilters({
    sources,
    minAltInput: document.getElementById("minAltFt"),
    callsignInput: document.getElementById("callsignFilter"),
  });

  const infoPanel = new InfoPanel({
    panelEl: document.getElementById("infoPanel"),
    contentEl: document.getElementById("infoContent"),
    closeBtn: document.getElementById("infoClose"),
  });

  // Click-to-select. Cesium's ScreenSpaceEventHandler gives us a clean entity pick.
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);
    const entity = picked?.id;
    if (entity instanceof Cesium.Entity && entity._props) {
      infoPanel.show(entity);
      viewer.selectedEntity = entity;
    } else {
      infoPanel.clear();
      viewer.selectedEntity = undefined;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Gentle warning when no keys are set.
  if (!config.CESIUM_ION_TOKEN && !config.GOOGLE_MAPS_KEY) {
    console.warn(
      "[osint-globe] No Cesium Ion or Google Maps key configured. " +
      "Falling back to default ellipsoid — imagery and 3D tiles are disabled. " +
      "See config.example.js for setup instructions.",
    );
  }

  window.__osint = { viewer, sources, infoPanel };
}

function showBootError(err) {
  console.error(err);
  const el = document.getElementById("bootError");
  if (!el) {
    alert(err?.message ?? String(err));
    return;
  }
  el.textContent =
    "Failed to start OSINT Globe\n\n" +
    (err?.message ?? String(err)) +
    "\n\nCheck the browser console for details.";
  el.classList.remove("hidden");
}
