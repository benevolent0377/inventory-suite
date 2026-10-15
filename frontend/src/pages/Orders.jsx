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
const [orderStatusFilter, setOrderStatusFilter] = useState("all");
const [orderSearchQuery, setOrderSearchQuery] = useState(searchParams.get("q") || "");
const [orderSearchField, setOrderSearchField] = useState("all");
const [orderSort, setOrderSort] = useState("desc");

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
    setItems((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
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
        defaultTab={searchParams.get("tab") === "create" ? 0 : 1}
        tabs={[
          {
            label: "Create Order",
            content: (
              <form className="order-create-form" onSubmit={handleSubmit}>
        <div className="order-create-left">
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
          <button type="submit">Create Order</button>
        </div>
        <div className="order-create-right">
          <div className="order-items-editor">
            <p>Items</p>
            <div className="order-items-scroll">
          {items.map((item, index) => (
            <div key={index} className="order-item-card">
              <div className="order-item-title">
                <span>Item {index + 1}</span>
                {index > 0 && items.length > 1 && (
                  <button type="button" className="order-item-remove" onClick={() => removeItem(index)} aria-label="Remove item row">
                    Remove
                  </button>
                )}
              </div>
              <div className="form-row order-item-fields">
                <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", flex: "1 1 180px", minWidth: 0 }}>
                  <label style={{ flex: 1, minWidth: 0 }}>
                    Item
                    <select style={{ width: "100%" }} value={item.sku} onChange={(e) => updateItem(index, "sku", e.target.value)}>
                      <option value="">Select item</option>
                      {orderProducts.map((p) => <option key={p.id} value={p.sku}>{p.sku}</option>)}
                    </select>
                  </label>
                  <button type="button" className="order-item-search" onClick={() => { setSearchPopupIndex(index); setSearchQuery(""); }} aria-label="Search items" style={{ flex: "0 0 10%", display: "inline-flex", justifyContent: "center", alignItems: "center", whiteSpace: "nowrap", padding: "0 4px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                  </button>
                </div>
                <label>
                  Qty
                  <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, "quantity", e.target.value)} />
                </label>
                <label>
                  Expected Arrival
                  <input type="date" value={item.expected} onChange={(e) => updateItem(index, "expected", e.target.value)} />
                </label>
              </div>
            </div>
          ))}
          <div className="form-row">
            <button type="button" onClick={addItem}>Add Item</button>
          </div>
            </div>
          </div>
        </div>
          </form>
            ),
          },
          {
            label: "Orders",
            content: (
              <div>
      <div className="orders-filter">
        <label>Search
          <input value={orderSearchQuery} onChange={(event) => setOrderSearchQuery(event.target.value)} placeholder="Search orders" />
        </label>
        <label>Filter
          <select value={orderSearchField} onChange={(event) => setOrderSearchField(event.target.value)}>
            <option value="all">All fields</option>
            <option value="id">Order ID</option>
            <option value="tracking">Tracking No.</option>
          </select>
        </label>
        <label>Sort
          <select value={orderSort} onChange={(event) => setOrderSort(event.target.value)}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
            <option value="tracking">Tracking No.</option>
            <option value="id">Order ID</option>
          </select>
        </label>
        <label>Status
          <select value={orderStatusFilter} onChange={(event) => setOrderStatusFilter(event.target.value)}>
            <option value="all">All</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="unfulfilled">Unfulfilled</option>
          </select>
        </label>
      </div>

      {orders
        .filter((order) => {
          if (orderStatusFilter === "fulfilled") return order.fulfilled;
          if (orderStatusFilter === "unfulfilled") return !order.fulfilled;
          return true;
        })
        .filter((order) => {
          const query = (orderSearchQuery || searchParams.get("q") || "").toLowerCase();
          if (!query) return true;
          const candidates =
            orderSearchField === "id" ? [String(order.id)] :
            orderSearchField === "tracking" ? [order.tracking_number] :
            [String(order.id), order.tracking_number];
          return candidates
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query);
        })
        .sort((a, b) => {
          const aDate = new Date(a.order_date || a.created_at).getTime();
          const bDate = new Date(b.order_date || b.created_at).getTime();
          if (orderSort === "asc") return aDate - bDate;
          if (orderSort === "desc") return bDate - aDate;
          if (orderSort === "tracking") return String(a.tracking_number || "").localeCompare(String(b.tracking_number || ""));
          if (orderSort === "id") return a.id - b.id;
          return bDate - aDate;
        })
        .map((order) => (
        <div key={order.id} className="order-card">
          <div className="order-card-header">
            <h3>Order #{order.id}</h3>
            <span className={`order-status ${order.fulfilled ? "fulfilled" : "open"}`}>{order.fulfilled ? "Fulfilled" : "Unfulfilled"}</span>
          </div>
          <div className="order-meta">
            <span><strong>Placed by</strong> {order.placed_by}</span>
            <span><strong>Vendor</strong> {order.vendor_name || "No vendor"}</span>
            <span><strong>Tracking</strong> {order.tracking_number || "No tracking"}</span>
            <span><strong>Total</strong> {formatMoney(order.total_cost)}</span>
          </div>
          <p className="order-hint">Checking an item adds its quantity to stock.</p>
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
              {orderProducts.filter((product) => [product.sku, product.name, product.description].join(" ").toLowerCase().includes(searchQuery.toLowerCase())).map((product) => (
                <div key={product.id} className="form-row" style={{ alignItems: "center", justifyContent: "space-between", margin: "0.5rem 0", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                  <span>{product.sku} - {product.name}</span>
                  <button type="button" onClick={() => { updateItem(searchPopupIndex, "sku", product.sku); setSearchPopupIndex(null); }} style={{ marginLeft: "auto" }}>Add</button>
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
