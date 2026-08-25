"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

/**
 * A map to click a point on. The published spot, not a private one: this is meant to answer
 * "where exactly", the thing pickup_area is deliberately too coarse to say.
 *
 * Imported dynamically inside the effect rather than at the top of the file, because Leaflet
 * reads `window` the moment it loads and this file is still built for the server first.
 *
 * No marker image asset. Leaflet's default pin is three PNGs whose paths assume a plain
 * script tag, and bundlers routinely serve the wrong one silently. A circle drawn with
 * Leaflet's own vector layer needs no file at all and cannot go missing.
 */
export function PinPicker({
  lat,
  lng,
  onChange,
  centerHint,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  /** Where to point the map when nothing has been clicked yet. Never places a pin. */
  centerHint?: { lat: number; lng: number } | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const marker = useRef<import("leaflet").CircleMarker | null>(null);
  // Read inside the click handler without retriggering the setup effect on every change.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!container.current || map.current) return;
    let cancelled = false;

    void import("leaflet").then((L) => {
      if (cancelled || !container.current || map.current) return;

      const start: [number, number] = [lat ?? 16.05, lng ?? 108.2];
      const instance = L.map(container.current).setView(start, lat && lng ? 15 : 5);
      // CARTO rather than OpenStreetMap's own tile server. OSM's is meant for light,
      // occasional use and blocks traffic it does not recognise; CARTO's basemap tiles are
      // free, need no key, and are meant to be embedded in exactly this kind of app. Voyager
      // over the plain grey style: it draws roads and labels, closer to what somebody
      // expects a map to look like than a flat colour with a dot on it.
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        maxZoom: 19,
        subdomains: "abcd",
      }).addTo(instance);

      const place = (position: [number, number]) => {
        if (marker.current) {
          marker.current.setLatLng(position);
        } else {
          marker.current = L.circleMarker(position, {
            radius: 9,
            color: "#1a1a1a",
            weight: 2,
            fillColor: "#1a1a1a",
            fillOpacity: 0.7,
          }).addTo(instance);
        }
      };

      if (lat && lng) place([lat, lng]);

      instance.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        const { lat: clickedLat, lng: clickedLng } = event.latlng;
        place([clickedLat, clickedLng]);
        onChangeRef.current(clickedLat, clickedLng);
      });

      map.current = instance;
    });

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // Set up once. Re-centering on a later change in lat/lng (loading a draft to edit) is
    // handled by the effect below rather than by tearing the map down and rebuilding it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Moves the existing pin when lat/lng arrive after the map already exists, which is
  // exactly what happens loading a listing to edit: the map mounts before the fetch resolves.
  //
  // Removes it when they go back to null, which happens when the chosen area changes:
  // without this the marker just sat wherever it last was, out of view after the map panned
  // to the new area, and a click there would silently move that same stale marker rather
  // than reveal that nothing was actually placed yet.
  useEffect(() => {
    if (!map.current) return;
    if (lat === null || lng === null) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    void import("leaflet").then((L) => {
      if (!map.current) return;
      const position: [number, number] = [lat, lng];
      if (marker.current) {
        marker.current.setLatLng(position);
      } else {
        marker.current = L.circleMarker(position, {
          radius: 9,
          color: "#1a1a1a",
          weight: 2,
          fillColor: "#1a1a1a",
          fillOpacity: 0.7,
        }).addTo(map.current);
      }
      map.current.setView(position, Math.max(map.current.getZoom(), 15));
    });
  }, [lat, lng]);

  // Pans to the chosen area, but only while nothing has been clicked yet. Once there is a
  // pin, picking a different ward should not silently drag it somewhere else: the owner
  // clicked a specific spot, and only a new click of theirs should move it.
  useEffect(() => {
    if (!map.current || !centerHint || lat !== null || lng !== null) return;
    map.current.setView([centerHint.lat, centerHint.lng], 13);
  }, [centerHint, lat, lng]);

  return (
    <div
      ref={container}
      className="mx-auto aspect-square h-[70vh] max-w-full rounded-card border border-line"
      aria-label="Click to drop a pin at the exact pickup spot"
    />
  );
}
