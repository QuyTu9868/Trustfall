import { NextResponse } from "next/server";
import places from "@/data/vn-places.json";

/**
 * Vietnam's provinces, districts and wards, one level at a time.
 *
 * Read from a file in the repository rather than from anybody's API. GHN's needs an account
 * and answers 401 without one, which would mean a third party, a token to keep and a
 * service that can be down while somebody is trying to publish a listing. The open dataset
 * this was built from needs no key, but calling it on every page load has the same problem
 * for the same reason: a form that cannot be filled in because a server somewhere is busy.
 *
 * A level at a time, rather than the whole tree, because the whole tree is 370KB and the
 * browser needs a few kilobytes of it. UI-REFERENCE.md section 5 asks for light over pretty,
 * and this page is filled in on whatever laptop somebody happens to have.
 *
 * The data predates the 2025 reform: sixty three provinces, still with the district level
 * that the reform removed. That is deliberate and was asked for. What it means in practice
 * is that these names are administrative history rather than current administrative fact,
 * which is fine for deciding where to go and collect a scooter, and would not be fine for
 * anything official.
 */
type Ward = { c: number; n: string };
type District = { c: number; n: string; w: Ward[] };
type Province = { c: number; n: string; d: District[] };

const PROVINCES = places as Province[];

/** Names only, keyed by code. The browser never needs the nesting, only one list at a time. */
const named = (items: { c: number; n: string }[]) =>
  items.map((item) => ({ code: item.c, name: item.n }));

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const province = Number(params.get("province"));
  const district = Number(params.get("district"));

  if (params.has("district")) {
    if (!Number.isInteger(district)) {
      return NextResponse.json({ error: "That is not a district code." }, { status: 400 });
    }
    for (const p of PROVINCES) {
      const found = p.d.find((d) => d.c === district);
      if (found) return NextResponse.json({ places: named(found.w) });
    }
    return NextResponse.json({ places: [] });
  }

  if (params.has("province")) {
    if (!Number.isInteger(province)) {
      return NextResponse.json({ error: "That is not a province code." }, { status: 400 });
    }
    const found = PROVINCES.find((p) => p.c === province);
    return NextResponse.json({ places: found ? named(found.d) : [] });
  }

  return NextResponse.json({ places: named(PROVINCES) });
}
