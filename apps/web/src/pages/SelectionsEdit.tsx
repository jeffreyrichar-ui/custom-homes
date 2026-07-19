import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TRADE_KINDS, type TradeKind } from "@custom-homes/shared";
import { api, type ProjectDetailResponse } from "../lib/api.js";
import { TradeForm } from "../components/TradeForm.js";
import { PdfActions } from "../components/PdfActions.js";
import { EntryCard } from "../components/EntryCard.js";
import { ShowerView } from "../components/ShowerView.js";
import { Icon } from "../components/Icon.js";
import { useToast } from "../lib/toast.js";

type EditingState = {
  roomId: string;
  trade: TradeKind;
  entry: Record<string, unknown>;
} | null;

export function SelectionsEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ProjectDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tradePicker, setTradePicker] = useState<Record<string, TradeKind | null>>({});
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [pendingRoomName, setPendingRoomName] = useState("");
  const [duplicatingRoomId, setDuplicatingRoomId] = useState<string | null>(null);
  const [pendingDuplicateName, setPendingDuplicateName] = useState("");
  const [editing, setEditing] = useState<EditingState>(null);
  const [viewMode, setViewMode] = useState<Record<string, "cards" | "shower">>({});
  const [renamingProject, setRenamingProject] = useState(false);
  const [pendingProjectName, setPendingProjectName] = useState("");
  const [pendingProjectAddress, setPendingProjectAddress] = useState("");
  const { notify } = useToast();
  const formScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if ((editing || Object.values(tradePicker).some(Boolean)) && formScrollRef.current) {
      formScrollRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [editing, tradePicker]);

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
  if (!data || !id) {
    return (
      <div aria-busy="true" aria-label="Loading project">
        <div className="skeleton-pulse sk-title" style={{ height: 36, width: "40%", marginBottom: 24 }} />
        {Array.from({ length: 2 }).map((_, ri) => (
          <div key={ri} className="skeleton-room">
            <div className="skeleton-pulse sk-room-title" />
            <div className="sk-entry-row">
              {Array.from({ length: 3 }).map((_, ei) => (
                <div key={ei} className="skeleton-pulse sk-entry" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const { project, rooms } = data;

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingRoomName.trim()) return;
    try {
      await api.addRoom(id, pendingRoomName.trim());
      setPendingRoomName("");
      setShowAddRoom(false);
      refresh();
      notify("success", `Added room "${pendingRoomName.trim()}"`);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveNewEntry = async (roomId: string, entry: Record<string, unknown>) => {
    try {
      const res = await api.saveEntry(roomId, entry);
      setTradePicker((s) => ({ ...s, [roomId]: null }));
      refresh();
      notify(
        "success",
        res.is_new_entry
          ? `Saved · tagged as new combination`
          : `Saved`,
      );
    } catch (err) {
      notify("error", err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const handleSaveEdit = async (entry: Record<string, unknown>) => {
    if (!editing) return;
    try {
      await api.updateEntry(editing.trade, editing.entry.id as string, entry);
      setEditing(null);
      refresh();
      notify("success", "Entry updated");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : String(err));
      throw err;
    }
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
    try {
      await api.saveEntry(targetRoomId, payload);
      refresh();
      const targetRoom = rooms.find((r) => r.id === targetRoomId);
      notify("success", `Duplicated to ${targetRoom?.room_name ?? "room"}`);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : String(err));
    }
  };

  const handleDuplicateRoom = async (
    e: React.FormEvent,
    sourceRoomId: string,
  ) => {
    e.preventDefault();
    const name = pendingDuplicateName.trim();
    if (!name) return;
    try {
      const res = await api.duplicateRoom(id, sourceRoomId, name);
      setDuplicatingRoomId(null);
      setPendingDuplicateName("");
      refresh();
      const total = Object.values(res.copied).reduce((a, b) => a + b, 0);
      notify(
        "success",
        total > 0
          ? `Duplicated to "${name}" with ${total} ${total === 1 ? "entry" : "entries"}`
          : `Duplicated to "${name}"`,
      );
    } catch (err) {
      notify("error", err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (trade: string, entryId: string) => {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await api.deleteEntry(trade, entryId);
      refresh();
      notify("success", "Entry deleted");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : String(err));
    }
  };

  const startRenameProject = () => {
    setPendingProjectName(project.name);
    setPendingProjectAddress(project.address ?? "");
    setRenamingProject(true);
  };

  const handleRenameProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingProjectName.trim()) return;
    try {
      await api.updateProject(id, {
        name: pendingProjectName.trim(),
        address: pendingProjectAddress.trim() || null,
      });
      setRenamingProject(false);
      refresh();
      notify("success", "Project updated");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteProject = async () => {
    if (!window.confirm("Delete this project and all its rooms and selections?")) return;
    try {
      await api.deleteProject(id);
      notify("success", "Project deleted");
      navigate("/projects");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <p>
        <Link to="/projects">← All projects</Link>
      </p>
      <div className="project-detail-header">
        {renamingProject ? (
          <form onSubmit={handleRenameProject} className="project-header-rename">
            <input
              className="ac-input"
              placeholder="Project name"
              value={pendingProjectName}
              onChange={(e) => setPendingProjectName(e.target.value)}
              autoFocus
            />
            <input
              className="ac-input"
              placeholder="Address (optional)"
              value={pendingProjectAddress}
              onChange={(e) => setPendingProjectAddress(e.target.value)}
            />
            <div className="project-header-rename-actions">
              <button type="submit" className="icon-button">
                <Icon name="check" />
                <span>Save</span>
              </button>
              <button
                type="button"
                className="secondary icon-button"
                onClick={() => setRenamingProject(false)}
              >
                <Icon name="x" />
                <span>Cancel</span>
              </button>
            </div>
          </form>
        ) : (
          <div>
            <h1>{project.name}</h1>
            {project.address && <p className="subtle">{project.address}</p>}
          </div>
        )}
        <div className="project-header-actions">
          <Link to={`/projects/${project.id}`} className="secondary-link">
            View summary
          </Link>
          {!renamingProject && (
            <>
              <button
                type="button"
                className="link icon-link"
                onClick={startRenameProject}
                aria-label="Rename project"
                title="Rename project"
              >
                <Icon name="edit" />
              </button>
              <button
                type="button"
                className="link danger icon-link"
                onClick={handleDeleteProject}
                aria-label="Delete project"
                title="Delete project"
              >
                <Icon name="delete" />
              </button>
            </>
          )}
        </div>
      </div>

      <PdfActions projectId={project.id} />

      {rooms.length > 1 && (
        <nav className="room-jump-nav" aria-label="Jump to room">
          <ul>
            {rooms.map((room) => (
              <li key={room.id}>
                <a href={`#room-${room.id}`} className="room-jump-pill">
                  {room.room_name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {rooms.length === 0 && !showAddRoom && (
        <div className="empty-state-card">
          <div className="empty-state-card-icon" aria-hidden="true">
            <Icon name="plus" size={28} />
          </div>
          <h2>No rooms yet</h2>
          <p>
            Start with the most important bathroom — usually the master. Tile,
            paint, and the rest of the finishes follow from there.
          </p>
          <div className="empty-state-card-actions">
            <button onClick={() => setShowAddRoom(true)} className="icon-button">
              <Icon name="plus" />
              <span>Add the first room</span>
            </button>
          </div>
        </div>
      )}

      {rooms.map((room) => {
        const mode = viewMode[room.id] ?? "cards";
        const allTileEntries = room.entries_by_trade.tile ?? [];
        const totalEntries = TRADE_KINDS.reduce(
          (n, t) => n + (room.entries_by_trade[t]?.length ?? 0),
          0,
        );
        return (
          <div key={room.id} id={`room-${room.id}`} className="room-block">
            <div className="room-header">
              <h2>{room.room_name}</h2>
              <div className="room-actions">
                <span className="room-count">
                  {totalEntries} {totalEntries === 1 ? "entry" : "entries"}
                </span>
                {totalEntries > 0 && (
                  <a
                    href={api.roomPdfUrl(project.id, room.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="icon-link"
                    aria-label={`Download PDF for ${room.room_name}`}
                    title={`Download PDF for ${room.room_name}`}
                  >
                    <Icon name="download" />
                    <span>PDF</span>
                  </a>
                )}
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
                    aria-label="Add trade"
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
                {duplicatingRoomId !== room.id && (
                  <button
                    type="button"
                    className="link icon-link"
                    onClick={() => {
                      setPendingDuplicateName(`${room.room_name} copy`);
                      setDuplicatingRoomId(room.id);
                    }}
                    aria-label={`Duplicate ${room.room_name}`}
                    title="Duplicate room (copies all entries to a new room)"
                  >
                    <Icon name="duplicate" />
                  </button>
                )}
              </div>
            </div>

            {duplicatingRoomId === room.id && (
              <form
                onSubmit={(e) => handleDuplicateRoom(e, room.id)}
                className="add-room-form"
              >
                <input
                  className="ac-input"
                  placeholder="New room name (e.g. Powder Bath)"
                  value={pendingDuplicateName}
                  onChange={(e) => setPendingDuplicateName(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="icon-button">
                  <Icon name="duplicate" />
                  <span>Duplicate</span>
                </button>
                <button
                  type="button"
                  className="secondary icon-button"
                  onClick={() => {
                    setDuplicatingRoomId(null);
                    setPendingDuplicateName("");
                  }}
                >
                  <Icon name="x" />
                  <span>Cancel</span>
                </button>
              </form>
            )}

            {tradePicker[room.id] && !editing && (
              <div className="trade-form-block" ref={formScrollRef}>
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
              <div className="trade-form-block" ref={formScrollRef}>
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

            {mode === "cards" && totalEntries === 0 && !tradePicker[room.id] && !editing && (
              <div className="room-empty-state">
                <h3>No selections yet for {room.room_name}</h3>
                <p>Start with tile — paint and trim follow.</p>
                <div className="room-empty-state-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() =>
                      setTradePicker((s) => ({ ...s, [room.id]: "tile" }))
                    }
                  >
                    <Icon name="plus" />
                    <span>Add tile</span>
                  </button>
                  <select
                    className="ac-input"
                    aria-label="Add trade"
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
                </div>
              </div>
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
          <button type="submit" className="icon-button">
            <Icon name="plus" />
            <span>Add room</span>
          </button>
          <button
            type="button"
            className="secondary icon-button"
            onClick={() => {
              setShowAddRoom(false);
              setPendingRoomName("");
            }}
          >
            <Icon name="x" />
            <span>Cancel</span>
          </button>
        </form>
      ) : (
        <button onClick={() => setShowAddRoom(true)} className="icon-button">
          <Icon name="plus" />
          <span>Add room</span>
        </button>
      )}
    </>
  );
}
