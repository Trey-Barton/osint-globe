// Copy this file to `config.js` and fill in your own keys.
// `config.js` is loaded as a plain script and exposes window.OSINT_CONFIG.
//
// Where to get keys:
//   CESIUM_ION_TOKEN   https://cesium.com/ion/tokens  (free tier, required for Cesium defaults)
//   GOOGLE_MAPS_KEY    https://console.cloud.google.com/  (enable "Map Tiles API"; $200/mo free credit)
//
// You can run without GOOGLE_MAPS_KEY — the globe will fall back to Cesium World Terrain
// + Bing imagery (less photorealistic, but functional).

window.OSINT_CONFIG = {
  // Both keys are OPTIONAL — the default open-source imagery (NASA GIBS, Esri)
  // works without them.
  CESIUM_ION_TOKEN: "",   // optional: enables real terrain elevation
  GOOGLE_MAPS_KEY:  "",   // optional: unlocks the "google3D" globe style

  // Default globe style on load:
  //   "esriAerial"   high-res aerial composite (Esri World Imagery)
  //   "blueMarble"   NASA seamless 500m mosaic
  //   "modisToday"   live MODIS Terra true-color (today's clouds)
  //   "nightLights"  NASA VIIRS Black Marble (city lights)
  //   "google3D"     photorealistic 3D — requires GOOGLE_MAPS_KEY
  GLOBE_STYLE: "esriAerial",

  // Initial camera position
  START_VIEW: {
    longitude: -98.5,
    latitude:  39.5,
    height:    7_000_000, // meters
  },

  // Per-source poll intervals (ms). Be respectful of free APIs.
  POLL_INTERVALS: {
    opensky: 12_000,    // OpenSky anonymous: ~10s minimum recommended
    adsbMil: 15_000,    // adsb.lol: be polite
  },

  // Optional: limit OpenSky to a bounding box to cut payload size & rate-limit pressure.
  // Set to null for worldwide (heavy). Format: { lamin, lomin, lamax, lomax }.
  OPENSKY_BBOX: null,

  // Same-origin proxy paths (see server.py). These hit our local proxy, which
  // forwards to the upstreams — avoids CORS restrictions on opensky / adsb.lol.
  ENDPOINTS: {
    opensky: "/proxy/opensky/api/states/all",
    adsbMil: "/proxy/adsbmil/v2/mil",
  },
};
