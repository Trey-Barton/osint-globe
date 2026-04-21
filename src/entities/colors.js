// Altitude-based color ramp. Input: altitude in feet.
// Used to tint aircraft billboards by cruise level.

export function altitudeColor(ft) {
  if (ft == null || Number.isNaN(ft)) return Cesium.Color.fromCssColorString("#9aa9c2");
  if (ft < 1000)   return Cesium.Color.fromCssColorString("#ff5050"); // takeoff/landing
  if (ft < 10000)  return Cesium.Color.fromCssColorString("#ffb84a"); // low
  if (ft < 20000)  return Cesium.Color.fromCssColorString("#ffe259"); // climb
  if (ft < 30000)  return Cesium.Color.fromCssColorString("#a0e878"); // transition
  if (ft < 40000)  return Cesium.Color.fromCssColorString("#5cffa8"); // cruise
  return Cesium.Color.fromCssColorString("#4ad3ff");                  // high cruise
}

// Distinct color for military / special interest.
export const MIL_COLOR = Cesium.Color.fromCssColorString("#ff5050");

// Build a procedural aircraft triangle PNG once, returned as a data URL.
// Using a triangle billboard keeps us dependency-free (no asset loading).
export function aircraftIconDataURL(fillCss = "#ffffff", strokeCss = "#0a0d12") {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  // Point-up chevron (will be rotated to aircraft heading).
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.1);
  ctx.lineTo(size * 0.85, size * 0.85);
  ctx.lineTo(size * 0.5, size * 0.7);
  ctx.lineTo(size * 0.15, size * 0.85);
  ctx.closePath();
  ctx.fillStyle = fillCss;
  ctx.strokeStyle = strokeCss;
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();

  return canvas.toDataURL("image/png");
}

// Cache for procedurally generated icons (by fill color).
const iconCache = new Map();
export function iconFor(color) {
  const css = color.toCssColorString();
  if (!iconCache.has(css)) {
    iconCache.set(css, aircraftIconDataURL(css));
  }
  return iconCache.get(css);
}
