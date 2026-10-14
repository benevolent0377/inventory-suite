import { useEffect, useState } from "react";
import { request } from "../api/client";
import { useSearchParams } from "react-router-dom";
import TabbedCard from "../components/ui/TabbedCard";
import { notify } from "../utils/notify";

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
  const [items, setItems] = useState([{ sku: "", quantity: 1, expected: "" }]);

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
    setItems([...items, { sku: "", quantity: 1, expected: "" }]);
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
      setItems([{ sku: "", quantity: 1, expected: "" }]);
      await load();
      notify("Order created");
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleCheckin(order, item) {
    try {
      await request(`/api/orders/${order.id}/items/${item.id}/checkin`, {
        method: "PATCH",
        body: JSON.stringify({ checked_in: !item.checked_in }),
      });
      await load();
      notify(item.checked_in ? "Item checked in; stock updated" : "Item checked out; stock updated");
    } catch (err) {
      setError(err.message);
    }
  }

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
            <div className="form-row" key={index}>
              <label>
                Item
                <select value={item.sku} onChange={(e) => updateItem(index, "sku", e.target.value)}>
                  <option value="">Select item</option>
                  {products.map((p) => <option key={p.id} value={p.sku}>{p.sku}</option>)}
                </select>
              </label>
              <label>
                Qty
                <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, "quantity", e.target.value)} />
              </label>
              <label>
                Expected Arrival
                <input type="date" value={item.expected} onChange={(e) => updateItem(index, "expected", e.target.value)} />
              </label>
            </div>
          ))}
          <button type="button" onClick={addItem}>Add Item Row</button>
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
                    <input type="checkbox" checked={item.checked_in} disabled={fulfilling === order.id} onChange={() => toggleCheckin(order, item)} />
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
    </div>
  );
}
