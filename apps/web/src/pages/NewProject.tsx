import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { Icon } from "../components/Icon.js";

export function NewProject() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const proj = await api.createProject(name.trim(), address.trim() || undefined);
      navigate(`/selections/${proj.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="new-project-page">
      <h1>Start a new project</h1>
      <p className="subtle">
        Name it, drop the address, and you'll land on the room editor.
        You can add rooms and selections from there.
      </p>
      <form onSubmit={handleSubmit} className="trade-form">
        <div className="trade-form-grid">
          <div className="ac-wrapper">
            <label className="ac-label">
              Name<span className="ac-required">*</span>
            </label>
            <input
              className="ac-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Henderson Residence"
              autoFocus
            />
          </div>
          <div className="ac-wrapper">
            <label className="ac-label">Address</label>
            <input
              className="ac-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="812 Oak Ridge Dr, Boise, ID"
            />
          </div>
        </div>
        {error && <div className="errors">{error}</div>}
        <div className="button-row">
          <button type="submit" className="icon-button" disabled={saving}>
            <Icon name="plus" />
            <span>{saving ? "Creating…" : "Create project"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
