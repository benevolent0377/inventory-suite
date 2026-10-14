import { useState } from "react";
import { request } from "../../api/client";
import { useNavigate } from "react-router-dom";
import { notify } from "../../utils/notify";

export default function UserGate() {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [passkey, setPasskey] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  async function finishSession(data) {
    localStorage.setItem("inventory-token", data.access_token);
    localStorage.setItem("inventory-user", JSON.stringify(data.user));
    window.dispatchEvent(new CustomEvent("inventory-user-logged-in"));
    notify(`Welcome, ${data.user.name || data.user.username}`);
    navigate("/", { replace: true });
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, passkey }),
      });
      await finishSession(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, username, email, passkey }),
      });
      await finishSession(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (localStorage.getItem("inventory-token")) return null;

  return (
    <div className="user-gate-overlay">
      <div className="user-gate-card">
        <h2>{mode === "login" ? "Log In" : "Create Account"}</h2>
        <p>{mode === "login" ? "Enter your username and passkey." : "Register a new user account."}</p>
        {error && <p className="error">{error}</p>}
        {mode === "login" ? (
          <form className="edit-form login-form" onSubmit={handleLogin}>
            <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
            <label>Passkey<input type="password" value={passkey} onChange={(e) => setPasskey(e.target.value)} required /></label>
            <button type="submit" disabled={loading}>{loading ? "Logging in..." : "Log In"}</button>
          </form>
        ) : (
          <form className="edit-form login-form" onSubmit={handleRegister}>
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
            <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Passkey<input type="password" value={passkey} onChange={(e) => setPasskey(e.target.value)} required minLength={8} /></label>
            <button type="submit" disabled={loading}>{loading ? "Creating..." : "Register"}</button>
          </form>
        )}
        <div className="user-gate-divider"><span>or</span></div>
        <button type="button" className="secondary" onClick={() => { setError(""); setMode(mode === "login" ? "register" : "login"); }}>
          {mode === "login" ? "Need an account? Register" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
