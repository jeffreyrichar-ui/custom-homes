import { TileEntryPreview } from "./TileEntryPreview.js";

type Props = {
  room: {
    id: string;
    room_name: string;
    entries_by_trade: Record<string, Array<Record<string, unknown>>>;
  };
};

const LOCATION_ORDER: Record<string, number> = {
  floor: 1,
  shower_floor: 2,
  shower_walls: 3,
  shower_walls_accent: 4,
  shower_niche: 5,
  shower_bench: 6,
  tub_surround: 7,
  vanity_backsplash: 8,
  backsplash: 9,
  kitchen_backsplash: 10,
  wainscot: 11,
  fireplace: 12,
};

function locationLabel(loc: string): string {
  return loc.replace(/_/g, " ");
}

/**
 * Visual board layout: every tile entry in a room rendered side-by-side
 * with its pattern preview + location label. Lets Tamara eyeball the
 * full shower at once and spot a clash (wrong color combination, mixed
 * grout colors, etc.) before submitting.
 */
export function ShowerView({ room }: Props) {
  const tiles = room.entries_by_trade.tile ?? [];
  if (tiles.length === 0) {
    return <p className="subtle">No tile entries in this room yet.</p>;
  }

  const sorted = [...tiles].sort((a, b) => {
    const la = typeof a.location_in_room === "string" ? a.location_in_room : "";
    const lb = typeof b.location_in_room === "string" ? b.location_in_room : "";
    const oa = LOCATION_ORDER[la] ?? 999;
    const ob = LOCATION_ORDER[lb] ?? 999;
    return oa - ob;
  });

  // Group by tile identity (same brand+style+color = same tile across locations)
  type Group = {
    key: string;
    sample: Record<string, unknown>;
    locations: string[];
  };
  const groups = new Map<string, Group>();
  for (const t of sorted) {
    const key = [t.brand, t.style, t.color]
      .map((v) => (typeof v === "string" ? v : ""))
      .join("|");
    const loc = typeof t.location_in_room === "string" ? t.location_in_room : "—";
    if (!groups.has(key)) {
      groups.set(key, { key, sample: t, locations: [loc] });
    } else {
      groups.get(key)!.locations.push(loc);
    }
  }

  // Check for grout-color consistency within shower zones
  const SHOWER_LOCS = new Set([
    "shower_walls",
    "shower_floor",
    "shower_niche",
    "shower_walls_accent",
    "shower_bench",
  ]);
  const showerGrouts = new Set<string>();
  for (const t of sorted) {
    const loc = typeof t.location_in_room === "string" ? t.location_in_room : "";
    if (SHOWER_LOCS.has(loc) && typeof t.grout_color === "string" && t.grout_color) {
      showerGrouts.add(t.grout_color);
    }
  }
  const groutClash = showerGrouts.size > 1;

  return (
    <div className="shower-view">
      {groutClash && (
        <div className="shower-warn">
          ⚠ Shower has multiple grout colors: {Array.from(showerGrouts).join(", ")}. Confirm intentional.
        </div>
      )}
      <div className="shower-grid">
        {Array.from(groups.values()).map((g) => {
          const e = g.sample;
          return (
            <div key={g.key} className="shower-tile">
              <div className="shower-tile-locs">
                {g.locations.map((loc) => (
                  <span key={loc} className="shower-loc-pill">
                    {locationLabel(loc)}
                  </span>
                ))}
              </div>
              <TileEntryPreview entry={e} />
              <div className="shower-tile-info">
                <strong>
                  {String(e.brand ?? "")}
                  {e.style ? ` · ${String(e.style)}` : ""}
                </strong>
                <span className="subtle">
                  {String(e.color ?? "—")}
                  {e.grout_color ? ` · grout ${String(e.grout_color)}` : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
