const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function request(path, options = {}) {
  const token = localStorage.getItem("inventory-token") || "";
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });
  if (response.status === 401) {
    localStorage.removeItem("inventory-token");
    localStorage.removeItem("inventory-user");
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
  return response.json();
}
