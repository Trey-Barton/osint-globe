// OpenStreetMap surveillance cameras via the Overpass API.
//
// Pulls every node tagged `man_made=surveillance` within the current camera
// view. This is the same dataset openstreetmap.org serves, maintained by the
// OSM community — tens of thousands of documented CCTV locations worldwide,
// including many with camera:type / surveillance:type / operator tags that
// tell you what kind of camera it is.
//
// Docs: https://wiki.openstreetmap.org/wiki/Key:surveillance
//       https://wiki.openstreetmap.org/wiki/Overpass_API
//
// Because the dataset is huge, we query only the current viewport's bounding
// box, re-fetching when the camera moves. That keeps payloads small and
// avoids hammering Overpass.

import { DataSource } from "./base.js";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const MAX_ELEMENTS = 5000;

export class OsmCamerasSource extends DataSource {
  constructor({ pollMs, viewer }) {
    super({
      id: "osmCams",
      name: "OSM Cameras",
      color: "#a0e878",
      pollMs,
      applyEntity: applyCamera,
    });
    this.viewer = viewer;
    this._lastBbox = null;
    this._inflight = null;
  }

  // Compute viewport bbox (lamin, lomin, lamax, lomax).
  _bbox() {
    const v = this.viewer;
    const rect = v.camera.computeViewRectangle(v.scene.globe.ellipsoid);
    if (!rect) return null;
    const lamin = Cesium.Math.toDegrees(rect.south);
    const lamax = Cesium.Math.toDegrees(rect.north);
    const lomin = Cesium.Math.toDegrees(rect.west);
    const lomax = Cesium.Math.toDegrees(rect.east);
    // Skip if viewport wraps antimeridian or spans the whole globe — Overpass
    // would return millions of rows. We only fetch when zoomed in.
    const spanLat = lamax - lamin;
    const spanLon = lomax - lomin;
    if (spanLat > 15 || spanLon > 30 || lomin > lomax) return null;
    return { lamin, lomin, lamax, lomax };
  }

  async fetch() {
    const bbox = this._bbox();
    if (!bbox) {
      // Zoomed too far out — drop current markers, wait for user to zoom in.
      this.cesiumDS.entities.removeAll();
      this._lastSeenAt.clear();
      this._lastBbox = null;
      return;
    }

    // Skip re-fetching if view hasn't moved significantly.
    if (this._lastBbox && bboxSimilar(bbox, this._lastBbox, 0.1)) return;

    const q = `[out:json][timeout:20];node["man_made"="surveillance"](${bbox.lamin},${bbox.lomin},${bbox.lamax},${bbox.lomax});out body ${MAX_ELEMENTS};`;
    const url = `${OVERPASS_URL}?data=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const body = await res.json();
    const elements = body?.elements ?? [];

    // When viewport changes significantly, clear old entities outside the new bbox.
    this._lastBbox = bbox;

    for (const el of elements) {
      if (el.type !== "node") continue;
      if (!Number.isFinite(el.lat) || !Number.isFinite(el.lon)) continue;
      const tags = el.tags ?? {};
      this.upsert(String(el.id), {
        id:          el.id,
        lon:         el.lon,
        lat:         el.lat,
        type:        tags["camera:type"]        ?? tags["surveillance:type"] ?? "camera",
        zone:        tags.surveillance          ?? null,
        direction:   tags["camera:direction"]   ?? tags.direction ?? null,
        mount:       tags["camera:mount"]       ?? null,
        operator:    tags.operator              ?? null,
        description: tags.description           ?? null,
        name:        tags.name                  ?? null,
        source:      "OpenStreetMap",
        sourceTag:   "cam",
        callsign:    tags.name ?? tags.operator ?? `cam ${el.id}`,
      });
    }
  }
}

// Simple point + label entity. Depth-tested so cameras on the far side of the
// globe are hidden. No heading rotation — most OSM entries don't include it.
function applyCamera(props, entity) {
  const position = Cesium.Cartesian3.fromDegrees(props.lon, props.lat, 0);
  entity.position = position;

  if (!entity.point) {
    entity.point = new Cesium.PointGraphics({
      color: Cesium.Color.fromCssColorString("#a0e878").withAlpha(0.9),
      outlineColor: Cesium.Color.fromCssColorString("#1a2614"),
      outlineWidth: 1,
      pixelSize: 6,
      scaleByDistance: new Cesium.NearFarScalar(1e3, 1.3, 2e6, 0.6),
    });
  }

  if (!entity.label) {
    entity.label = new Cesium.LabelGraphics({
      text: props.name || props.operator || props.type || "cam",
      font: "10px 'SF Mono', Menlo, monospace",
      fillColor: Cesium.Color.fromCssColorString("#c9ffa0"),
      outlineColor: Cesium.Color.fromCssColorString("#05080d"),
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -12),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      // Only show labels when zoomed in enough to avoid visual clutter.
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50_000),
      scale: 0.9,
    });
  }
}

function bboxSimilar(a, b, tol) {
  return (
    Math.abs(a.lamin - b.lamin) < tol &&
    Math.abs(a.lamax - b.lamax) < tol &&
    Math.abs(a.lomin - b.lomin) < tol &&
    Math.abs(a.lomax - b.lomax) < tol
  );
}
