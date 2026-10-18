import { useCallback, useEffect, useState } from "react";
import { request } from "../api/client";
import TabbedCard from "../components/ui/TabbedCard";
import { confirm } from "../utils/confirm";
import { notify } from "../utils/notify";

function stringifyValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function TableEditorTab({ tableName, columns }) {
  const pk = columns.find((column) => column.primary_key)?.name || "id";
  const editableColumns = columns.filter((column) => !column.primary_key);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await request(`/api/tables/${tableName}?limit=100&offset=0`);
      setRows(result.rows || []);
      setTotal(result.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tableName]);

  useEffect(() => { load(); }, [tableName, load]);

  function startEdit(row) {
    setEditingId(row[pk]);
    const next = {};
    editableColumns.forEach((column) => {
      next[column.name] = stringifyValue(row[column.name]);
    });
    setForm(next);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({});
  }

  async function saveEdit() {
    setError("");
    try {
      const payload = {};
      editableColumns.forEach((column) => {
        if (form[column.name] !== "") payload[column.name] = form[column.name];
        else payload[column.name] = null;
      });
      await request(`/api/tables/${tableName}/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteRow(rowId) {
    if (!window.confirm(`Delete row ${rowId} from ${tableName}?`)) return;
    setError("");
    try {
      await request(`/api/tables/${tableName}/${rowId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}
      <p>Total rows: {total}</p>
      {loading && <p>Loading...</p>}
      <div style={{ overflow: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => <th key={column.name}>{column.name}</th>)}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[pk]}>
                {columns.map((column) => (
                  <td key={column.name}>{stringifyValue(row[column.name])}</td>
                ))}
                <td>
                  <button type="button" onClick={() => startEdit(row)}>Edit</button>{" "}
                  <button type="button" onClick={() => deleteRow(row[pk])}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingId !== null && (
        <div className="edit-form">
          <h3>Edit row {editingId}</h3>
          {editableColumns.map((column) => (
            <label key={column.name}>
              {column.name}
              <input
                value={form[column.name] ?? ""}
                onChange={(event) => setForm({ ...form, [column.name]: event.target.value })}
              />
            </label>
          ))}
          <div className="form-row">
            <button type="button" onClick={saveEdit}>Save</button>
            <button type="button" onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TableEditorPage() {
  const [tables, setTables] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState("all");
  const [resetStatus, setResetStatus] = useState("");
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await request("/api/tables");
        if (active) setTables(result);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (error === "Admin access required") {
    return <div className="page"><h2>Table Editor</h2><p className="error">Admin access required.</p></div>;
  }
  if (loading) {
    return <div className="page"><h2>Table Editor</h2><p>Loading...</p></div>;
  }
  if (error) {
    return <div className="page"><h2>Table Editor</h2><p className="error">{error}</p></div>;
  }

  async function resetTables() {
    if (!(await confirm("This will clear the selected table data. This cannot be undone. Continue?"))) return;
    setResetStatus("");
    setClearing(true);
    try {
      const result = await request("/api/maintenance/tables/clear", {
        method: "POST",
        body: JSON.stringify({ tables: [selectedTable] }),
      });
      setResetStatus(`Cleared: ${result.tables.join(", ")}. Backup saved as ${result.backup}.`);
      notify("Selected tables cleared");
    } catch (err) {
      setResetStatus(err.message);
    } finally {
      setClearing(false);
    }
  }

  const tabs = tables.map((table) => ({
    label: table.name,
    content: <TableEditorTab tableName={table.name} columns={table.columns} />,
  }));

  return (
    <div className="page">
      <h2>Table Editor</h2>
      <TabbedCard tabs={tabs} />

      <section className="settings-section" style={{ marginTop: "16px" }}>
        <h3>Clear Tables</h3>
        <div className="form-row">
          <label>
            Table to clear
            <select value={selectedTable} onChange={(event) => setSelectedTable(event.target.value)}>
              <option value="all">All tables</option>
              {tables.map((table) => (
                <option key={table.name} value={table.name}>{table.name}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={resetTables} disabled={clearing}>
            {clearing ? "Clearing..." : "Clear Table"}
          </button>
        </div>
        {resetStatus && <p>{resetStatus}</p>}
      </section>
    </div>
  );
}
