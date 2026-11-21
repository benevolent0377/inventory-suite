import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { request } from "../../api/client";

export default function MailButton({ onClick }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await request("/api/messages/unread-count");
        if (!cancelled) setUnreadCount(data.count || 0);
      } catch {
        // Ignore network/auth errors; badge will retry on next poll.
      }
    }

    load();
    const interval = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <button type="button" className="bottom-mail" onClick={onClick} title="Mail">
      <Mail size={16} />
      {unreadCount > 0 && (
        <span className="mail-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
      )}
    </button>
  );
}
