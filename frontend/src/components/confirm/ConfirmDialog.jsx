import { useEffect, useState } from "react";
import { resolveConfirm } from "../../utils/confirm";

export default function ConfirmDialog() {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    function handleConfirm(event) {
      setMessage(event.detail?.message || "Are you sure?");
    }
    window.addEventListener("inventory-confirm", handleConfirm);
    return () => window.removeEventListener("inventory-confirm", handleConfirm);
  }, []);

  if (!message) return null;

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-card">
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button type="button" onClick={() => { resolveConfirm(false); setMessage(null); }}>Cancel</button>
          <button type="button" className="danger-button" onClick={() => { resolveConfirm(true); setMessage(null); }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
