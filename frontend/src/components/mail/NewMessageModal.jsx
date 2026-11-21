import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { request } from "../../api/client";

export default function NewMessageModal({ isOpen, onClose, onSent }) {
  const [users, setUsers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await request("/api/users");
        const current = JSON.parse(localStorage.getItem("inventory-user") || "{}");
        if (!cancelled) setUsers(data.filter((u) => u.id !== current.id));
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  function toggleUser(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!selectedIds.length) {
      setError("Select at least one recipient.");
      return;
    }
    if (!body.trim()) {
      setError("Message body is required.");
      return;
    }
    setLoading(true);
    try {
      await request("/api/messages", {
        method: "POST",
        body: JSON.stringify({ body: body.trim(), recipient_ids: selectedIds }),
      });
      onSent();
      setSelectedIds([]);
      setBody("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-card mail-new-modal">
        <div className="mail-new-modal-header">
          <h3>New Message</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mail-recipient-list">
            <p className="mail-label">To</p>
            {users.length === 0 && <p className="muted">Loading users...</p>}
            {users.map((user) => (
              <label key={user.id} className="mail-recipient-option">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(user.id)}
                  onChange={() => toggleUser(user.id)}
                />
                <span>{user.name || user.username}</span>
              </label>
            ))}
          </div>
          <label className="mail-label">
            Message
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Type a message..."
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" disabled={loading}>{loading ? "Sending..." : "Send"}</button>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
