import { createContext, useCallback, useEffect, useState } from "react";
import { request } from "../api/client";

export const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem("inventory-theme") || "light");
  const [textSize, setTextSize] = useState(() => Number(localStorage.getItem("inventory-text-size")) || 100);

  useEffect(() => {
    function updateSize() {
      const ratio = window.innerWidth / Math.max(window.innerHeight, 1);
      const next = Math.min(130, Math.max(80, Math.round((ratio / (16 / 9)) * 100 * 1.50)));
      setTextSize(next);
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const applyUserTheme = useCallback(async () => {
    const activeName = localStorage.getItem("inventory-user");
    if (!activeName) return;
    try {
      const users = await request("/api/users");
      const currentUser = users.find((user) => user.name === activeName);
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

    const activeName = localStorage.getItem("inventory-user");
    if (!activeName) return;

    request("/api/users")
      .then((users) => {
        const currentUser = users.find((user) => user.name === activeName);
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
