import { NextResponse } from "next/server";

/**
 * Turns "Ward, District, Province" into a rough centre to point the map at.
 *
 * Only ever moves the view. It never sets the listing's actual pin: that stays exactly
 * what the owner clicked, or nothing at all. This exists purely so the map opens somewhere
 * near the chosen area instead of a wide shot of the whole country every time.
 *
 * Proxied through the server rather than called from the browser because Photon does not
 * send Access-Control-Allow-Origin, and to keep the retry logic below in one place.
 *
 * Two things had to be true before this was worth shipping, found by actually plotting the
 * results rather than trusting a 200:
 *
 * Ward-level names frequently miss in Photon's Vietnam coverage, which lags the 2025
 * administrative merger this app's own province data predates. Each comma-separated segment
 * is dropped from the front until something matches, so a ward that is not indexed still
 * lands on its district or province.
 *
 * The administrative prefix is often the reason a real place still misses. "Thành phố Hà
 * Nội" returns nothing usable; "Hà Nội" alone matches the city immediately. Every attempt
 * below is tried both with its prefix ("Tỉnh ", "Huyện ", ...) and without.
 */
const PREFIXES = ["Thành phố ", "Tỉnh ", "Quận ", "Huyện ", "Thị xã ", "Phường ", "Xã ", "Thị trấn "];

function stripPrefix(segment: string) {
  const hit = PREFIXES.find((p) => segment.startsWith(p));
  return hit ? segment.slice(hit.length) : segment;
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "No query." }, { status: 400 });

  const parts = q.split(",").map((p) => p.trim());
  for (let start = 0; start < parts.length; start++) {
    const slice = parts.slice(start);
    const attempts = new Set([slice.join(", "), slice.map(stripPrefix).join(", ")]);
    for (const attempt of attempts) {
      const found = await search(attempt);
      if (found) return NextResponse.json(found);
    }
  }
  return NextResponse.json(null);
}

/**
 * A place, never a point of interest.
 *
 * "Huyện Đồng Văn, Tỉnh Hà Giang" - a real district - matched nothing as a place and instead
 * ranked a community hall in Bắc Ninh top, four hundred kilometres away, with nothing about
 * the match that looks wrong until the coordinates are plotted. osm_key "boundary" or
 * "place" is what tells an administrative area apart from whatever free-text scored highest,
 * and a centre that is confidently in the wrong province is worse than the map staying put.
 */
async function search(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const response = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`,
      { headers: { "user-agent": "Trustfall (trustfall-latch.vercel.app)" } }
    );
    if (!response.ok) return null;
    const body = await response.json();
    const features = Array.isArray(body?.features) ? body.features : [];
    const place = features.find((f: { properties?: { osm_key?: string } }) =>
      ["boundary", "place"].includes(f.properties?.osm_key ?? "")
    );
    const coords = place?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) return null;
    // GeoJSON order is [lng, lat], the opposite of what everything else here uses.
    const [lng, lat] = coords;
    return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
  } catch {
    return null;
  }
}
