const API_BASE = import.meta.env.VITE_API_BASE || "";
const CACHE_TTL_MS = 30000;

function cacheKey(path, demoDb) {
  return `inventory-api-cache:${demoDb ? "demo" : "normal"}:${path}`;
}

function clearApiCache() {
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith("inventory-api-cache:"))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Ignore storage errors.
  }
}

export async function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const demoDb = localStorage.getItem("inventory-demo-db") === "true";
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = localStorage.getItem("inventory-token") || "";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (demoDb) headers["X-Demo-DB"] = "true";

  const key = cacheKey(path, demoDb);

  // Reads may be cached briefly; writes invalidate both normal and demo views.
  if (method === "GET") {
    try {
      const cached = JSON.parse(sessionStorage.getItem(key) || "null");
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
      }
    } catch {
      // Ignore malformed cache entries.
    }
  } else {
    clearApiCache();
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });
  if (response.status === 401) {
    localStorage.removeItem("inventory-token");
    localStorage.removeItem("inventory-user");
    clearApiCache();
    throw new Error("Authentication required");
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const data = await response.json();
      detail = data.detail || detail;
    } catch {
      // keep status text
    }
    throw new Error(detail);
  }
  if (response.status === 204) return null;
  const data = await response.json();

  if (method === "GET") {
    try {
      sessionStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
    } catch {
      // Ignore storage quota errors.
    }
  } else {
    clearApiCache();
  }

  return data;
}
