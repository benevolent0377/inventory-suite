import { useTheme } from "../theme/useTheme";
import { useEffect, useState } from "react";
import { request } from "../api/client";
import { notify } from "../utils/notify";
import { confirm } from "../utils/confirm";

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
    </div>
  );
}
