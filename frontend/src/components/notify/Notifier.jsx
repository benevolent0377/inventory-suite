import { useEffect, useState } from "react";

export default function Notifier() {
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    function handleNotice(event) {
      const message = event.detail?.message || "Saved successfully.";
      setNotice(message);
      window.clearTimeout(window.__inventoryNoticeTimeout__);
      window.__inventoryNoticeTimeout__ = window.setTimeout(() => setNotice(null), 3500);
    }
    window.addEventListener("inventory-notice", handleNotice);
    return () => window.removeEventListener("inventory-notice", handleNotice);
  }, []);

  if (!notice) return null;

  return (
    <div className="app-notice" role="status" aria-live="polite">
      {notice}
    </div>
  );
}
