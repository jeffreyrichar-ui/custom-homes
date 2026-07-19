import { humanizeToken } from "@custom-homes/shared";
import { useState } from "react";
import type { TradeKind } from "@custom-homes/shared";
import { EntryImage } from "./EntryImage.js";
import { TileEntryPreview } from "./TileEntryPreview.js";
import { Icon } from "./Icon.js";

type Props = {
  trade: TradeKind;
  entry: Record<string, unknown>;
  rooms: Array<{ id: string; room_name: string }>;
  currentRoomId: string;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: (targetRoomId: string) => void;
};

const HIDDEN_FIELDS = new Set([
  "id",
  "room_id",
  "created_at",
  "synced_at",
  "external_id",
  "external_source",
  "trade",
  "is_new_entry",
  "status",
  "allowance",
  "deadline",
  "image_url",
]);

const PRIMARY_FIELDS: Record<string, string[]> = {
  tile: ["brand", "color", "location_in_room", "pattern"],
  paint: ["brand", "color_name", "sheen", "surface_application"],
  carpet: ["brand", "style", "color", "pile"],
  hardwood: ["brand", "species", "color", "plank_width"],
  cabinet: ["brand", "style", "color", "hardware"],
  countertop: ["brand", "material", "color", "edge_profile"],
};

function val(entry: Record<string, unknown>, k: string): string | null {
  const v = entry[k];
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

export function EntryCard({
  trade,
  entry,
  rooms,
  currentRoomId,
  onEdit,
  onDelete,
  onDuplicate,
}: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [showDupPicker, setShowDupPicker] = useState(false);
  const primary = PRIMARY_FIELDS[trade] ?? [];
  const isNovel = entry.is_new_entry === 1 || entry.is_new_entry === true;

  const allOtherFields = Object.keys(entry).filter(
    (k) =>
      !HIDDEN_FIELDS.has(k) &&
      !primary.includes(k) &&
      entry[k] !== null &&
      entry[k] !== undefined &&
      entry[k] !== "",
  );

  return (
    <div className="entry-card-v2">
      <div className="entry-card-header">
        {isNovel && <span className="tag created">new</span>}
        <div className="entry-card-actions">
          <button type="button" className="link icon-link" onClick={onEdit} title="Edit">
            <Icon name="edit" />
            <span>Edit</span>
          </button>
          {rooms.length > 1 && (
            <button
              type="button"
              className="link icon-link"
              onClick={() => setShowDupPicker((s) => !s)}
              title="Duplicate to another room"
            >
              <Icon name="duplicate" />
              <span>Copy</span>
            </button>
          )}
          <button
            type="button"
            className="link icon-link danger"
            onClick={onDelete}
            title="Delete"
          >
            <Icon name="delete" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {showDupPicker && (
        <select
          className="ac-input"
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            onDuplicate(v);
            setShowDupPicker(false);
            e.currentTarget.value = "";
          }}
        >
          <option value="">Copy to which room…</option>
          {rooms
            .filter((r) => r.id !== currentRoomId)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.room_name}
              </option>
            ))}
        </select>
      )}

      {trade === "tile" ? (
        <TileEntryPreview entry={entry} />
      ) : (
        <EntryImage
          brand={typeof entry.brand === "string" ? entry.brand : null}
          sku={typeof entry.sku === "string" ? entry.sku : null}
        />
      )}

      <div className="entry-primary">
        {primary.map((k) => {
          const v = val(entry, k);
          if (!v) return null;
          return (
            <div key={k} className="entry-primary-row">
              <span className="entry-key">{k.replace(/_/g, " ")}</span>
              <span className="entry-val">
                {k === "location_in_room" ? humanizeToken(String(v)) : v}
              </span>
            </div>
          );
        })}
      </div>

      {allOtherFields.length > 0 && (
        <details
          open={showDetails}
          onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}
          className="entry-details"
        >
          <summary>more</summary>
          <dl>
            {allOtherFields.map((k) => (
              <div key={k} className="entry-row">
                <dt>{k.replace(/_/g, " ")}</dt>
                <dd>{val(entry, k)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
