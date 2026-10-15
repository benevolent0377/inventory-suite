import { useTheme } from "../theme/useTheme";
import { useEffect, useState } from "react";
import { request } from "../api/client";
import { notify } from "../utils/notify";

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
  const [error, setError] = useState("");
  const [useDemoDb, setUseDemoDb] = useState(() => localStorage.getItem("inventory-demo-db") === "true");
  const [layoutDensity, setLayoutDensity] = useState(() => localStorage.getItem("inventory-layout-density") || "comfortable");
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem("inventory-reduce-motion") === "true");
  const [currentPasskey, setCurrentPasskey] = useState("");
  const [newPasskey, setNewPasskey] = useState("");

  useEffect(() => {
    document.documentElement.dataset.layoutDensity = layoutDensity;
    localStorage.setItem("inventory-layout-density", layoutDensity);
  }, [layoutDensity]);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = reduceMotion ? "true" : "false";
    localStorage.setItem("inventory-reduce-motion", String(reduceMotion));
  }, [reduceMotion]);

  async function handleChangePasskey(event) {
    event.preventDefault();
    setError("");
    try {
      await request("/api/auth/change-passkey", {
        method: "POST",
        body: JSON.stringify({ current_passkey: currentPasskey, new_passkey: newPasskey }),
      });
      notify("Passkey updated");
      setCurrentPasskey("");
      setNewPasskey("");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page settings-page">
      <h2>Settings</h2>

      <section className="settings-section">
        <h3>Appearance</h3>
        <label>
          Theme
          <select value={theme} onChange={(event) => setTheme(event.target.value)}>
            {THEMES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Text Size: {textSize}%
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
        <h3>Accessibility</h3>
        <label>
          Layout Density
          <select value={layoutDensity} onChange={(event) => setLayoutDensity(event.target.value)}>
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="spacious">Spacious</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={(event) => setReduceMotion(event.target.checked)}
          />
          {" "}Disable animations and hover motion.
        </label>
      </section>

      <section className="settings-section">
        <h3>Account</h3>
        <form onSubmit={handleChangePasskey}>
          <label>
            Current Passkey
            <input type="password" value={currentPasskey} onChange={(event) => setCurrentPasskey(event.target.value)} required />
          </label>
          <label>
            New Passkey
            <input type="password" value={newPasskey} onChange={(event) => setNewPasskey(event.target.value)} required minLength={8} />
          </label>
          <button type="submit">Update Passkey</button>
        </form>
      </section>

      <section className="settings-section">
        <h3>Data & Testing</h3>
        <label>
          <input
            type="checkbox"
            checked={useDemoDb}
            onChange={(event) => {
              const next = event.target.checked;
              setUseDemoDb(next);
              if (next) localStorage.setItem("inventory-demo-db", "true");
              else localStorage.removeItem("inventory-demo-db");
              notify(next ? "Demo database enabled. Reload the page to apply." : "Normal database enabled. Reload the page to apply.");
            }}
          />
          {" "}Use demo database instead of the normal database for testing.
        </label>
      </section>

      {error && <p className="error">{error}</p>}
    </div>
  );
}