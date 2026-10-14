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
import { Cog, DoorOpen } from "lucide-react";
import { StatusDropdown } from "./components/status/StatusDropdown";
import ConfirmDialog from "./components/confirm/ConfirmDialog";
import { confirm } from "./utils/confirm";

import "./themes/index.css";
import "./themes/allThemes.css";
import "./themes/App.css";

function App() {
  useEffect(() => {
    function handleBeforeUnload() {
      const navigation = performance.getEntriesByType("navigation")[0];
      if (navigation && navigation.type === "reload") return;
      localStorage.removeItem("inventory-user");
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
        <div className="bottom-bar-actions">
          <StatusDropdown />
          <button type="button" className="bottom-logout" onClick={async () => { if (!(await confirm("Log out?"))) return; localStorage.removeItem("inventory-user"); window.location.assign("/"); }} title="Log out">
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
      <Notifier />
    </div>
  );
}

export default App;
