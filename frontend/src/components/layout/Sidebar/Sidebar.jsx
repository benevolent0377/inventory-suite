import { NavLink } from "react-router-dom";
import { appRoutes } from "../../../routes/appRoutes";
import { Boxes } from "lucide-react";
import "./Sidebar.css";

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="logo-container">
        <div className="logo-mark"><Boxes size={18} /></div>
        <div className="text-wrapper">
          <p className="title">Inventory Suite</p>
          <p className="version-tag">BETA 1.2.0</p>
        </div>
      </div>

      <nav className="sidebar-items">
        {appRoutes.map((route) => {
          const Icon = route.icon;
          return (
            <NavLink
              to={route.path}
              key={route.path}
              className={({ isActive }) =>
                isActive ? "sidebar-item active" : "sidebar-item"
              }
            >
              <Icon size={18} />
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
