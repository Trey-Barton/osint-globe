// Cesium viewer setup. Default globe is fully open-source / no-key:
//   imagery: NASA GIBS or Esri World Imagery (configurable)
//   atmosphere/sun/stars: Cesium built-ins, tuned for "planet from space" feel
//
// If a Cesium Ion token is configured, world terrain elevation is enabled.
// If a Google Maps key is configured, the "google3D" style becomes selectable.

import { applyStyle } from "./imagery.js";

const config = window.OSINT_CONFIG ?? {};

export async function createViewer(containerId = "cesiumContainer") {
  // Ion token is purely optional — used for terrain elevation if provided.
  Cesium.Ion.defaultAccessToken = config.CESIUM_ION_TOKEN || "";

  const viewer = new Cesium.Viewer(containerId, {
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    // Don't let Cesium try to load default Ion imagery (would 401 without token).
    baseLayer: false,
    skyBox: undefined, // use built-in star skybox
    skyAtmosphere: undefined, // use built-in atmosphere
  });

  // Hide attribution chrome (we display our own credits via Cesium credit display).
  viewer.cesiumWidget.creditContainer.style.display = "none";

  tuneScene(viewer);

  // Optional terrain elevation if Ion token is set.
  if (config.CESIUM_ION_TOKEN) {
    try {
      viewer.terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1);
      console.log("[viewer] Cesium World Terrain attached");
    } catch (err) {
      console.warn("[viewer] World Terrain failed:", err);
    }
  }

  // Apply default globe style.
  const styleId = config.GLOBE_STYLE ?? "esriAerial";
  try {
    await applyStyle(viewer, styleId, config);
    console.log(`[viewer] Imagery style: ${styleId}`);
  } catch (err) {
    console.warn(`[viewer] Style "${styleId}" failed; falling back to esriAerial`, err);
    await applyStyle(viewer, "esriAerial", config);
  }

  // Camera fly-to.
  const sv = config.START_VIEW ?? { longitude: -98.5, latitude: 39.5, height: 7_000_000 };
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(sv.longitude, sv.latitude, sv.height),
    duration: 0,
  });

  return viewer;
}

// Visual tuning for the planet-from-space look. All defaults are conservative
// — bump these if you want a more cinematic feel.
function tuneScene(viewer) {
  const scene  = viewer.scene;
  const globe  = scene.globe;

  // Sun-driven lighting on the globe surface produces a real day/night terminator.
  globe.enableLighting = true;
  globe.dynamicAtmosphereLighting = true;
  if ("dynamicAtmosphereLightingFromSun" in globe) {
    globe.dynamicAtmosphereLightingFromSun = true;
  }

  // Atmosphere parameters. The defaults are subtle — these slightly enhance
  // horizon glow and Rayleigh scattering for a more vivid blue limb.
  if ("atmosphereLightIntensity" in globe) globe.atmosphereLightIntensity = 12.0;
  if ("atmosphereMieCoefficient" in globe) {
    globe.atmosphereMieCoefficient = new Cesium.Cartesian3(21e-6, 21e-6, 21e-6);
  }
  globe.showGroundAtmosphere = true;

  // Sky and stars
  scene.skyAtmosphere.show = true;
  if (scene.skyBox) scene.skyBox.show = true;
  if (scene.sun)    scene.sun.show = true;
  if (scene.moon)   scene.moon.show = true;

  // Fog adds depth at glancing angles.
  scene.fog.enabled = true;
  scene.fog.density = 8.0e-5;

  // Anti-aliasing.
  scene.postProcessStages.fxaa.enabled = true;

  // Subtle bloom for the sun — gives that "from orbit" feel without overdoing it.
  if (scene.postProcessStages.bloom) {
    scene.postProcessStages.bloom.enabled = true;
    const u = scene.postProcessStages.bloom.uniforms;
    u.glowOnly        = false;
    u.contrast        = 128;
    u.brightness      = -0.3;
    u.delta           = 1.0;
    u.sigma           = 2.0;
    u.stepSize        = 1.0;
  }

  // Drive scene.time from real wall-clock so the day/night terminator is correct.
  viewer.clock.shouldAnimate = true;
  viewer.clock.currentTime = Cesium.JulianDate.now();
  viewer.clock.multiplier = 1;

  // Zoom tuning: faster scroll, smooth inertia, can get closer to surface.
  const cam = scene.screenSpaceCameraController;
  cam.minimumZoomDistance = 50;            // can zoom in to ~rooftop (was ~2000m default)
  cam.maximumZoomDistance = 25_000_000;    // back to geostationary-ish
  cam.zoomEventTypes = [                   // wheel + pinch + right-drag to zoom
    Cesium.CameraEventType.WHEEL,
    Cesium.CameraEventType.PINCH,
    Cesium.CameraEventType.RIGHT_DRAG,
  ];
  cam.inertiaZoom = 0.9;                   // smooth glide after scroll (0..1)
  cam.inertiaSpin = 0.85;
  cam.inertiaTranslate = 0.85;
  cam._zoomFactor = 8.0;                   // wheel tick sensitivity (default ~5)
}
