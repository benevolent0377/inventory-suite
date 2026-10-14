import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
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
          <button type="button" className="bottom-logout" onClick={() => { if (!window.confirm("Log out?")) return; localStorage.removeItem("inventory-user"); window.location.reload(); }} title="Log out">
            <DoorOpen size={16} />
          </button>
          <Link to="/settings" className="bottom-settings">
            <Cog size={16} />
          </Link>
        </div>
      </div>
      <UserGate />
      <Notifier />
    </div>
  );
}

export default App;
