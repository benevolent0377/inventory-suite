import { useEffect, useState } from "react";
import { request } from "../api/client";
import { useSearchParams } from "react-router-dom";
import TabbedCard from "../components/ui/TabbedCard";
import { notify } from "../utils/notify";
import { confirm } from "../utils/confirm";

import { formatMoney } from "../utils/currency";
export default function OrdersPage() {
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [placedBy, setPlacedBy] = useState(() => localStorage.getItem("inventory-user") || "");
  const [vendorId, setVendorId] = useState("");
  const [tracking, setTracking] = useState("");
  const [items, setItems] = useState([{ sku: "", quantity: 1, expected: "", search: "" }]);
  const [searchPopupIndex, setSearchPopupIndex] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!placedBy && users.length) {
      const active = localStorage.getItem("inventory-user");
      if (active && users.some((user) => user.name === active)) setPlacedBy(active);
    }
  }, [users, placedBy]);

  const load = async () => {
    const [orderData, vendorData, productData, userData] = await Promise.all([
      request("/api/orders"),
      request("/api/vendors"),
      request("/api/products"),
      request("/api/users"),
    ]);
    setOrders(orderData);
    setVendors(vendorData);
    setProducts(productData);
    setUsers(userData);
  };

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    load().catch((err) => setError(err.message));
  }, []);

  function updateItem(index, key, value) {
    const next = [...items];
    next[index] = { ...next[index], [key]: value };
    setItems(next);
  }

  function addItem() {
    setItems([...items, { sku: "", quantity: 1, expected: "", search: "" }]);
  }

  function removeItem(index) {
    setItems((current) => (current.length <= 1 ? [{ sku: "", quantity: 1, expected: "", search: "" }] : current.filter((_, i) => i !== index)));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      await request("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          placed_by: placedBy,
          vendor_id: vendorId === "" ? null : Number(vendorId),
          tracking_number: tracking,
          items: items
            .filter((item) => item.sku)
            .map((item) => ({
              item_number: item.sku,
              quantity: Number(item.quantity),
              expected_arrival_date: item.expected ? new Date(item.expected).toISOString() : null,
            })),
        }),
      });
      setPlacedBy("");
      setVendorId("");
      setTracking("");
      setItems([{ sku: "", quantity: 1, expected: "", search: "" }]);
      await load();
      notify("Order created");
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleCheckin(order, item) {
    const nextChecked = !item.checked_in;
    if (nextChecked && item.expected_arrival_date) {
      const expected = new Date(item.expected_arrival_date);
      const today = new Date();
      const expectedDay = new Date(expected.getFullYear(), expected.getMonth(), expected.getDate());
      const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (todayDay < expectedDay) {
        const ok = await confirm(`This item is not expected until ${expectedDay.toISOString().slice(0, 10)}. Check it in now?`);
        if (!ok) return;
      }
    }
    try {
      await request(`/api/orders/${order.id}/items/${item.id}/checkin`, {
        method: "PATCH",
        body: JSON.stringify({ checked_in: nextChecked }),
      });
      await load();
      notify(nextChecked ? "Item checked in; stock updated" : "Item checked out; stock updated");
    } catch (err) {
      setError(err.message);
    }
  }

  const orderProducts = vendorId ? products.filter((product) => String(product.vendor_id) === String(vendorId)) : products;

  return (
    <div className="page">
      <h2>Orders</h2>
      {error && <p className="error">{error}</p>}
      <TabbedCard
        tabs={[
          {
            label: "Create Order",
            content: (
              <form className="form-grid" onSubmit={handleSubmit}>
        <label>Placed By
          <select value={placedBy} onChange={(e) => setPlacedBy(e.target.value)} required>
            <option value="">Select user</option>
            {users.map((user) => <option key={user.id} value={user.name}>{user.name}</option>)}
          </select>
        </label>
        <label>Vendor
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">None</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <label>Tracking<input value={tracking} onChange={(e) => setTracking(e.target.value)} /></label>
        <div className="order-items-editor">
          <p>Items</p>
          {items.map((item, index) => (
            <div key={index}>
              <div className="form-row">
                <label>
                  Item
                  <select value={item.sku} onChange={(e) => updateItem(index, "sku", e.target.value)}>
                    <option value="">Select item</option>
                    {orderProducts.map((p) => <option key={p.id} value={p.sku}>{p.sku}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => { setSearchPopupIndex(index); setSearchQuery(""); }} aria-label="Search items" style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "0.25rem", whiteSpace: "nowrap" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </button>
                <label>
                  Qty
                  <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, "quantity", e.target.value)} />
                </label>
                <label>
                  Expected Arrival
                  <input type="date" value={item.expected} onChange={(e) => updateItem(index, "expected", e.target.value)} />
                </label>
              </div>
              {index < items.length - 1 && <br />}
            </div>
          ))}
          <div className="form-row">
            <button type="button" onClick={addItem}>Add Item Row</button>
            {items.length > 2 && <button type="button" onClick={() => removeItem(items.length - 1)}>Delete Item Row</button>}
          </div>
        </div>
        <button type="submit">Create Order</button>
          </form>
            ),
          },
          {
            label: "Orders",
            content: (
              <div>


      {(searchParams.get("q")
        ? orders.filter((order) =>
            [
              order.placed_by,
              order.vendor_name,
              order.tracking_number,
              order.fulfilled ? "fulfilled" : "unfulfilled",
              ...(order.items || []).map((item) => `${item.product_sku} ${item.product_name}`),
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes((searchParams.get("q") || "").toLowerCase()),
          )
        : orders
      ).map((order) => (
        <div key={order.id} className="order-card">
          <h3>Order #{order.id}</h3>
          <p>{order.placed_by} | {order.vendor_name || "No vendor"} | {order.tracking_number || "No tracking"} | total {formatMoney(order.total_cost)} | {order.fulfilled ? "Fulfilled" : "Unfulfilled"}</p>
          <p>Checking an item adds its quantity to stock.</p>
          <table className="data-table">
            <thead><tr><th>Item</th><th>Qty</th><th>Expected Arrival</th><th>Checked In</th></tr></thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.product_sku} - {item.product_name}</td>
                  <td>{item.quantity}</td>
                  <td>{item.expected_arrival_date ? item.expected_arrival_date.slice(0, 10) : "-"}</td>
                  <td>
                    <input type="checkbox" checked={item.checked_in} onChange={() => toggleCheckin(order, item)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
              </div>
            ),
          },
        ]}
      />
      {searchPopupIndex !== null && (
        <div className="edit-modal-overlay" onClick={() => setSearchPopupIndex(null)}>
          <div className="edit-modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Search Items</h3>
            <label>Search<input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus /></label>
            <div style={{ maxHeight: "240px", overflow: "auto", marginTop: "0.5rem" }}>
              {orderProducts.filter((product) => [product.sku, product.name].join(" ").toLowerCase().includes(searchQuery.toLowerCase())).map((product) => (
                <div key={product.id} className="form-row" style={{ alignItems: "center" }}>
                  <span>{product.sku} - {product.name}</span>
                  <button type="button" onClick={() => { updateItem(searchPopupIndex, "sku", product.sku); setSearchPopupIndex(null); }}>Add</button>
                </div>
              ))}
            </div>
            <div className="edit-modal-actions">
              <button type="button" onClick={() => setSearchPopupIndex(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
