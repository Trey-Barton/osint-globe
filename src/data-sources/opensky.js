// OpenSky Network: anonymous public "states" endpoint. Worldwide civilian air traffic.
// Docs: https://openskynetwork.github.io/opensky-api/rest.html
//
// State vector array indices (see docs):
//   0 icao24        string  — unique ICAO 24-bit address (hex)
//   1 callsign      string  — up to 8 chars, often padded
//   2 origin_country string
//   3 time_position int     — last position report, unix seconds
//   4 last_contact  int
//   5 longitude     float
//   6 latitude      float
//   7 baro_altitude float   — meters
//   8 on_ground     bool
//   9 velocity      float   — m/s
//  10 true_track    float   — degrees (0-360, 0=north, clockwise)
//  11 vertical_rate float   — m/s
//  12 sensors       array
//  13 geo_altitude  float   — meters
//  14 squawk        string
//  15 spi           bool
//  16 position_source int
//  17 category      int

import { DataSource } from "./base.js";
import { makeAircraftApply } from "../entities/aircraft.js";

const MPS_TO_KTS = 1.94384;
const M_TO_FT    = 3.28084;

export class OpenSkySource extends DataSource {
  constructor({ pollMs, bbox = null, endpoint }) {
    super({
      id: "opensky",
      name: "OpenSky (civilian)",
      color: "#4ad3ff",
      pollMs,
      applyEntity: makeAircraftApply({ isMilitary: false }),
    });
    this.bbox = bbox;
    this.endpoint = endpoint ?? "/proxy/opensky/api/states/all";
  }

  async fetch() {
    const params = this.bbox
      ? `?lamin=${this.bbox.lamin}&lomin=${this.bbox.lomin}&lamax=${this.bbox.lamax}&lomax=${this.bbox.lomax}`
      : "";
    const url = `${this.endpoint}${params}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`);
    const body = await res.json();
    const states = body?.states ?? [];

    for (const s of states) {
      const icao24 = s[0];
      if (!icao24) continue;
      const lon = s[5];
      const lat = s[6];
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

      const geoAltM  = s[13];
      const baroAltM = s[7];
      const altM = Number.isFinite(geoAltM) ? geoAltM : baroAltM;
      const altFt = Number.isFinite(altM) ? altM * M_TO_FT : null;

      const velMps = s[9];
      const speedKts = Number.isFinite(velMps) ? velMps * MPS_TO_KTS : null;

      this.upsert(icao24, {
        icao24,
        callsign:        (s[1] ?? "").trim() || null,
        originCountry:   s[2],
        lon,
        lat,
        altFt,
        headingDeg:      s[10],
        groundSpeedKts:  speedKts,
        verticalRateFpm: Number.isFinite(s[11]) ? s[11] * M_TO_FT * 60 : null,
        onGround:        !!s[8],
        squawk:          s[14],
        source:          "OpenSky",
        sourceTag:       "civ",
      });
    }
  }
}
