import { useEffect, useState } from "react";
import { request } from "../../api/client";
import { useNavigate } from "react-router-dom";
import { notify } from "../../utils/notify";
import { playPopup, playDing } from "../../utils/sound";

export default function UserGate() {
  const [users, setUsers] = useState([]);
  const [active, setActive] = useState(() => localStorage.getItem("inventory-user") || "");
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const load = async () => {
    try {
      setUsers(await request("/api/users"));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    playPopup();
    load();
  }, []);

  async function selectUser(event) {
    event.preventDefault();
    const user = users.find((item) => item.name === selected);
    if (!user) return;
    localStorage.setItem("inventory-user", user.name);
    sessionStorage.setItem("inventory-login-reminder", "1");
    window.dispatchEvent(new CustomEvent("inventory-user-logged-in"));
    setActive(user.name);
    navigate("/", { replace: true });
  }

  async function createUser(event) {
    event.preventDefault();
    setError("");
    try {
      const user = await request("/api/users", {
        method: "POST",
        body: JSON.stringify({ name, username, email: "" }),
      });
      await load();
      localStorage.setItem("inventory-user", user.name);
      notify(`Welcome, ${user.name}`);
      sessionStorage.setItem("inventory-login-reminder", "1");
      sessionStorage.setItem("inventory-reloading", "1");
      playDing();
      window.location.assign("/");
    } catch (err) {
      setError(err.message);
    }
  }

  if (active) return null;

  return (
    <div className="user-gate-overlay">
      <div className="user-gate-card">
        <h2>Select User</h2>
        <p>Choose a registered user before using Inventory Suite.</p>
        {error && <p className="error">{error}</p>}
        {users.length > 0 ? (
          <form className="edit-form login-form" onSubmit={selectUser}>
            <label>
              User
              <select value={selected} onChange={(event) => setSelected(event.target.value)} required>
                <option value="">Select user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.name}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Continue</button>
          </form>
        ) : (
          <p>No users yet. Create one below.</p>
        )}
        <div className="user-gate-divider"><span>or</span></div>
        <form className="edit-form login-form" onSubmit={createUser}>
          <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
          <button type="submit">Create and Continue</button>
        </form>
      </div>
    </div>
  );
}
