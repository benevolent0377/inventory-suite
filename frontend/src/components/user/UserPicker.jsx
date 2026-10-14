import { useEffect, useState } from "react";
import { request } from "../../api/client";

export default function UserPicker() {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(localStorage.getItem("inventory-user") || "");

  useEffect(() => {
    const sync = () => setSelected(localStorage.getItem("inventory-user") || "");
    sync();
    const handler = (event) => setSelected(event.detail || localStorage.getItem("inventory-user") || "");
    window.addEventListener("inventory-user-changed", handler);
    request("/api/users").then(setUsers).catch(() => setUsers([]));
    return () => window.removeEventListener("inventory-user-changed", handler);
  }, []);

  useEffect(() => {
    localStorage.setItem("inventory-user", selected);
  }, [selected]);

  return (
    <div className="user-picker">
      <select value={selected} onChange={(event) => setSelected(event.target.value)} aria-label="Select user">
        <option value="">User</option>
        {users.map((user) => (
          <option key={user.id} value={user.name}>
            {user.name}
          </option>
        ))}
      </select>
    </div>
  );
}
