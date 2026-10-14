import { useState } from "react";

export default function TabbedCard({ tabs }) {
  const [active, setActive] = useState(0);
  const current = tabs[active] || tabs[0];

  return (
    <section className="tabbed-card">
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
