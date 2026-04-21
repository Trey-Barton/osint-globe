// Drop-in plugin registry. To add a new data source:
//   1. Create a new file in this directory that extends DataSource (see opensky.js).
//   2. Import it here and add an entry to sources().
// That's it — controls.js will auto-render a toggle and status-bar.js will pick up counts.

import { OpenSkySource } from "./opensky.js";
import { AdsbMilSource } from "./adsb-mil.js";
import { OsmCamerasSource } from "./osm-cameras.js";

export function sources(config, ctx = {}) {
  const polls = config.POLL_INTERVALS ?? {};
  const ep = config.ENDPOINTS ?? {};
  return [
    new OpenSkySource({
      pollMs:   polls.opensky ?? 12_000,
      bbox:     config.OPENSKY_BBOX ?? null,
      endpoint: ep.opensky,
    }),
    new AdsbMilSource({
      pollMs:   polls.adsbMil ?? 15_000,
      endpoint: ep.adsbMil,
    }),
    new OsmCamerasSource({
      pollMs:   polls.osmCams ?? 8_000,
      viewer:   ctx.viewer,
    }),
    // Add more here. Examples worth considering:
    //   - AisStream for maritime AIS (wss://stream.aisstream.io/v0/stream, requires key)
    //   - NOAA earthquake feed (GeoJSON, no key, update every minute)
    //   - USGS volcanoes (GeoJSON)
    //   - ISS position via http://api.open-notify.org/iss-now.json
  ];
}
