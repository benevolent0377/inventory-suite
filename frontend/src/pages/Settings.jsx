import { useTheme } from "../theme/useTheme";
import { useEffect, useState } from "react";
import { request } from "../api/client";

const THEMES = [
  { value: "cephalon-teal", label: "Cephalon Teal" },
  { value: "corpus", label: "Corpus" },
  { value: "cy", label: "Cy" },
  { value: "dark", label: "Dark" },
  { value: "grineer", label: "Grineer" },
  { value: "infested", label: "Infested" },
  { value: "jade", label: "Jade" },
  { value: "light", label: "Light" },
  { value: "light-soft-orokin", label: "Light Soft Orokin" },
  { value: "light-void-blue", label: "Light Void Blue" },
  { value: "lotus", label: "Lotus" },
  { value: "murmur", label: "Murmur" },
  { value: "orokin", label: "Orokin" },
  { value: "orokin-gold", label: "Orokin Gold" },
  { value: "solar", label: "Solar" },
  { value: "tenno-steel", label: "Tenno Steel" },
  { value: "venus", label: "Venus" },
  { value: "void", label: "Void" },
];

export default function SettingsPage() {
  const { theme, setTheme, textSize, setTextSize } = useTheme();
  const [users, setUsers] = useState([]);
  const [userName, setUserName] = useState("");
  const [userUsername, setUserUsername] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [error, setError] = useState("");

  const loadUsers = async () => {
    setUsers(await request("/api/users"));
  };

  useEffect(() => {
    loadUsers().catch((err) => setError(err.message));
  }, []);

  async function addUser(event) {
    event.preventDefault();
    setError("");
    try {
      await request("/api/users", { method: "POST", body: JSON.stringify({ name: userName, username: userUsername, email: userEmail }) });
      setUserName("");
      setUserUsername("");
      setUserEmail("");
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeUser(id) {
    if (!window.confirm("Delete this user?")) return;
    try {
      await request(`/api/users/${id}`, { method: "DELETE" });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h2>Settings</h2>

      <section className="settings-section">
        <h3>Theme</h3>
        <select value={theme} onChange={(event) => setTheme(event.target.value)}>
          {THEMES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </section>

      <section className="settings-section">
        <h3>Text Size</h3>
        <label>
          Size: {textSize}%
          <input
            type="range"
            min="80"
            max="130"
            step="5"
            value={textSize}
            onChange={(event) => setTextSize(Number(event.target.value))}
          />
        </label>
      </section>
    <section className="settings-section">
        <h3>Registered Users</h3>
        {error && <p className="error">{error}</p>}
        <form className="form-row" onSubmit={addUser}>
          <label>Name<input value={userName} onChange={(e) => setUserName(e.target.value)} required /></label>
          <label>Username<input value={userUsername} onChange={(e) => setUserUsername(e.target.value)} required /></label>
          <label>Email<input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} /></label>
          <button type="submit">Add User</button>
        </form>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Username</th><th>Email</th><th></th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.username}</td>
                <td>{user.email || "-"}</td>
                <td><button type="button" onClick={() => removeUser(user.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
