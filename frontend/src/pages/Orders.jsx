import { useEffect, useState } from "react";
import { request } from "../api/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import TabbedCard from "../components/ui/TabbedCard";
import { notify } from "../utils/notify";
import { confirm } from "../utils/confirm";

import { formatMoney } from "../utils/currency";
export default function OrdersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [placedBy, setPlacedBy] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("inventory-user") || "null");
      return stored?.username || stored?.name || (typeof stored === "string" ? stored : "");
    } catch {
      return localStorage.getItem("inventory-user") || "";
    }
  });
  const [vendorId, setVendorId] = useState("");
  const [tracking, setTracking] = useState("");
  const [items, setItems] = useState([{ sku: "", quantity: 1, expected: "", search: "" }]);
  const [requests, setRequests] = useState([]);
  const [requestStatusFilter, setRequestStatusFilter] = useState("all");
  const [requestSearchQuery, setRequestSearchQuery] = useState("");
  const [requestSearchField, setRequestSearchField] = useState("all");
  const [requestSort, setRequestSort] = useState("desc");
  const [requestId, setRequestId] = useState(null);
  const [searchPopupIndex, setSearchPopupIndex] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
const [orderStatusFilter, setOrderStatusFilter] = useState("all");
const [orderSearchQuery, setOrderSearchQuery] = useState(searchParams.get("q") || "");
const [orderSearchField, setOrderSearchField] = useState("all");
const [orderSort, setOrderSort] = useState("desc");

  useEffect(() => {
    if (!placedBy && users.length) {
      let active = "";
      try {
        const stored = JSON.parse(localStorage.getItem("inventory-user") || "null");
        active = stored?.username || stored?.name || (typeof stored === "string" ? stored : "");
      } catch {
        active = localStorage.getItem("inventory-user") || "";
      }
      if (active && users.some((user) => user.username === active || user.name === active)) setPlacedBy(active);
    }
  }, [users, placedBy]);

  const load = async () => {
    const [orderData, vendorData, productData, userData, requestData] = await Promise.all([
      request("/api/orders"),
      request("/api/vendors"),
      request("/api/products"),
      request("/api/users"),
      request("/api/requests"),
    ]);
    setOrders(orderData);
    setVendors(vendorData);
    setProducts(productData);
    setUsers(userData);
    setRequests(requestData);
  };

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    load().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    const rid = searchParams.get("request_id");
    if (!rid || !requests.length) return;
    const req = requests.find((item) => String(item.id) === String(rid));
    if (!req) return;
    setRequestId(Number(rid));
    setItems((req.items || []).map((item) => ({ sku: item.sku, quantity: item.quantity, expected: "", search: "" })));
    const vendorIds = new Set((req.items || []).map((item) => item.vendor_id ?? products.find((product) => product.sku === item.sku)?.vendor_id).filter((value) => value != null));
    setVendorId(vendorIds.size === 1 ? String([...vendorIds][0]) : "");
  }, [searchParams, requests]);

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

  async function rejectRequest(requestRow) {
    setError("");
    try {
      await request(`/api/requests/${requestRow.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "rejected",
          status_updated_by: (() => { try { const u = JSON.parse(localStorage.getItem("inventory-user") || "null"); return u?.username || u?.name || "anonymous"; } catch { return "anonymous"; } })(),
        }),
      });
      await load();
      notify("Request rejected");
    } catch (err) {
      setError(err.message);
    }
  }

  function fillRequest(requestRow) {
    navigate(`/orders?tab=create&request_id=${requestRow.id}`);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      const createdOrder = await request("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          placed_by: (() => {
      try {
        const stored = JSON.parse(localStorage.getItem("inventory-user") || "null");
        return stored?.username || stored?.name || (typeof stored === "string" ? stored : placedBy || "anonymous");
      } catch {
        return localStorage.getItem("inventory-user") || placedBy || "anonymous";
      }
    })(),
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
      if (requestId) {
        await request(`/api/requests/${requestId}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "filled",
            status_updated_by: placedBy || (() => { try { const u = JSON.parse(localStorage.getItem("inventory-user") || "null"); return u?.username || u?.name || "anonymous"; } catch { return "anonymous"; } })(),
            linked_order_id: createdOrder?.id,
          }),
        });
      }
      setPlacedBy("");
      setVendorId("");
      setTracking("");
      setItems([{ sku: "", quantity: 1, expected: "", search: "" }]);
      setRequestId(null);
      navigate("/orders?tab=create", { replace: true });
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

  const filteredRequests = requests.filter((requestRow) => {
    const query = (requestSearchQuery || "").toLowerCase();
    const fieldCandidates =
      requestSearchField === "id" ? [String(requestRow.id)] :
      requestSearchField === "opened" ? [requestRow.opened_by] :
      requestSearchField === "status" ? [requestRow.status] :
      requestSearchField === "item" ? (requestRow.items || []).map((item) => `${item.sku} ${item.name} ${item.vendor_item_id}`) :
      [String(requestRow.id), requestRow.opened_by, requestRow.status, (requestRow.items || []).map((item) => `${item.sku} ${item.name} ${item.vendor_item_id}`).join(" ")];
    const matchesSearch = !query || fieldCandidates
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);

    if (!matchesSearch) return false;

    if (requestStatusFilter === "open") return requestRow.status === "open";
    if (requestStatusFilter === "filled") return requestRow.status === "filled";
    if (requestStatusFilter === "rejected") return requestRow.status === "rejected";
    return requestRow.status !== "rejected" || query.length > 0;
  }).sort((a, b) => {
    const direction = requestSort === "desc" ? -1 : 1;
    if (requestSort === "newest" || requestSort === "oldest") {
      const byDate = new Date(a.date_placed || a.created_at).getTime() - new Date(b.date_placed || b.created_at).getTime();
      return requestSort === "newest" ? -byDate : byDate;
    }
    return (a.id - b.id) * direction;
  });

  return (
    <div className="page">
      <h2>Orders</h2>
      {error && <p className="error">{error}</p>}
      <TabbedCard
        defaultTab={searchParams.get("tab") === "create" ? 0 : searchParams.get("tab") === "requests" ? 2 : 1}
        tabs={[
          {
            label: "Create Order",
            content: (
              <form className="order-create-form" onSubmit={handleSubmit}>
        <div className="order-create-left">
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
                  Vendor Item ID
                  <input value={products.find((p) => p.sku === item.sku)?.vendor_item_id || ""} readOnly />
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
              <option value="placed">Placed By</option>
              <option value="vendor">Vendor</option>
              <option value="status">Status</option>
              <option value="item">Item</option>
            </select>
        </label>
        <label>Sort
          <select value={orderSort} onChange={(event) => setOrderSort(event.target.value)}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
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
             orderSearchField === "placed" ? [order.placed_by] :
             orderSearchField === "vendor" ? [order.vendor_name] :
             orderSearchField === "status" ? [order.fulfilled ? "fulfilled" : "unfulfilled"] :
             orderSearchField === "item" ? (order.items || []).map((item) => `${item.product_sku} ${item.product_name} ${item.product_vendor_item_id}`) :
             [String(order.id), order.tracking_number, order.placed_by, order.vendor_name, order.fulfilled ? "fulfilled" : "unfulfilled"];
          return candidates
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query);
        })
        .sort((a, b) => {
          const aDate = new Date(a.order_date || a.created_at).getTime();
          const bDate = new Date(b.order_date || b.created_at).getTime();
          if (orderSort === "newest") return bDate - aDate;
          if (orderSort === "oldest") return aDate - bDate;
          const direction = orderSort === "desc" ? -1 : 1;
          const byId = a.id - b.id;
          if (orderSearchField === "id") return byId * direction;
          if (orderSearchField === "tracking") {
            return String(a.tracking_number || "").localeCompare(String(b.tracking_number || "")) * direction;
          }
          if (byId !== 0) return byId * direction;
          return String(a.tracking_number || "").localeCompare(String(b.tracking_number || "")) * direction;
        })
        .map((order) => (
        <div key={order.id} className="order-card">
          <div className="order-card-header">
            <h3>Order #{order.id}</h3>
            <span className={`order-status ${order.fulfilled ? "fulfilled" : "open"}`}>{order.fulfilled ? "Fulfilled" : "Unfulfilled"}</span>
          </div>
          <div className="order-meta">
            <span><strong>Placed by</strong> {order.placed_by}</span>
            <span><strong>Placed</strong> {order.order_date ? new Date(order.order_date).toLocaleString() : "-"}</span>
            <span><strong>Vendor</strong> {order.vendor_name || "No vendor"}</span>
            <span><strong>Tracking</strong> {order.tracking_number || "No tracking"}</span>
            <span><strong>Total</strong> {formatMoney(order.total_cost)}</span>
          </div>
          <p className="order-hint">Checking an item adds its quantity to stock.</p>
          <table className="data-table">
            <thead><tr><th>Item</th><th>Vendor Item ID</th><th>Qty</th><th>Expected Arrival</th><th>Checked In</th></tr></thead>
            <tbody>
              {order.items.map((item) => (
                 <tr key={item.id}>
                   <td>{item.product_sku} - {item.product_name}</td>
                   <td>{item.product_vendor_item_id || "-"}</td>
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
           {
             label: "Requests",
             content: (
               <div>
       <div className="orders-filter">
         <label>Search
           <input value={requestSearchQuery} onChange={(event) => setRequestSearchQuery(event.target.value)} placeholder="Search requests" />
         </label>
         <label>Filter
           <select value={requestSearchField} onChange={(event) => setRequestSearchField(event.target.value)}>
             <option value="all">All fields</option>
             <option value="id">Request ID</option>
             <option value="opened">Opened By</option>
             <option value="status">Status</option>
             <option value="item">Item</option>
           </select>
         </label>
         <label>Sort
           <select value={requestSort} onChange={(event) => setRequestSort(event.target.value)}>
             <option value="asc">Ascending</option>
             <option value="desc">Descending</option>
             <option value="newest">Newest</option>
             <option value="oldest">Oldest</option>
           </select>
         </label>
         <label>Status
           <select value={requestStatusFilter} onChange={(event) => setRequestStatusFilter(event.target.value)}>
             <option value="all">Open + Filled</option>
             <option value="open">Open</option>
             <option value="filled">Filled</option>
             <option value="rejected">Rejected</option>
           </select>
         </label>
       </div>

       {filteredRequests.map((requestRow) => (
         <div key={requestRow.id} className="order-card">
           <div className="order-card-header">
             <h3>Request #{requestRow.id}</h3>
             <span className={`order-status ${requestRow.status === "filled" ? "fulfilled" : requestRow.status === "rejected" ? "rejected" : "open"}`}>{requestRow.status}</span>
           </div>
           <div className="order-meta">
             <span><strong>Opened by</strong> {requestRow.opened_by}</span>
             <span><strong>Placed</strong> {requestRow.date_placed ? new Date(requestRow.date_placed).toLocaleString() : "-"}</span>
             <span><strong>Updated by</strong> {requestRow.status_updated_by || "-"}</span>
             <span><strong>Filled/Rejected</strong> {requestRow.date_filled ? new Date(requestRow.date_filled).toLocaleString() : "-"}</span>
             <span><strong>Total Qty</strong> {requestRow.total_requested_quantity}</span>
             {requestRow.linked_order_id ? <span><strong>Order</strong> #{requestRow.linked_order_id}</span> : null}
           </div>
           <table className="data-table">
             <thead><tr><th>Item</th><th>Vendor Item ID</th><th>Qty</th><th>Status</th></tr></thead>
             <tbody>
               {(requestRow.items || []).map((item, index) => (
                 <tr key={`${requestRow.id}-${index}`}>
                   <td>{item.sku} - {item.name}</td>
                   <td>{item.vendor_item_id || "-"}</td>
                   <td>{item.quantity}</td>
                   <td>{item.item_status || "-"}</td>
                 </tr>
               ))}
             </tbody>
           </table>
           {requestRow.status === "open" && (
             <div className="edit-modal-actions" style={{ marginTop: "0.5rem" }}>
               <button type="button" onClick={() => fillRequest(requestRow)}>Fill</button>
               <button type="button" onClick={() => rejectRequest(requestRow)}>Reject</button>
             </div>
           )}
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
                  <span>{product.sku} - {product.name}{product.vendor_item_id ? ` (Vendor Item ID: ${product.vendor_item_id})` : ""}</span>
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
