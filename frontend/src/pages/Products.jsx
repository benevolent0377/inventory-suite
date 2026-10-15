import { useEffect, useState } from "react";
import { request } from "../api/client";
import { useSearchParams } from "react-router-dom";
import TabbedCard from "../components/ui/TabbedCard";
import { formatMoney } from "../utils/currency";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { notify } from "../utils/notify";
import { confirm } from "../utils/confirm";
import { playPopup } from "../utils/sound";

const emptyForm = {
  sku: "",
  name: "",
  category: "",
  description: "",
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
  const [vendorFilter, setVendorFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [stock, setStock] = useState([]);
  const [removeStockOpen, setRemoveStockOpen] = useState(false);
  const [removeSku, setRemoveSku] = useState("");
  const [removeQty, setRemoveQty] = useState(1);
  const [removeReason, setRemoveReason] = useState("sale");
  const [removePurpose, setRemovePurpose] = useState("sale");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [statsProduct, setStatsProduct] = useState(null);
  const [statsOrders, setStatsOrders] = useState([]);
  const [statsMovements, setStatsMovements] = useState([]);
  const [statsOnHand, setStatsOnHand] = useState(0);
  const [statsPoints, setStatsPoints] = useState([]);
  const [statsMaxUnits, setStatsMaxUnits] = useState(1);
  const [statsChartLoading, setStatsChartLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [dateRange, setDateRange] = useState("30");
  const [error, setError] = useState("");

  const load = async () => {
    const [productData, vendorData, stockData] = await Promise.all([
      request("/api/products"),
      request("/api/vendors"),
      request("/api/stock"),
    ]);
    setProducts(productData);
    setVendors(vendorData);
    setStock(stockData);
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
      description: product.description,
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
    if (!(await confirm("Delete this item?"))) return;
    setError("");
    try {
      await request(`/api/products/${id}`, { method: "DELETE" });
      notify("Item deleted");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function openStats(product) {
    setStatsProduct(product);
    setStatsOrders([]);
    setStatsMovements([]);
    setStatsOnHand(0);
    setStatsError("");
    setStatsPoints([]);
    setStatsMaxUnits(1);
    setStatsChartLoading(true);
    setDateRange("30");
    try {
      const stockData = await request(`/api/stock?product_id=${product.id}`);
      setStatsOnHand(Array.isArray(stockData) && stockData.length ? Number(stockData[0].on_hand) : 0);
    } catch (err) {
      setStatsError(err.message);
      setStatsChartLoading(false);
    }
  }

  useEffect(() => {
    if (!statsProduct) return;
    let active = true;
    setStatsChartLoading(true);
    setStatsError("");
    request(`/api/products/${statsProduct.id}/stats?date_range=${encodeURIComponent(dateRange)}`)
      .then((data) => {
        if (active) {
          setStatsPoints(Array.isArray(data.points) ? data.points : []);
          setStatsMaxUnits(data.max_units || 1);
        }
      })
      .catch((err) => {
        if (active) setStatsError(err.message);
      })
      .finally(() => {
        if (active) setStatsChartLoading(false);
      });
    return () => {
      active = false;
    };
  }, [statsProduct, dateRange]);

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

  const query = (searchText || searchParams.get("q") || "").toLowerCase();
  const visibleProducts = products.filter((product) => {
    const matchesSearch = !query || [product.sku, product.name, product.category, product.vendor_id, vendors.find((v) => v.id === product.vendor_id)?.name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
    const matchesVendor = !vendorFilter || String(product.vendor_id) === String(vendorFilter);
    return matchesSearch && matchesVendor;
  });

  const stockBySku = Object.fromEntries(stock.map((row) => [row.product_sku, row]));

  function openRemoveStock(sku) {
    setRemoveSku(sku);
    setRemoveQty(1);
    setRemoveReason("sale");
    setRemovePurpose("sale");
    setRemoveStockOpen(true);
  }

  async function submitRemoveStock(event) {
    event.preventDefault();
    setError("");
    try {
      await request("/api/stock/remove", {
        method: "POST",
        body: JSON.stringify({
          product_sku: (removeSku || "").trim(),
          quantity: Number(removeQty),
          reason: removeReason || removePurpose,
          liquidated: removePurpose === "liquidated",
        }),
      });
      await load();
      setRemoveStockOpen(false);
      notify(removePurpose === "liquidated" ? "Stock liquidated" : "Stock removed");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h2>Items</h2>
      {error && <p className="error">{error}</p>}
      <div className="form-row">
        <label>Search<input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search items" /></label>
        <label>Vendor
          <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
            <option value="">All vendors</option>
            {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
        </label>
      </div>
      <TabbedCard
        defaultTab={1}
        style={{ marginTop: "25px" }}
        tabs={[
          {
            label: "Add Item",
            content: (
              <form className="form-grid" onSubmit={handleSubmit}>
        <label>SKU<input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required /></label>
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
        <label>Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
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
        <thead><tr><th>SKU</th><th>Name</th><th>Description</th><th>Vendor</th><th>Price</th><th>Last Price</th><th>Cost</th><th>Required</th><th>Overhead Days</th><th>Overhead Months</th><th>Actions</th></tr></thead>
        <tbody>
          {visibleProducts.map((product) => (
            <tr key={product.id}>
              <td>{product.sku}</td>
              <td>{product.name}</td>
              <td>
                <details>
                  <summary style={{ cursor: "pointer", display: "block", maxWidth: "18rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {product.description || "-"}
                  </summary>
                  <div style={{ marginTop: "0.25rem", whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: "30rem" }}>
                    {product.description || "-"}
                  </div>
                </details>
              </td>
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
                <button type="button" onClick={() => openRemoveStock(product.sku)}>Sell Item</button>
                <button type="button" onClick={() => openStats(product)}>Statistics</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
            ),
          },
        ]}
      />
      {statsProduct && (
        <div className="edit-modal-overlay">
          <div className="edit-modal-card" style={{ maxWidth: "92vw", width: "1140px", maxHeight: "90vh", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
              <h3 style={{ margin: 0 }}>Statistics: {statsProduct.sku}</h3>
              <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="all">All time</option>
              </select>
            </div>
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem" }}>In inventory now: {statsOnHand}</p>
            {statsLoading && <p>Loading...</p>}
            {statsError && <p className="error">{statsError}</p>}
            {statsChartLoading && <p>Loading chart...</p>}
            {!statsLoading && !statsError && !statsChartLoading && statsPoints.length > 0 && (
              <div style={{ marginTop: "12px", height: "360px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statsPoints}>
                    <XAxis dataKey="key" tickFormatter={(value) => String(value).slice(5)} interval={Math.max(1, Math.floor(statsPoints.length / 12))} />
                    <YAxis domain={[0, statsMaxUnits]} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="ordered" name="Ordered" fill="#3b82f6" />
                    <Bar dataKey="sales" name="Sales" fill="#dc2626" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {!statsLoading && !statsError && !statsChartLoading && statsPoints.length === 0 && <p>No chart available.</p>}
            <div className="edit-modal-actions" style={{ marginTop: "12px" }}>
              <button type="button" onClick={() => setStatsProduct(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {editingId && editForm && (
        <div className="edit-modal-overlay">
          <div className="edit-modal-card">
            <h3>Edit Item</h3>
            <form className="edit-form" onSubmit={(event) => { event.preventDefault(); saveEdit(editingId); }}>
              <label>SKU<input value={editForm.sku} onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })} required /></label>
              <label>Name<input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required /></label>
              <label>Category<input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} /></label>
              <label>Description<input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></label>
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

      {removeStockOpen && (
        <div className="edit-modal-overlay" onClick={() => setRemoveStockOpen(false)}>
          <div className="edit-modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Sell Item</h3>
            <form className="form-row" onSubmit={submitRemoveStock}>
              <label>
                Item
                <select value={removeSku} onChange={(e) => setRemoveSku(e.target.value)} required>
                  <option value="">Select item</option>
                  {products.map((product) => <option key={product.id} value={product.sku}>{product.sku} - {product.name}</option>)}
                </select>
              </label>
              <label>
                Qty
                <input type="number" min="1" value={removeQty} onChange={(e) => setRemoveQty(e.target.value)} required />
              </label>
              <label>
                Reason
                <input value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} />
              </label>
              <label>
                Purpose
                <select value={removePurpose} onChange={(e) => setRemovePurpose(e.target.value)}>
                  <option value="sale">Sale</option>
                  <option value="liquidated">Liquidated</option>
                </select>
              </label>
              <div style={{ display: "flex", gap: "0.5rem", width: "100%", marginTop: "0.5rem" }}>
                <button type="submit">Sell Item</button>
                <button type="button" onClick={() => setRemoveStockOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
