import { useState, useEffect } from "react";

const STATUS_CHECK_INTERVAL = 150000;

async function checkHealth(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("health check failed");
  const data = await response.json();
  return data.status === "ok" ? "online" : "offline";
}

export function getBatchStatus(statuses) {
  const values = Object.values(statuses);
  if (values.includes("checking")) return "checking";
  const onlineCount = values.filter((status) => status === "online").length;
  const total = values.length;
  if (onlineCount === total) return "online";
  if (onlineCount > total / 2) return "warning";
  return "offline";
}

export function useAPIStatuses() {
  const [statuses, setStatuses] = useState({
    backend: "checking",
    database: "checking",
  });
  const [loading, setLoading] = useState(false);

  async function updateStatuses() {
    setLoading(true);
    try {
      const checks = [
        ["backend", () => checkHealth("/health/system")],
        ["database", () => checkHealth("/health/db")],
      ];

      for (const [name, checkFunction] of checks) {
        try {
          const status = await checkFunction();
          setStatuses((prev) => ({ ...prev, [name]: status }));
        } catch {
          setStatuses((prev) => ({ ...prev, [name]: "offline" }));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updateStatuses();
    const intervalId = setInterval(updateStatuses, STATUS_CHECK_INTERVAL);
    return () => clearInterval(intervalId);
  }, []);

  return { statuses, loading, updateStatuses };
}
