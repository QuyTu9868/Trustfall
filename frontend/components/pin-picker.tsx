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
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
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
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
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
  useEffect(() => {
    if (!map.current || lat === null || lng === null) return;
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

  return (
    <div
      ref={container}
      className="h-64 w-full rounded-card border border-line"
      aria-label="Click to drop a pin at the exact pickup spot"
    />
  );
}
