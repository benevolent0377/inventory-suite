import { useEffect, useState } from "react";
import { request } from "../api/client";

const emptyFilters = { username: "", action: "", entity_type: "", status: "" };

export default function ActivityPage() {
  const [data, setData] = useState({ total: 0, items: [] });
  const [filters, setFilters] = useState(emptyFilters);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async (activeFilters = filters) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    Object.entries(activeFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    params.set("limit", "100");
    try {
      const result = await request(`/api/activity?${params.toString()}`);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(emptyFilters); }, []);

  if (error === "Admin access required") {
    return <div className="page"><h2>Activity Log</h2><p className="error">Admin access required.</p></div>;
  }

  return (
    <div className="page">
      <h2>Activity Log</h2>
      {error && <p className="error">{error}</p>}
      <form className="form-row" onSubmit={(e) => { e.preventDefault(); load(filters); }}>
        <input placeholder="Username" value={filters.username} onChange={(e) => setFilters({ ...filters, username: e.target.value })} />
        <input placeholder="Action" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} />
        <input placeholder="Entity" value={filters.entity_type} onChange={(e) => setFilters({ ...filters, entity_type: e.target.value })} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
        </select>
        <button type="submit" disabled={loading}>{loading ? "Loading..." : "Filter"}</button>
      </form>
      <p>Total: {data.total}</p>
      <table className="data-table">
        <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Status</th><th>Client</th></tr></thead>
        <tbody>
          {data.items.map((row) => (
            <tr key={row.id}>
              <td>{row.created_at ? row.created_at.slice(0, 19).replace("T", " ") : "-"}</td>
              <td>{row.username}</td>
              <td>{row.action}</td>
              <td>{row.entity_type}{row.entity_id != null ? ` #${row.entity_id}` : ""}</td>
              <td>{row.status}</td>
              <td>{row.client_host}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
