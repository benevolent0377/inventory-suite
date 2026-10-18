import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { Sidebar } from "./components/layout/Sidebar/Sidebar";
import { appRoutes } from "./routes/appRoutes";
import SettingsPage from "./pages/Settings";
import UserPicker from "./components/user/UserPicker";
import UserGate from "./components/user/UserGate";
import Notifier from "./components/notify/Notifier";
import SearchPage from "./pages/Search";
import { useTheme } from "./theme/useTheme";
import { Link } from "react-router-dom";
import { Cog, DoorOpen, Power } from "lucide-react";
import { StatusDropdown } from "./components/status/StatusDropdown";
import ConfirmDialog from "./components/confirm/ConfirmDialog";
import PromptPasskeyDialog from "./components/confirm/PromptPasskeyDialog";
import { confirm } from "./utils/confirm";
import { promptPasskey } from "./utils/promptPasskey";
import { request } from "./api/client";
import { notify } from "./utils/notify";

import "./themes/index.css";
import "./themes/allThemes.css";
import "./themes/App.css";

function App() {
  useEffect(() => {
    function handleBeforeUnload() {
      const navigation = performance.getEntriesByType("navigation")[0];
      if (navigation && navigation.type === "reload") return;
      localStorage.removeItem("inventory-user");
      localStorage.removeItem("inventory-token");
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return (
    <BrowserRouter>
      <AppFrame />
    </BrowserRouter>
  );
}

function AppFrame() {
  const { theme } = useTheme();
  const [loginReminder, setLoginReminder] = useState(() => {
    if (sessionStorage.getItem("inventory-login-reminder") === "1") {
      sessionStorage.removeItem("inventory-login-reminder");
      return "settings";
    }
    return null;
  });

  useEffect(() => {
    if (loginReminder === "settings") {
      const timer = window.setTimeout(() => setLoginReminder("logout"), 10000);
      return () => window.clearTimeout(timer);
    }
    if (loginReminder === "logout") {
      const timer = window.setTimeout(() => setLoginReminder(null), 5000);
      return () => window.clearTimeout(timer);
    }
  }, [loginReminder]);

  useEffect(() => {
    function handleLogin() {
      setLoginReminder("settings");
    }
    window.addEventListener("inventory-user-logged-in", handleLogin);
    return () => window.removeEventListener("inventory-user-logged-in", handleLogin);
  }, []);

  return (
    <div className="app-frame" data-theme={theme}>
      <div className="app-body">
        <div className="menu-bar-container">
          <Sidebar />
        </div>
        <main className="content">
          <div className="content-wrapper">
            <Routes>
              {appRoutes.map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/search" element={<SearchPage />} />
            </Routes>
          </div>
        </main>
      </div>
      <div className="bottom-bar">
          <button
          type="button"
          className="bottom-shutdown"
          onClick={async () => {
            if (!(await confirm("Shut down the inventory suite? All active sessions will be suspended."))) return;
            const adminPasskey = await promptPasskey("Enter the administrator passkey to confirm shutdown");
            if (adminPasskey == null) return;
            try {
              await request("/api/maintenance/shutdown", {
                method: "POST",
                body: JSON.stringify({ admin_passkey: adminPasskey }),
              });
              localStorage.removeItem("inventory-user");
              localStorage.removeItem("inventory-token");
              notify("Inventory Suite is shutting down");
              window.location.assign("/");
            } catch (err) {
              notify(err.message);
            }
          }}
          title="Shut down"
        >
          <Power size={16} />
        </button>
        <div className="bottom-bar-actions">
          <StatusDropdown />
          <button type="button" className="bottom-logout" onClick={async () => { if (!(await confirm("Log out?"))) return; localStorage.removeItem("inventory-user"); localStorage.removeItem("inventory-token"); window.location.assign("/"); }} title="Log out">
            <DoorOpen size={16} />
          </button>
          <Link to="/settings" className="bottom-settings" title="Settings">
            <Cog size={16} />
          </Link>
        </div>
      </div>
      <UserGate />
      {loginReminder && (
        <div className={`login-reminder login-reminder-${loginReminder}`} role="status" aria-live="polite">
          {loginReminder === "settings"
            ? "Adjust your preferences from the settings cog in the bottom bar."
            : "Remember to log out using the logout button when you are finished."}
          <span className={`login-reminder-arrow login-reminder-arrow-${loginReminder}`} />
        </div>
      )}
      <ConfirmDialog />
      <PromptPasskeyDialog />
      <Notifier />
    </div>
  );
}

export default App;
