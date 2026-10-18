import { NavLink } from "react-router-dom";
import { appRoutes } from "../../../routes/appRoutes";
import { Boxes } from "lucide-react";
import "./Sidebar.css";
import GlobalSearchBar from "../../search/GlobalSearchBar";

export function Sidebar() {
  const isAdmin = (() => {
    try {
      return JSON.parse(localStorage.getItem("inventory-user") || "null")?.is_admin === true;
    } catch {
      return false;
    }
  })();

  const visibleRoutes = appRoutes.filter((route) => !route.adminOnly || isAdmin);

  return (
    <aside className="sidebar">
      <div className="logo-container">
        <div className="logo-mark"><Boxes size={18} /></div>
        <div className="text-wrapper">
          <p className="title">Inventory Suite</p>
          <p className="version-tag">BETA 3.0.3</p>
        </div>
      </div>
      <div className="sidebar-divider" />

      <div className="sidebar-search">
        <GlobalSearchBar />
      </div>

      <nav className="sidebar-items">
        {visibleRoutes.map((route) => {
          const Icon = route.icon;
          return (
            <NavLink
              to={route.path}
              key={route.path}
              className={({ isActive }) =>
                isActive ? "sidebar-item active" : "sidebar-item"
              }
            >
              <Icon size={22} />
              <span>{route.title}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
      </div>
    </aside>
  );
}
