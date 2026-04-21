# OSINT Globe

Open-source live aerial surveillance on a hyper-realistic 3D globe. Built entirely
from free, no-key data: NASA satellite imagery, Esri aerial composite, OpenSky
civilian flights, and the ADS-B Exchange military mirror. Optional API keys
unlock terrain elevation (Cesium Ion) and Google's photorealistic 3D Tiles.

**No build step.** Pure static files + native ES modules + Cesium from CDN. Edit any
file, refresh the browser.

**Globe styles** — switch at runtime from the left panel:
- **Esri Aerial** — high-res aerial composite (default)
- **Blue Marble** — NASA's seamless 500m satellite mosaic
- **MODIS Today** — TODAY's actual MODIS Terra true-color image, with live cloud cover
- **Night Lights** — VIIRS Black Marble, city lights from space
- **Google 3D Tiles** — photorealistic 3D buildings & terrain (key-gated)

## Quick start

```bash
cd surveillance-platform
python3 server.py 8765
```

Open <http://localhost:8765>. You should see the globe plus live civilian and
military aircraft within a few seconds (ellipsoid globe until you add API keys).

> **Why `server.py` instead of `python3 -m http.server`?** OpenSky and adsb.lol
> block browser cross-origin requests. `server.py` is a ~80-line Python script
> that serves static files and reverse-proxies a whitelist of upstreams from the
> same origin so the browser can fetch them.

### Optional: enhance with API keys

The default open-source globe is already hyper-realistic — NASA Blue Marble +
MODIS clouds for today + Esri aerial + Cesium's atmosphere/sun/star skybox is
genuinely "Earth from orbit" quality. Two optional keys unlock more:

- **Cesium Ion token** — adds real-world terrain elevation (mountains have height).
  Free tier at <https://cesium.com/ion/tokens>. Drop into `config.js`.
- **Google Maps Platform key** — unlocks the "Google 3D Tiles" style with
  photorealistic 3D buildings. Enable "Map Tiles API" at
  <https://console.cloud.google.com/>. $200/mo free credit.

## Architecture

```
index.html              Cesium via CDN, dark UI chrome, mounts ./src/main.js
config.js               Your API keys + poll intervals (gitignore candidate)
styles.css              Dark surveillance theme
src/
  main.js               Bootstrap
  viewer.js             Cesium + 3D Tiles setup with graceful fallbacks
  data-sources/
    base.js             DataSource base class (poll loop, upsert, stale prune)
    opensky.js          OpenSky states/all endpoint
    adsb-mil.js         api.adsb.lol /v2/mil (free ADSBx mirror)
    registry.js         <-- add new sources here
  entities/
    aircraft.js         Shared aircraft entity factory
    colors.js           Altitude color ramp + procedural icons
  ui/
    controls.js         Layer toggles + filter inputs
    info-panel.js       Selected-entity details
    status-bar.js       Per-source counts, last-update, errors
```

## Adding a data source

Everything lives behind `DataSource` in `src/data-sources/base.js`. To add a feed:

1. Create `src/data-sources/my-source.js`:

    ```js
    import { DataSource } from "./base.js";
    import { makeAircraftApply } from "../entities/aircraft.js";

    export class MySource extends DataSource {
      constructor({ pollMs }) {
        super({
          id: "mysource",
          name: "My Source",
          color: "#a0e878",
          pollMs,
          applyEntity: makeAircraftApply(),
        });
      }

      async fetch() {
        const res = await fetch("https://example.com/feed.json");
        const body = await res.json();
        for (const obs of body.items) {
          this.upsert(obs.id, {
            callsign:       obs.name,
            lon:            obs.lon,
            lat:            obs.lat,
            altFt:          obs.altitude_ft,
            headingDeg:     obs.heading,
            groundSpeedKts: obs.speed_kts,
            source:         "My Source",
          });
        }
      }
    }
    ```

2. Register it in `src/data-sources/registry.js`:

    ```js
    import { MySource } from "./my-source.js";

    export function sources(config) {
      return [
        // ...existing sources
        new MySource({ pollMs: 10_000 }),
      ];
    }
    ```

Done. A toggle appears in the left panel, counts flow into the status bar, and stale
entries are pruned automatically.

For non-aircraft data (ships, earthquakes, ISS, etc.), write your own `applyEntity`
that sets `entity.point`, `entity.billboard`, etc. from your props.

## Data sources used

Imagery (open-source, no key):
- **[NASA EOSDIS GIBS](https://wiki.earthdata.nasa.gov/display/GIBS)** — Blue Marble, MODIS Terra true-color (daily), VIIRS Black
  Marble. WMTS tiles served free by NASA. Routed through `server.py` because GIBS
  doesn't return CORS headers.
- **[Esri World Imagery](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer)** — high-res aerial composite via the public ArcGIS REST
  endpoint. CORS-enabled.

Live tracking:
- **[OpenSky Network](https://opensky-network.org/apidoc/rest.html)** — worldwide civilian flight states. Anonymous rate limit is
  ~100 req/day; register for 4,000/day. Set `OPENSKY_BBOX` in `config.js` to restrict to
  a region and reduce payload.
- **[api.adsb.lol](https://api.adsb.lol/docs)** — free public mirror of ADS-B Exchange with military aircraft
  at `/v2/mil`.

Optional (key-gated):
- **[Cesium Ion](https://cesium.com/ion)** — adds real terrain elevation.
- **[Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles)** — photorealistic 3D buildings.

Engine:
- **[CesiumJS](https://cesium.com/platform/cesiumjs/)** — rendering, atmosphere/sun/stars built in.

## Known rough edges

- No historical trails yet. Each entity keeps only its latest position. Easy to add by
  attaching a `SampledPositionProperty` in `entities/aircraft.js`.
- OpenSky anonymous rate limit is tight; worldwide polling will hit caps quickly.
  Set `OPENSKY_BBOX` or register an account.
- No persistence. Reload = fresh state. Sufficient for a live-view tool.
- Static secrets in `config.js`. Cloud console key restrictions (HTTP referrer) are the
  intended mitigation, not secrecy.

## Extensibility ideas

- Ship tracking via [AIS Stream](https://aisstream.io/) (WebSocket, free key).
- Earthquakes via [USGS GeoJSON feed](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php).
- Lightning strikes via [Blitzortung](https://www.blitzortung.org/).
- ISS position via `http://api.open-notify.org/iss-now.json`.
- Historical playback: wrap `upsert()` with a `SampledPositionProperty` and drive
  with the Cesium clock.
