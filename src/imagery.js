// Globe imagery providers — all open-source / no-key by default.
//
// Providers:
//   esriAerial    : Esri World Imagery (high-res aerial composite)
//   blueMarble    : NASA GIBS BlueMarble_NextGeneration (seamless mosaic)
//   modisToday    : NASA GIBS MODIS Terra TrueColor for the latest date
//                   — shows TODAY's clouds, sea ice, dust, smoke
//   nightLights   : NASA GIBS VIIRS Black Marble (city lights from space)
//   google3D      : Google Photorealistic 3D Tiles (key-gated)
//
// Note on GIBS projections:
//   GIBS publishes tiles in both EPSG:4326 (geographic) and EPSG:3857 (Web
//   Mercator / "GoogleMapsCompatible"). We use 3857 because Cesium's
//   WebMercatorTilingScheme matches it natively. The 4326 matrix has
//   non-power-of-2 layouts (level 2 is 5x3 tiles, etc.) that don't fit
//   Cesium's GeographicTilingScheme.
//
// Adding a style: add an entry to GLOBE_STYLES with an async `build({ key, config })`
// returning { layers: [{ provider, alpha? }], tileset?: Cesium3DTileset }.

const PROXY_GIBS = "/proxy/gibs";

// Build a GIBS EPSG:3857 tile URL. Pass `date` only for time-varying layers.
function gibsTileUrl({ layer, matrixSet, format, date }) {
  const dateSeg = date ? `/${date}` : "";
  return (
    `${PROXY_GIBS}/wmts/epsg3857/best/${layer}/default${dateSeg}/${matrixSet}` +
    `/{TileMatrix}/{TileRow}/{TileCol}.${format}`
  );
}

function gibsProvider({ layer, matrixSet, format, date, maximumLevel, credit }) {
  const mime = format === "png" ? "image/png" : "image/jpeg";
  return new Cesium.WebMapTileServiceImageryProvider({
    url: gibsTileUrl({ layer, matrixSet, format, date }),
    layer,
    style: "default",
    format: mime,
    tileMatrixSetID: matrixSet,
    maximumLevel,
    tileWidth: 256,
    tileHeight: 256,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    credit: new Cesium.Credit(credit ?? "Imagery © NASA EOSDIS GIBS"),
  });
}

