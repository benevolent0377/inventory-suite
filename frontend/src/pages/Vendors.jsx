import { useEffect, useState } from "react";
import { request } from "../api/client";
import { useSearchParams } from "react-router-dom";
import TabbedCard from "../components/ui/TabbedCard";
import { notify } from "../utils/notify";

export default function VendorsPage() {
  const [searchParams] = useSearchParams();
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState({
    name: "", contact_name: "", email: "", phone: "", address: "", notes: "",
  });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    const data = await request("/api/vendors");
    setVendors(data);
  };

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    load().catch((err) => setError(err.message));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      await request("/api/vendors", { method: "POST", body: JSON.stringify(form) });
      notify(`Vendor ${form.name} created`);
      setForm({ name: "", contact_name: "", email: "", phone: "", address: "", notes: "" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function startEdit(vendor) {
    setEditingId(vendor.id);
    setEditForm({ ...vendor });
  }

  async function saveEdit(id) {
    setError("");
    try {
      await request(`/api/vendors/${id}`, { method: "PUT", body: JSON.stringify(editForm) });
      notify(`Vendor ${editForm.name} updated`);
      setEditingId(null);
      setEditForm(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this vendor?")) return;
    setError("");
    try {
      await request(`/api/vendors/${id}`, { method: "DELETE" });
      notify("Vendor deleted");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const query = (searchParams.get("q") || "").toLowerCase();
  const visibleVendors = query
    ? vendors.filter((vendor) =>
        [vendor.name, vendor.contact_name, vendor.email, vendor.phone, vendor.address, vendor.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : vendors;

  return (
    <div className="page">
      <h2>Vendors</h2>
      {error && <p className="error">{error}</p>}
      <TabbedCard
        tabs={[
          {
            label: "Add Vendor",
            content: (
              <form className="form-grid" onSubmit={handleSubmit}>
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Contact<input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></label>
        <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Address<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label>Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <button type="submit">Add</button>
          </form>
            ),
          },
          {
            label: "Vendors",
            content: (
              <table className="data-table">
        <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>Address</th><th>Notes</th><th>Actions</th></tr></thead>
        <tbody>
          {visibleVendors.map((vendor) => (
            <tr key={vendor.id}>
              {editingId === vendor.id ? (
                <>
                  <td><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                  <td><input value={editForm.contact_name} onChange={(e) => setEditForm({ ...editForm, contact_name: e.target.value })} /></td>
                  <td><input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></td>
                  <td><input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></td>
                  <td><input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></td>
                  <td><input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></td>
                  <td>
                    <button type="button" onClick={() => saveEdit(vendor.id)}>Save</button>
                    <button type="button" onClick={() => { setEditingId(null); setEditForm(null); }}>Cancel</button>
                  </td>
                </>
              ) : (
                <>
                  <td>{vendor.name}</td>
                  <td>{vendor.contact_name}</td>
                  <td>{vendor.email}</td>
                  <td>{vendor.phone}</td>
                  <td>{vendor.address}</td>
                  <td>{vendor.notes}</td>
                  <td>
                    <button type="button" onClick={() => startEdit(vendor)}>Edit</button>
                    <button type="button" onClick={() => handleDelete(vendor.id)}>Delete</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
            ),
          },
        ]}
      />
    </div>
  );
}
