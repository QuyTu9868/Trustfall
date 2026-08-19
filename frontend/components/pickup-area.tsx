"use client";

import { useEffect, useState } from "react";

type Place = { code: number; name: string };

/**
 * Province, district, ward, in that order, each list fetched once the one above it is chosen.
 *
 * Three levels rather than the two that were asked for, and the reason is countable: 32 of
 * the 63 provinces contain more than one ward with the same name, and Hanoi has two called
 * Phường Quang Trung. A province and ward pair would show somebody the same line twice with
 * nothing to tell them apart, and would hand the maps link an address it cannot resolve.
 *
 * What is stored is the composed sentence, not the three codes. The column is text, the
 * detail page prints it, and the directions link hands it to a maps application, none of
 * which want a code. It also means a listing published before this existed still reads
 * correctly: it is the same kind of value, just typed by a person rather than picked.
 */
export function PickupArea({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [provinces, setProvinces] = useState<Place[]>([]);
  const [districts, setDistricts] = useState<Place[]>([]);
  const [wards, setWards] = useState<Place[]>([]);

  const [province, setProvince] = useState<Place | null>(null);
  const [district, setDistrict] = useState<Place | null>(null);

  useEffect(() => {
    void fetch("/api/places")
      .then((r) => r.json())
      .then((r) => setProvinces(r.places ?? []))
      .catch(() => {});
  }, []);

  async function pickProvince(code: string) {
    const found = provinces.find((p) => String(p.code) === code) ?? null;
    setProvince(found);
    setDistrict(null);
    setDistricts([]);
    setWards([]);
    // Cleared rather than left behind: a half chosen area is not an area, and leaving the
    // old sentence in place would publish a listing pointing at the previous province.
    onChange("");
    if (!found) return;
    const r = await fetch(`/api/places?province=${found.code}`).then((x) => x.json()).catch(() => null);
    setDistricts(r?.places ?? []);
  }

  async function pickDistrict(code: string) {
    const found = districts.find((d) => String(d.code) === code) ?? null;
    setDistrict(found);
    setWards([]);
    onChange("");
    if (!found) return;
    const r = await fetch(`/api/places?district=${found.code}`).then((x) => x.json()).catch(() => null);
    setWards(r?.places ?? []);
  }

  function pickWard(code: string) {
    const found = wards.find((w) => String(w.code) === code);
    // Ward first, province last: the order a Vietnamese address is written in, and the
    // order a maps application reads best.
    onChange(found && district && province ? `${found.name}, ${district.name}, ${province.name}` : "");
  }

  const select = "rounded-control border border-line bg-surface px-3 py-2 text-sm";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <select
          value={province?.code ?? ""}
          onChange={(e) => void pickProvince(e.target.value)}
          className={select}
        >
          <option value="">Province or city</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          value={district?.code ?? ""}
          onChange={(e) => void pickDistrict(e.target.value)}
          disabled={districts.length === 0}
          className={`${select} disabled:opacity-40`}
        >
          <option value="">District</option>
          {districts.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </select>

        <select
          onChange={(e) => pickWard(e.target.value)}
          disabled={wards.length === 0}
          className={`${select} disabled:opacity-40`}
        >
          <option value="">Ward</option>
          {wards.map((w) => (
            <option key={w.code} value={w.code}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      {/* Shown back, because three dropdowns do not read as an address until they are one
          sentence, and this sentence is exactly what a renter will see and follow. */}
      {value && <p className="text-sm">{value}</p>}
    </div>
  );
}
