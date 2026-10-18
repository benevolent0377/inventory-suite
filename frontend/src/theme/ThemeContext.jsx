import { createContext, useCallback, useEffect, useState } from "react";
import { request } from "../api/client";

export const ThemeContext = createContext(null);

function readActiveName() {
  const stored = localStorage.getItem("inventory-user");
  if (!stored) return "";
  try {
    const parsed = JSON.parse(stored);
    return parsed?.name || parsed?.username || (typeof parsed === "string" ? parsed : "");
  } catch {
    return stored;
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem("inventory-theme") || "dark");
  const [textSize, setTextSize] = useState(() => Number(localStorage.getItem("inventory-text-size")) || 100);

  const applyUserTheme = useCallback(async () => {
    const activeName = readActiveName();
    if (!activeName) return;
    try {
      const users = await request("/api/users");
      const currentUser = users.find((user) => user.name === activeName || user.username === activeName);
      if (currentUser?.theme) {
        setThemeState(currentUser.theme);
        localStorage.setItem("inventory-theme", currentUser.theme);
      }
    } catch {
      // Keep the locally stored theme when the user list cannot be loaded.
    }
  }, []);

  useEffect(() => {
    applyUserTheme();
    window.addEventListener("inventory-user-changed", applyUserTheme);
    return () => window.removeEventListener("inventory-user-changed", applyUserTheme);
  }, [applyUserTheme]);

  const setTheme = useCallback((nextTheme) => {
    setThemeState(nextTheme);
    localStorage.setItem("inventory-theme", nextTheme);

    const activeName = readActiveName();
    if (!activeName) return;

    // Apply locally first for immediate feedback; profile persistence is best effort.
    request("/api/users")
      .then((users) => {
        const currentUser = users.find((user) => user.name === activeName || user.username === activeName);
        if (!currentUser) return null;
        return request(`/api/users/${currentUser.id}`, {
          method: "PUT",
          body: JSON.stringify({ name: currentUser.name, username: currentUser.username, email: currentUser.email, theme: nextTheme }),
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem("inventory-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("inventory-text-size", String(textSize));
    document.documentElement.style.fontSize = `${(textSize / 100) * 18}px`;
  }, [textSize]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, textSize, setTextSize }}>
      {children}
    </ThemeContext.Provider>
  );
}
