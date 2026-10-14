import { useEffect, useState } from "react";
import { request } from "../api/client";
import { useSearchParams } from "react-router-dom";
import TabbedCard from "../components/ui/TabbedCard";
import { formatMoney } from "../utils/currency";
import { notify } from "../utils/notify";
import { playPopup } from "../utils/sound";

const emptyForm = {
  sku: "",
  name: "",
  category: "",
  unit: "each",
  price: 0,
  cost: 0,
  required_backstock: 0,
  order_overhead_days: 0,
  order_overhead_months: 0,
  duplicate_item_numbers: "",
  vendor_id: "",
};

export default function ProductsPage() {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    const [productData, vendorData] = await Promise.all([
      request("/api/products"),
      request("/api/vendors"),
    ]);
    setProducts(productData);
    setVendors(vendorData);
    if (vendorData.length) {
      setForm((current) => (current.vendor_id === "" ? { ...current, vendor_id: String(vendorData[0].id) } : current));
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    load().catch((err) => setError(err.message));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      const payload = toPayload(form);
      await request("/api/products", { method: "POST", body: JSON.stringify(payload) });
      notify(`Item ${payload.sku} created`);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function startEdit(product) {
    playPopup();
    setEditingId(product.id);
    setEditForm({
      sku: product.sku,
      name: product.name,
      category: product.category,
      unit: product.unit,
      price: product.price,
      cost: product.cost,
      required_backstock: product.required_backstock,
      order_overhead_days: product.order_overhead_days,
      order_overhead_months: product.order_overhead_months,
      duplicate_item_numbers: (product.duplicate_item_numbers || []).join(", "),
      vendor_id: product.vendor_id ?? (vendors.length ? String(vendors[0].id) : ""),
    });
  }

  async function saveEdit(id) {
    setError("");
    try {
      await request(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(toPayload(editForm)) });
      notify(`Item ${toPayload(editForm).sku} updated`);
      setEditingId(null);
      setEditForm(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this item?")) return;
    setError("");
    try {
      await request(`/api/products/${id}`, { method: "DELETE" });
      notify("Item deleted");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function toPayload(raw) {
    return {
      ...raw,
      price: Number(raw.price),
      cost: Number(raw.cost),
      required_backstock: Number(raw.required_backstock),
      order_overhead_days: Number(raw.order_overhead_days),
      order_overhead_months: Number(raw.order_overhead_months),
      duplicate_item_numbers: (raw.duplicate_item_numbers || "").split(",").map((s) => s.trim()).filter(Boolean),
      vendor_id: raw.vendor_id === "" ? null : Number(raw.vendor_id),
    };
  }

  const query = (searchParams.get("q") || "").toLowerCase();
  const visibleProducts = query
    ? products.filter((product) =>
        [product.sku, product.name, product.category, product.vendor_id, vendors.find((v) => v.id === product.vendor_id)?.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : products;

  return (
    <div className="page">
      <h2>Items</h2>
      {error && <p className="error">{error}</p>}
      <TabbedCard
        tabs={[
          {
            label: "Add Item",
            content: (
              <form className="form-grid" onSubmit={handleSubmit}>
        <label>SKU<input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required /></label>
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
        <label>Unit<input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></label>
        <label>Vendor
          <select value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} required>
            {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
        </label>
        <label>Price<input type="number" step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
        <label>Cost<input type="number" step="any" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></label>
        <label>Required Backstock<input type="number" step="any" value={form.required_backstock} onChange={(e) => setForm({ ...form, required_backstock: e.target.value })} /></label>
        <label>Overhead Days<input type="number" step="any" value={form.order_overhead_days} onChange={(e) => setForm({ ...form, order_overhead_days: e.target.value })} /></label>
        <label>Overhead Months<input type="number" step="any" value={form.order_overhead_months} onChange={(e) => setForm({ ...form, order_overhead_months: e.target.value })} /></label>
        <label>Duplicate / Replacement Item Numbers<input value={form.duplicate_item_numbers} onChange={(e) => setForm({ ...form, duplicate_item_numbers: e.target.value })} placeholder="comma separated SKUs or item numbers" /></label>
        <button type="submit">Add</button>
          </form>
            ),
          },
          {
            label: "Items",
            content: (
              <table className="data-table">
        <thead><tr><th>SKU</th><th>Name</th><th>Vendor</th><th>Price</th><th>Last Price</th><th>Cost</th><th>Required</th><th>Overhead Days</th><th>Overhead Months</th><th>Actions</th></tr></thead>
        <tbody>
          {visibleProducts.map((product) => (
            <tr key={product.id}>
              <td>{product.sku}</td>
              <td>{product.name}</td>
              <td>{vendors.find((vendor) => vendor.id === product.vendor_id)?.name || "-"}</td>
              <td>{formatMoney(product.price)}</td>
              <td>{product.last_price == null ? "-" : formatMoney(product.last_price)}</td>
              <td>{formatMoney(product.cost)}</td>
              <td>{product.required_backstock}</td>
              <td>{product.order_overhead_days}</td>
              <td>{product.order_overhead_months}</td>
              <td>
                <button type="button" onClick={() => startEdit(product)}>Edit</button>
                <button type="button" onClick={() => handleDelete(product.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
            ),
          },
        ]}
      />
      {editingId && editForm && (
        <div className="edit-modal-overlay">
          <div className="edit-modal-card">
            <h3>Edit Item</h3>
            <form className="edit-form" onSubmit={(event) => { event.preventDefault(); saveEdit(editingId); }}>
              <label>SKU<input value={editForm.sku} onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })} required /></label>
              <label>Name<input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required /></label>
              <label>Category<input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} /></label>
              <label>Unit<input value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} /></label>
              <label>Vendor
                <select value={editForm.vendor_id} onChange={(e) => setEditForm({ ...editForm, vendor_id: e.target.value })} required>
                  {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                </select>
              </label>
              <label>Price<input type="number" step="any" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} /></label>
              <label>Cost<input type="number" step="any" value={editForm.cost} onChange={(e) => setEditForm({ ...editForm, cost: e.target.value })} /></label>
              <label>Required Backstock<input type="number" step="any" value={editForm.required_backstock} onChange={(e) => setEditForm({ ...editForm, required_backstock: e.target.value })} /></label>
              <label>Overhead Days<input type="number" step="any" value={editForm.order_overhead_days} onChange={(e) => setEditForm({ ...editForm, order_overhead_days: e.target.value })} /></label>
              <label>Overhead Months<input type="number" step="any" value={editForm.order_overhead_months} onChange={(e) => setEditForm({ ...editForm, order_overhead_months: e.target.value })} /></label>
              <label>Duplicate / Replacement Item Numbers<input value={editForm.duplicate_item_numbers} onChange={(e) => setEditForm({ ...editForm, duplicate_item_numbers: e.target.value })} /></label>
              <div className="edit-modal-actions">
                <button type="submit">Save</button>
                <button type="button" onClick={() => { setEditingId(null); setEditForm(null); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
