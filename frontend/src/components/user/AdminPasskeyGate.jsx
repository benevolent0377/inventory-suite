import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { request } from "../../api/client";

export default function AdminPasskeyGate({ storageKey, children }) {
  const confirmationKey = `admin-passkey-confirmed-${storageKey}`;
  const [confirmed, setConfirmed] = useState(() => sessionStorage.getItem(confirmationKey) === "1");
  const [passkey, setPasskey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (confirmed) setPasskey("");
  }, [confirmed]);

  async function verify(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await request("/api/auth/verify-passkey", {
        method: "POST",
        body: JSON.stringify({ passkey }),
      });
      sessionStorage.setItem(confirmationKey, "1");
      setConfirmed(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (confirmed) return children;

  return (
    <div className="admin-passkey-overlay">
      <div className="user-gate-card" style={{ position: "relative" }}>
        <button type="button" className="admin-passkey-back" onClick={() => navigate("/")} aria-label="Back to dashboard"><ArrowLeft size={16} /></button>
        <h2>Admin Verification</h2>
        <p>Enter your admin passkey to access this page.</p>
        {error && <p className="error">{error}</p>}
        <form className="edit-form login-form" onSubmit={verify}>
          <label>
            Admin Passkey
            <input
              type="password"
              value={passkey}
              onChange={(event) => setPasskey(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Verifying..." : "Confirm"}
          </button>
        </form>
      </div>
    </div>
  );
}
