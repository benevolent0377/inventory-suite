import { useEffect, useState } from "react";
import { request } from "../api/client";
import { useSearchParams } from "react-router-dom";
import TabbedCard from "../components/ui/TabbedCard";
import { formatMoney } from "../utils/currency";
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
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [statsProduct, setStatsProduct] = useState(null);
  const [statsOrders, setStatsOrders] = useState([]);
  const [statsMovements, setStatsMovements] = useState([]);
  const [statsOnHand, setStatsOnHand] = useState(0);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [dateRange, setDateRange] = useState("30");
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
    setStatsLoading(true);
     try {
       const [ordersData, movementsData, stockData] = await Promise.all([
         request("/api/orders"),
         request(`/api/movements?product_id=${product.id}`),
         request(`/api/stock?product_id=${product.id}`),
       ]);
       setStatsOrders(Array.isArray(ordersData) ? ordersData : []);
       setStatsMovements(Array.isArray(movementsData) ? movementsData : []);
       setStatsOnHand(Array.isArray(stockData) && stockData.length ? Number(stockData[0].on_hand) : 0);
     } catch (err) {
      setStatsError(err.message);
    } finally {
      setStatsLoading(false);
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
            {!statsLoading && !statsError && (() => {
              const toDateKey = (value) => {
                if (!value) return null;
                const date = new Date(value);
                if (Number.isNaN(date.getTime())) return null;
                return date.toISOString().slice(0, 10);
              };
              const today = new Date();
              const todayKey = today.toISOString().slice(0, 10);
              let startDate = null;
              if (dateRange === "all") {
                const dates = [
                  ...statsOrders.map((order) => toDateKey(order.order_date || order.created_at)),
                  ...statsMovements.map((movement) => toDateKey(movement.created_at)),
                ].filter(Boolean);
                startDate = dates.length ? dates.reduce((min, key) => (key < min ? key : min), dates[0]) : todayKey;
              } else {
                const days = Number(dateRange);
                const start = new Date(today);
                start.setDate(start.getDate() - days + 1);
                startDate = start.toISOString().slice(0, 10);
              }
              const dayKeys = [];
              {
                const cursor = new Date(`${startDate}T00:00:00`);
                const end = new Date(`${todayKey}T00:00:00`);
                while (cursor <= end) {
                  dayKeys.push(cursor.toISOString().slice(0, 10));
                  cursor.setDate(cursor.getDate() + 1);
                }
              }
              const orderedByDay = new Map();
              const salesByDay = new Map();
              for (const order of statsOrders) {
                const orderDate = toDateKey(order.order_date || order.created_at);
                if (!orderDate || orderDate < startDate || orderDate > todayKey) continue;
                for (const item of order.items || []) {
                  if (item.product_sku !== statsProduct.sku) continue;
                  orderedByDay.set(orderDate, (orderedByDay.get(orderDate) || 0) + Number(item.quantity || 0));
                }
              }
              for (const movement of statsMovements) {
                const moveDate = toDateKey(movement.created_at);
                if (!moveDate || moveDate < startDate || moveDate > todayKey) continue;
                if (!["sale", "liquidation"].includes(String(movement.movement_type).toLowerCase())) continue;
                const qty = Math.abs(Number(movement.quantity || 0));
                salesByDay.set(moveDate, (salesByDay.get(moveDate) || 0) + qty);
              }
              const bucketSize =
                dateRange === "7" ? 1 :
                dateRange === "30" ? 3 :
                dateRange === "90" ? 10 :
                Math.max(1, Math.ceil(dayKeys.length / 120));
              const points = [];
              for (let i = 0; i < dayKeys.length; i += bucketSize) {
                const chunk = dayKeys.slice(i, i + bucketSize);
                let ordered = 0;
                let sales = 0;
                for (const key of chunk) {
                  ordered += orderedByDay.get(key) || 0;
                  sales += salesByDay.get(key) || 0;
                }
                points.push({ key: chunk[0], endKey: chunk[chunk.length - 1], ordered, sales });
              }
              const maxUnits = Math.max(1, ...points.map((point) => Math.max(point.ordered, point.sales)));
              const chartHeight = 315;
              const orderedColor = "var(--accent)";
              const salesColor = "var(--accent)";
              return (
                <div style={{ marginTop: "12px", padding: "12px", background: "var(--panel-strong, rgba(0,0,0,0.15))", border: "1px solid var(--border, rgba(0,0,0,0.1))", borderRadius: "var(--radius, 8px)", boxShadow: "var(--shadow, none)" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                    <div style={{ position: "relative", width: "44px", fontSize: "0.75rem", color: "var(--muted)" }}>
                      <div style={{ position: "absolute", top: 0, left: 0 }}>Units</div>
                      <div style={{ position: "absolute", top: "4px", right: 0 }}>{maxUnits}</div>
                      <div style={{ position: "absolute", top: "50%", right: 0, transform: "translateY(-50%)" }}>{Math.round(maxUnits / 2)}</div>
                      <div style={{ position: "absolute", bottom: 0, right: 0 }}>0</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0, overflowX: "auto" }}>
                      <div title="hover bars for details" style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: `${chartHeight}px`, padding: "4px", background: "var(--panel, rgba(0,0,0,0.08))", borderRadius: "6px" }}>
                      {points.map((point) => {
                        const orderedHeight = (point.ordered / maxUnits) * chartHeight;
                        const salesHeight = (point.sales / maxUnits) * chartHeight;
                        const totalHeightBar = Math.max(orderedHeight, salesHeight);
                        return (
                          <div key={point.key} title={`${point.key}${point.endKey && point.endKey !== point.key ? ` to ${point.endKey}` : ""}: ordered ${point.ordered}, sales ${point.sales}`} style={{ flex: "1 0 6px", minWidth: "6px", position: "relative", height: "100%" }}>
                            <div style={{ position: "absolute", left: "50%", width: "8px", transform: "translateX(-50%)", bottom: 0, height: `${totalHeightBar}px`, background: orderedColor, opacity: 0.35 }} />
                            <div style={{ position: "absolute", left: "50%", width: "8px", transform: "translateX(-50%)", bottom: 0, height: `${salesHeight}px`, background: salesColor, filter: "hue-rotate(180deg)" }} />
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: "2px", padding: "0 4px 4px", marginTop: "4px" }}>
                      {points.map((point) => (
                        <div key={`${point.key}-date`} style={{ flex: "1 0 6px", minWidth: "6px", textAlign: "center", fontSize: "0.6rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden" }}>
                          {point.key.slice(5)}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "2px", padding: "0 4px 4px" }}>
                      {points.map((point) => (
                        <div key={`${point.key}-value`} style={{ flex: "1 0 6px", minWidth: "6px", textAlign: "center", fontSize: "0.6rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden" }}>
                          {point.ordered || point.sales ? `${point.ordered}/${point.sales}` : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "8px", fontSize: "0.75rem" }}>
                    <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: orderedColor, opacity: 0.35 }} /> Ordered</span>
                    <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: salesColor, filter: "hue-rotate(180deg)" }} /> Sales</span>
                  </div>
                  <p style={{ marginTop: "6px", fontSize: "0.75rem", opacity: 0.8 }}>Y-axis: units ({maxUnits} max)</p>
                </div>
              );
            })()}
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

    </div>
  );
}
