import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TRADE_KINDS, type TradeKind } from "@custom-homes/shared";
import { api, type ProjectDetailResponse } from "../lib/api.js";
import { TradeForm } from "../components/TradeForm.js";
import { EntryImage } from "../components/EntryImage.js";
import { TileEntryPreview } from "../components/TileEntryPreview.js";

const HIDE = new Set([
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

export function SelectionsEdit() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ProjectDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Per-room ephemeral UI state
  const [newRoomName, setNewRoomName] = useState<Record<string, string>>({});
  const [tradePicker, setTradePicker] = useState<Record<string, TradeKind | null>>({});
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [pendingRoomName, setPendingRoomName] = useState("");

  const refresh = () => {
    if (!id) return;
    api
      .getProject(id)
      .then((res) => setData(res))
      .catch((err: Error) => setError(err.message));
  };
  useEffect(refresh, [id]);

  if (error)
    return (
      <>
        <h1>Selections</h1>
        <div className="errors">Failed to load: {error}</div>
      </>
    );
  if (!data || !id) return <p>Loading…</p>;

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingRoomName.trim()) return;
    try {
      await api.addRoom(id, pendingRoomName.trim());
      setPendingRoomName("");
      setShowAddRoom(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveEntry = async (
    roomId: string,
    entry: Record<string, unknown>,
  ) => {
    await api.saveEntry(roomId, entry);
    setTradePicker((s) => ({ ...s, [roomId]: null }));
    refresh();
  };

  const handleDeleteEntry = async (trade: string, entryId: string) => {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await api.deleteEntry(trade, entryId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const { project, rooms } = data;

  return (
    <>
      <p>
        <Link to="/projects">← All projects</Link>
      </p>
      <h1>{project.name}</h1>
      {project.address && <p>{project.address}</p>}

      {rooms.map((room) => (
        <div key={room.id} className="room-block">
          <div className="room-header">
            <h2>{room.room_name}</h2>
            {!tradePicker[room.id] && (
              <select
                className="ac-input"
                style={{ width: "auto" }}
                onChange={(e) => {
                  const v = e.target.value as TradeKind | "";
                  if (v) setTradePicker((s) => ({ ...s, [room.id]: v }));
                  e.currentTarget.value = "";
                }}
                defaultValue=""
              >
                <option value="">+ Add trade…</option>
                {TRADE_KINDS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>

          {tradePicker[room.id] && (
            <div className="trade-form-block">
              <h3>New {tradePicker[room.id]} entry</h3>
              <TradeForm
                trade={tradePicker[room.id]!}
                onCancel={() => setTradePicker((s) => ({ ...s, [room.id]: null }))}
                onSave={(entry) => handleSaveEntry(room.id, entry)}
              />
            </div>
          )}

          {TRADE_KINDS.map((trade) => {
            const entries = room.entries_by_trade[trade] ?? [];
            if (entries.length === 0) return null;
            return (
              <div key={trade} className="trade-section">
                <h3>{trade}</h3>
                <div className="entry-cards">
                  {entries.map((e, i) => (
                    <div key={(e.id as string) ?? i} className="entry-card">
                      {e.is_new_entry === 1 || e.is_new_entry === true ? (
                        <span className="tag created">new</span>
                      ) : null}
                      {trade === "tile" ? (
                        <TileEntryPreview entry={e} />
                      ) : (
                        <EntryImage
                          brand={typeof e.brand === "string" ? e.brand : null}
                          sku={typeof e.sku === "string" ? e.sku : null}
                        />
                      )}
                      <dl>
                        {Object.entries(e).map(([k, v]) => {
                          if (HIDE.has(k)) return null;
                          if (v === null || v === undefined || v === "") return null;
                          return (
                            <div key={k} className="entry-row">
                              <dt>{k}</dt>
                              <dd>{String(v)}</dd>
                            </div>
                          );
                        })}
                      </dl>
                      <button
                        type="button"
                        className="link danger"
                        onClick={() => handleDeleteEntry(trade, e.id as string)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {showAddRoom ? (
        <form onSubmit={handleAddRoom} className="add-room-form">
          <input
            className="ac-input"
            placeholder="Room name (e.g. Master Bath)"
            value={pendingRoomName}
            onChange={(e) => setPendingRoomName(e.target.value)}
            autoFocus
          />
          <button type="submit">Add room</button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setShowAddRoom(false);
              setPendingRoomName("");
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button onClick={() => setShowAddRoom(true)}>+ Add room</button>
      )}
    </>
  );
}
