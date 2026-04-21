// Aircraft entity factory. Produces a function you can hand to a DataSource as
// `applyEntity`. Works for any flight-like source whose props look like:
//   { callsign, lon, lat, altFt, headingDeg, groundSpeedKts, source, ...extra }
//
// Usage:
//   const apply = makeAircraftApply({ colorFor: altitudeColor });
//   new OpenSkySource({ applyEntity: apply, ... })

import { altitudeColor, iconFor, MIL_COLOR } from "./colors.js";

export function makeAircraftApply({ colorFor = altitudeColor, isMilitary = false } = {}) {
  return function applyAircraft(props, entity) {
    if (props.lon == null || props.lat == null) return;

    const color = isMilitary ? MIL_COLOR : colorFor(props.altFt);
    const altMeters = Number.isFinite(props.altFt) ? props.altFt * 0.3048 : 0;
    const position = Cesium.Cartesian3.fromDegrees(props.lon, props.lat, altMeters);

    entity.position = position;

    // Billboard (icon). Rotated to heading. Cesium uses radians clockwise from north,
    // same as ADS-B "track" heading in degrees — just convert.
    // No disableDepthTestDistance: aircraft on the far side of the globe are
    // correctly occluded by the globe surface.
    if (!entity.billboard) {
      entity.billboard = new Cesium.BillboardGraphics({
        image: iconFor(color),
        width: 22,
        height: 22,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        scaleByDistance: new Cesium.NearFarScalar(1e3, 1.0, 2e7, 0.5),
      });
    } else {
      entity.billboard.image = iconFor(color);
    }
    if (Number.isFinite(props.headingDeg)) {
      // Cesium rotation: positive is clockwise from north when alignedAxis is up.
      entity.billboard.rotation = -Cesium.Math.toRadians(props.headingDeg);
      entity.billboard.alignedAxis = Cesium.Cartesian3.ZERO; // screen-space rotation
    }

    // Label
    const labelText = props.callsign?.trim() || props.icao24?.toUpperCase() || "—";
    if (!entity.label) {
      entity.label = new Cesium.LabelGraphics({
        text: labelText,
        font: "11px 'SF Mono', Menlo, monospace",
        fillColor: Cesium.Color.fromCssColorString("#d6e4ff"),
        outlineColor: Cesium.Color.fromCssColorString("#05080d"),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -18),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5e6),
        scale: 0.95,
      });
    } else {
      entity.label.text = labelText;
    }
  };
}