// GIBS daily layers may lag by a day or two; yesterday UTC is a safe default.
function gibsLatestDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const GLOBE_STYLES = {
  esriAerial: {
    name: "Esri Aerial",
    swatch: "#5cffa8",
    requiresKey: null,
    async build() {
      const provider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
        { enablePickFeatures: false },
      );
      return { layers: [{ provider, alpha: 1.0 }] };
    },
  },

  blueMarble: {
    name: "Blue Marble",
    swatch: "#4ad3ff",
    requiresKey: null,
    async build() {
      const provider = gibsProvider({
        layer: "BlueMarble_NextGeneration",
        matrixSet: "GoogleMapsCompatible_Level8",
        format: "jpeg",
        maximumLevel: 8,
      });
      return { layers: [{ provider, alpha: 1.0 }] };
    },
  },

  modisToday: {
    name: "MODIS Today",
    swatch: "#ffe259",
    requiresKey: null,
    async build() {
      // Base: Blue Marble fills any gaps (orbital swaths, poles, etc.)
      const base = gibsProvider({
        layer: "BlueMarble_NextGeneration",
        matrixSet: "GoogleMapsCompatible_Level8",
        format: "jpeg",
        maximumLevel: 8,
      });
      // MODIS Terra + Aqua for today. Each satellite has orbital gaps, but
      // Terra (10:30am) and Aqua (1:30pm) have offset passes and fill each
      // other's gaps. colorToAlpha turns the black no-data pixels transparent
      // so underlying layers show through.
      const date = gibsLatestDate();
      const terra = gibsProvider({
        layer: "MODIS_Terra_CorrectedReflectance_TrueColor",
        matrixSet: "GoogleMapsCompatible_Level9",
        format: "jpg",
        date,
        maximumLevel: 9,
      });
      const aqua = gibsProvider({
        layer: "MODIS_Aqua_CorrectedReflectance_TrueColor",
        matrixSet: "GoogleMapsCompatible_Level9",
        format: "jpg",
        date,
        maximumLevel: 9,
      });
      return {
        layers: [
          { provider: base,  alpha: 1.0 },
          { provider: aqua,  alpha: 1.0, colorToAlpha: "#000000", colorToAlphaThreshold: 0.08 },
          { provider: terra, alpha: 1.0, colorToAlpha: "#000000", colorToAlphaThreshold: 0.08 },
        ],
      };
    },
  },

  nightLights: {
    name: "Night Lights",
    swatch: "#ffb84a",
    requiresKey: null,
    // VIIRS Black Marble is a night-only composite — disable sun-driven globe
    // lighting + atmosphere brightening so the city lights aren't washed out.
    sceneOverrides: {
      enableLighting: false,
      atmosphereLightIntensity: 0.5,
      showGroundAtmosphere: false,
      fog: false,
      bloom: true,
    },
    async build() {
      const provider = gibsProvider({
        layer: "VIIRS_Black_Marble",
        matrixSet: "GoogleMapsCompatible_Level8",
        format: "png",
        maximumLevel: 8,
      });
      return { layers: [{ provider, alpha: 1.0 }] };
    },
  },

  google3D: {
    name: "Google 3D Tiles",
    swatch: "#ff5050",
    requiresKey: "GOOGLE_MAPS_KEY",
    async build({ key }) {
      if (!key) throw new Error("GOOGLE_MAPS_KEY required for google3D");
      const url = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(key)}`;
      const tileset = await Cesium.Cesium3DTileset.fromUrl(url, { showCreditsOnScreen: true });
      return { layers: [], tileset };
    },
  },
};

// Default scene tuning. applyStyle() resets to these between styles, then
// applies any per-style overrides (see sceneOverrides on each style).
export const DEFAULT_SCENE = {
  enableLighting: true,
  atmosphereLightIntensity: 12.0,
  showGroundAtmosphere: true,
  fog: true,
  bloom: true,
};

// Apply a style to the viewer. Clears existing imagery / tileset first.
export async function applyStyle(viewer, styleId, config = {}) {
  const style = GLOBE_STYLES[styleId];
  if (!style) throw new Error(`Unknown globe style: ${styleId}`);

  const key = style.requiresKey ? config[style.requiresKey] : null;
  if (style.requiresKey && !key) {
    throw new Error(`Style "${style.name}" needs ${style.requiresKey} in config.js`);
  }

  viewer.imageryLayers.removeAll();
  if (viewer.__osintTileset) {
    viewer.scene.primitives.remove(viewer.__osintTileset);
    viewer.__osintTileset = null;
  }
  viewer.scene.globe.show = true;

  const built = await style.build({ key, config });

  for (const spec of built.layers ?? []) {
    const layer = viewer.imageryLayers.addImageryProvider(spec.provider);
    if (spec.alpha != null) layer.alpha = spec.alpha;
    if (spec.colorToAlpha) {
      layer.colorToAlpha = Cesium.Color.fromCssColorString(spec.colorToAlpha);
      layer.colorToAlphaThreshold = spec.colorToAlphaThreshold ?? 0.08;
    }
  }

  if (built.tileset) {
    viewer.scene.primitives.add(built.tileset);
    viewer.scene.globe.show = false;
    viewer.__osintTileset = built.tileset;
  }

  applySceneOverrides(viewer, { ...DEFAULT_SCENE, ...(style.sceneOverrides ?? {}) });

  return built;
}

function applySceneOverrides(viewer, opts) {
  const scene = viewer.scene;
  const globe = scene.globe;
  if ("enableLighting" in opts) globe.enableLighting = opts.enableLighting;
  if ("showGroundAtmosphere" in opts) globe.showGroundAtmosphere = opts.showGroundAtmosphere;
  if ("atmosphereLightIntensity" in opts && "atmosphereLightIntensity" in globe) {
    globe.atmosphereLightIntensity = opts.atmosphereLightIntensity;
  }
  if ("fog" in opts) scene.fog.enabled = !!opts.fog;
  if ("bloom" in opts && scene.postProcessStages.bloom) {
    scene.postProcessStages.bloom.enabled = !!opts.bloom;
  }
}

// Styles usable with current config (key-gated ones hidden if no key set).
export function availableStyles(config = {}) {
  return Object.entries(GLOBE_STYLES)
    .filter(([, s]) => !s.requiresKey || !!config[s.requiresKey])
    .map(([id, s]) => ({ id, ...s }));
}
