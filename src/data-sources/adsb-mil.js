// Military ADS-B feed via api.adsb.lol — a free public mirror of ADS-B Exchange data
// with CORS enabled. ADSBx's own API now requires a subscription; adsb.lol, airplanes.live,
// and adsb.fi are the community-maintained free alternatives.
//
// Docs: https://api.adsb.lol/docs
// /v2/mil returns all aircraft currently tagged as military.
//
// Response shape (v2):
//   { ac: [ { hex, flight, lat, lon, alt_baro, alt_geom, gs, track, category, t, r, ... } ], ... }
//     hex       ICAO 24-bit hex
//     flight    callsign (space-padded)
//     lat/lon   degrees
//     alt_baro  feet (can be "ground")
//     alt_geom  feet
//     gs        ground speed, knots
//     track     degrees true
//     t         aircraft type (e.g. "C17")
//     r         registration

import { DataSource } from "./base.js";
import { makeAircraftApply } from "../entities/aircraft.js";

export class AdsbMilSource extends DataSource {
  constructor({ pollMs, endpoint }) {
    super({
      id: "adsbMil",
      name: "ADS-B Military",
      color: "#ff5050",
      pollMs,
      applyEntity: makeAircraftApply({ isMilitary: true }),
    });
    this.endpoint = endpoint ?? "/proxy/adsbmil/v2/mil";
  }

  async fetch() {
    const res = await fetch(this.endpoint, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`adsb.lol HTTP ${res.status}`);
    const body = await res.json();
    const ac = body?.ac ?? [];

    for (const a of ac) {
      const icao24 = a.hex;
      if (!icao24) continue;
      if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;

      const altFt =
        Number.isFinite(a.alt_geom) ? a.alt_geom :
        Number.isFinite(a.alt_baro) ? a.alt_baro :
        a.alt_baro === "ground" ? 0 : null;

      this.upsert(icao24, {
        icao24,
        callsign:        (a.flight ?? "").trim() || null,
        lon:             a.lon,
        lat:             a.lat,
        altFt,
        headingDeg:      a.track,
        groundSpeedKts:  a.gs,
        registration:    a.r,
        typeCode:        a.t,
        squawk:          a.squawk,
        onGround:        a.alt_baro === "ground",
        source:          "ADS-B Mil",
        sourceTag:       "mil",
      });
    }
  }
}
