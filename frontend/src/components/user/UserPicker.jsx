import { useEffect, useState } from "react";
import { request } from "../../api/client";

export default function UserPicker() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("inventory-user");
    if (stored) {
      try { setProfile(JSON.parse(stored)); } catch { setProfile({ username: stored, name: stored }); }
    }
    const sync = async () => {
      if (!localStorage.getItem("inventory-token")) { setProfile(null); return; }
      try {
        const user = await request("/api/auth/me");
        setProfile(user);
        localStorage.setItem("inventory-user", JSON.stringify(user));
      } catch {
        setProfile(null);
      }
    };
    sync();
    const handler = () => sync();
    window.addEventListener("inventory-user-logged-in", handler);
    return () => window.removeEventListener("inventory-user-logged-in", handler);
  }, []);

  if (!profile) return <div className="user-picker">Not logged in</div>;
  return (
    <div className="user-picker">
      <span>{profile.name || profile.username}{profile.is_admin ? " (admin)" : ""}</span>
    </div>
  );
}
