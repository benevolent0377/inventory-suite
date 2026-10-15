import { useState } from "react";

export default function TabbedCard({ tabs, style, className, defaultTab = 0 }) {
  const [active, setActive] = useState(defaultTab);
  const current = tabs[active] || tabs[0];

  return (
    <section className={`tabbed-card${className ? ` ${className}` : ""}`} style={style}>
      <div className="tab-list">
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            type="button"
            className={index === active ? "tab-button active" : "tab-button"}
            onClick={() => setActive(index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tab-content">
        {current ? current.content : null}
      </div>
    </section>
  );
}
