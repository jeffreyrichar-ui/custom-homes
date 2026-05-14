import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TRADE_KINDS, type TradeKind } from "@custom-homes/shared";
import { api, type ProjectDetailResponse } from "../lib/api.js";
import { TradeForm } from "../components/TradeForm.js";
import { PdfActions } from "../components/PdfActions.js";
import { EntryCard } from "../components/EntryCard.js";
import { ShowerView } from "../components/ShowerView.js";

type EditingState = {
  roomId: string;
  trade: TradeKind;
  entry: Record<string, unknown>;
} | null;

export function SelectionsEdit() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ProjectDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tradePicker, setTradePicker] = useState<Record<string, TradeKind | null>>({});
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [pendingRoomName, setPendingRoomName] = useState("");
  const [editing, setEditing] = useState<EditingState>(null);
  const [viewMode, setViewMode] = useState<Record<string, "cards" | "shower">>({});

  const refresh = () => {
    if (!id) return;
    api
      .getProject(id)
      .then((res) => setData(res))
      .catch((err: Error) => setError(err.message));
  };
  useEffect(refresh, [id]);

  if (error) {
    return (
      <>
        <h1>Selections</h1>
        <div className="errors">Failed to load: {error}</div>
      </>
    );
  }
  if (!data || !id) return <p>Loading…</p>;

  const { project, rooms } = data;

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

  const handleSaveNewEntry = async (roomId: string, entry: Record<string, unknown>) => {
    await api.saveEntry(roomId, entry);
    setTradePicker((s) => ({ ...s, [roomId]: null }));
    refresh();
  };

  const handleSaveEdit = async (entry: Record<string, unknown>) => {
    if (!editing) return;
    await api.updateEntry(editing.trade, editing.entry.id as string, entry);
    setEditing(null);
    refresh();
  };

  const handleDuplicate = async (
    trade: TradeKind,
    sourceEntry: Record<string, unknown>,
    targetRoomId: string,
  ) => {
    const payload: Record<string, unknown> = { trade };
    for (const k of Object.keys(sourceEntry)) {
      if (["id", "room_id", "created_at", "synced_at", "external_id", "external_source"].includes(k)) continue;
      payload[k] = sourceEntry[k];
    }
    await api.saveEntry(targetRoomId, payload);
    refresh();
  };

  const handleDelete = async (trade: string, entryId: string) => {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await api.deleteEntry(trade, entryId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <p>
        <Link to="/projects">← All projects</Link>
      </p>
      <h1>{project.name}</h1>
      {project.address && <p className="subtle">{project.address}</p>}

      <PdfActions projectId={project.id} />

      {rooms.map((room) => {
        const mode = viewMode[room.id] ?? "cards";
        const allTileEntries = room.entries_by_trade.tile ?? [];
        const totalEntries = TRADE_KINDS.reduce(
          (n, t) => n + (room.entries_by_trade[t]?.length ?? 0),
          0,
        );
        return (
          <div key={room.id} className="room-block">
            <div className="room-header">
              <h2>{room.room_name}</h2>
              <div className="room-actions">
                <span className="room-count">
                  {totalEntries} {totalEntries === 1 ? "entry" : "entries"}
                </span>
                {allTileEntries.length > 1 && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setViewMode((s) => ({
                        ...s,
                        [room.id]: mode === "cards" ? "shower" : "cards",
                      }))
                    }
                  >
                    {mode === "cards" ? "Shower view" : "Card view"}
                  </button>
                )}
                {!tradePicker[room.id] && !editing && (
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
            </div>

            {tradePicker[room.id] && !editing && (
              <div className="trade-form-block">
                <h3>New {tradePicker[room.id]} entry</h3>
                <TradeForm
                  trade={tradePicker[room.id]!}
                  onCancel={() =>
                    setTradePicker((s) => ({ ...s, [room.id]: null }))
                  }
                  onSave={(entry) => handleSaveNewEntry(room.id, entry)}
                />
              </div>
            )}

            {editing && editing.roomId === room.id && (
              <div className="trade-form-block">
                <h3>Editing {editing.trade} entry</h3>
                <TradeForm
                  trade={editing.trade}
                  initial={editing.entry}
                  onCancel={() => setEditing(null)}
                  onSave={handleSaveEdit}
                />
              </div>
            )}

            {mode === "shower" && (
              <ShowerView room={room} />
            )}

            {mode === "cards" &&
              TRADE_KINDS.map((trade) => {
                const entries = room.entries_by_trade[trade] ?? [];
                if (entries.length === 0) return null;
                return (
                  <div key={trade} className="trade-section">
                    <h3>{trade}</h3>
                    <div className="entry-cards">
                      {entries.map((e, i) => (
                        <EntryCard
                          key={(e.id as string) ?? i}
                          trade={trade}
                          entry={e}
                          rooms={rooms}
                          currentRoomId={room.id}
                          onEdit={() =>
                            setEditing({
                              roomId: room.id,
                              trade,
                              entry: e,
                            })
                          }
                          onDelete={() =>
                            handleDelete(trade, e.id as string)
                          }
                          onDuplicate={(targetRoomId) =>
                            handleDuplicate(trade, e, targetRoomId)
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        );
      })}

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
