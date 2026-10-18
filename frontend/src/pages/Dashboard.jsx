import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import RequestItemsModal from "../components/requests/RequestItemsModal";
import { request } from "../api/client";
import TabbedCard from "../components/ui/TabbedCard";
import GlobalSearchBar from "../components/search/GlobalSearchBar";
import { formatMoney } from "../utils/currency";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { notify } from "../utils/notify";

function relativeProfitValue(cost, price) {
  const numericCost = Number(cost);
  const numericPrice = Number(price);
  return numericCost > 0 && Number.isFinite(numericPrice) ? numericPrice / numericCost : null;
}

export default function DashboardPage() {
  const [counts, setCounts] = useState({ products: 0, openOrders: 0, closedOrders30: 0, requestedOpen30: 0, backorderItems: 0, shortageItems: 0, salesNet: 0, salesGross: 0, orderCostMonth: 0 });
  const [orders, setOrders] = useState([]);
  const [salesMonth, setSalesMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  // Build the month selector options from actual order dates so the dropdown
  // always reflects the date ranges present in the active database, even if the
  // dedicated sales-months endpoint is empty or unavailable.
  const salesMonths = useMemo(() => {
    const months = new Set();
    months.add(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
    for (const order of orders) {
      const date = order.order_date || order.created_at;
      if (!date) continue;
      const d = new Date(date);
      if (Number.isFinite(d.getTime())) {
        months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
    }
    return Array.from(months).sort().reverse();
  }, [orders]);
  const [snapshotGraphOpen, setSnapshotGraphOpen] = useState(false);
  const [snapshotGraphLoading, setSnapshotGraphLoading] = useState(false);
  const [snapshotGraphData, setSnapshotGraphData] = useState(null);
  const [snapshotGraphImage, setSnapshotGraphImage] = useState("");
  // logistics may be empty when the active database has no products; that is
  // expected for a fresh normal DB and is not a rendering bug.
  const [logistics, setLogistics] = useState({ total_items: 0, total_on_hand: 0, total_inventory_cost: 0, items: [] });
  const [compact, setCompact] = useState(window.innerWidth < 1000);
  const [activeUser, setActiveUser] = useState("");
  async function openSnapshotGraph() {
    setSnapshotGraphOpen(true);
    setSnapshotGraphLoading(true);
    setSnapshotGraphImage("");
    try {
      const data = await request(`/api/stock/sales/daily?month=${encodeURIComponent(salesMonth)}`);
      setSnapshotGraphData(data);
    } catch (err) {
      notify(err.message || "Unable to load graph");
      setSnapshotGraphOpen(false);
    } finally {
      setSnapshotGraphLoading(false);
    }
  }

  function formatSalesMonth(value) {
    const parts = String(value || "").split("-");
    if (parts.length !== 2) return value;
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    return date.toLocaleString("default", { month: "short", year: "numeric" });
  }

  function renderSnapshotGraph() {
    const days = snapshotGraphData?.days || [];
    if (!days.length) return <p>No graph data.</p>;
    const width = 680;
    const height = 300;
    const pad = 44;
    const maxVal = Math.max(1, ...days.flatMap((day) => [Number(day.sales || 0), Number(day.order_cost || 0)]));
    const x = (index) => pad + (index / (days.length - 1 || 1)) * (width - pad * 2);
    const y = (value) => height - pad - (Number(value || 0) / maxVal) * (height - pad * 2);
    const salesPoints = days.map((day, index) => `${x(index)},${y(day.sales)}`).join(" ");
    const costPoints = days.map((day, index) => `${x(index)},${y(day.order_cost)}`).join(" ");
    return (
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ background: "var(--panel)", borderRadius: "var(--radius)" }}>
        {[0, maxVal / 2, maxVal].map((value) => (
          <g key={value}>
            <line x1={pad} y1={y(value)} x2={width - pad} y2={y(value)} stroke="var(--border)" strokeDasharray="4 4" />
            <text x={pad - 8} y={y(value) + 4} fill="var(--muted)" fontSize="10" textAnchor="end">{formatMoney(value)}</text>
          </g>
        ))}
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="var(--border)" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="var(--border)" />
        {days.map((day, index) => (index === 0 || index === days.length - 1 || index % 7 === 0) ? (
          <text key={day.date} x={x(index)} y={height - 8} fill="var(--muted)" fontSize="9" textAnchor="middle">{String(day.date).slice(5)}</text>
        ) : null)}
        <polyline points={salesPoints} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={costPoints} fill="none" stroke="var(--danger)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const navigate = useNavigate();
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestInitialIds, setRequestInitialIds] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const isMounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      // These endpoints read from either the normal or demo database depending on
      // the X-Demo-DB header, which request() derives from localStorage. If the
      // normal database is empty, all of these arrays/objects will be empty and
      // the dashboard will show zero values until data is added or demo mode is on.
      // Fetch each resource independently so one failing endpoint cannot blank the
      // entire dashboard, and surface any errors in the browser console.
      const [products, orderData, logisticsData, monthList, users, requestData] = await Promise.all([
        request("/api/products").catch((err) => { console.error("Dashboard products failed:", err); return []; }),
        request("/api/orders").catch((err) => { console.error("Dashboard orders failed:", err); return []; }),
        request("/api/logistics").catch((err) => { console.error("Dashboard logistics failed:", err); return { items: [] }; }),
        request("/api/stock/sales/months").catch((err) => { console.error("Dashboard sales months failed:", err); return []; }),
      // NOTE: salesMonths is derived from order dates via useMemo so the month
      // selector always reflects the active database's date ranges.
        request("/api/users").catch((err) => { console.error("Dashboard users failed:", err); return []; }),
        request("/api/requests").catch((err) => { console.error("Dashboard requests failed:", err); return []; }),
      ]);
      if (!isMounted.current) return;
    // Guard against non-array responses so a single malformed endpoint does not
    // leave the whole dashboard blank.
    const safeProducts = Array.isArray(products) ? products : [];
    const safeOrderData = Array.isArray(orderData) ? orderData : [];
    const safeLogisticsData = logisticsData && typeof logisticsData === "object" ? logisticsData : { items: [] };
    const safeUsers = Array.isArray(users) ? users : [];
    const safeRequestData = Array.isArray(requestData) ? requestData : [];
    const nowForCounts = new Date();
    const thirtyDaysAgo = nowForCounts.getTime() - 30 * 24 * 60 * 60 * 1000;
    setCounts({
      products: safeProducts.length,
      openOrders: safeOrderData.filter((order) => {
        if (order.fulfilled) return false;
        const date = new Date(order.order_date || order.created_at);
        const time = date.getTime();
        return time >= thirtyDaysAgo && time <= nowForCounts.getTime();
      }).length,
      closedOrders30: safeOrderData.filter((order) => {
        if (!order.fulfilled) return false;
        const date = new Date(order.order_date || order.created_at);
        const time = date.getTime();
        return time >= thirtyDaysAgo && time <= nowForCounts.getTime();
      }).length,
      backorderItems: safeLogisticsData.items.filter((item) => item.on_hand === 0 && item.required_backstock > 0).length,
      shortageItems: safeLogisticsData.items.filter((item) => item.shortage > 0 && item.on_hand > 0).length,
      requestedOpen30: safeRequestData.filter((requestRow) => requestRow.status === "open" && new Date(requestRow.date_placed || requestRow.created_at).getTime() >= thirtyDaysAgo).length,
      salesNet: 0,
      salesGross: 0,
    });
    setOrders(safeOrderData);
    setLogistics(safeLogisticsData);
    let selectedName = "";
    try {
      const storedUser = JSON.parse(localStorage.getItem("inventory-user") || "null");
      selectedName = storedUser?.name || storedUser?.username || (typeof storedUser === "string" ? storedUser : "");
    } catch {
      selectedName = localStorage.getItem("inventory-user") || "";
    }
    const currentUser = safeUsers.find((user) => user.name === selectedName || user.username === selectedName);
    setActiveUser(currentUser?.name || currentUser?.username || selectedName || "there");
    const now = new Date();
    const orderCostMonth = safeOrderData.reduce((sum, order) => {
      const date = new Date(order.order_date || order.created_at);
      if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) return sum + (order.total_cost || 0);
      return sum;
    }, 0);
    setCounts((current) => ({ ...current, orderCostMonth }));
      setLoading(false);
    } catch (err) {
      if (isMounted.current) {
        setLoadError(err.message || "Failed to load dashboard data");
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    load().catch((err) => {
      console.error("Dashboard load failed:", err);
    });
    return () => {
      isMounted.current = false;
    };
  }, [load]);

  // BUG FIX NOTE: The dashboard component mounts behind the login overlay, so
  // its first data fetch can run before the user has authenticated and before
  // the "Demonstration Mode?" checkbox has been applied. That first fetch may
  // hit the empty normal database and leave the counters/tables at zero even
  // after a successful demo-mode login. We refetch on the login event, on tab
  // visibility, and on demo-mode storage changes. We also reset isMounted on
  // every mount so React StrictMode's double-run in development does not bail
  // out of the second (real) fetch. If counters/tables ever go blank again,
  // verify these listeners are intact and that isMounted is reset on mount.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        load().catch(() => {});
      }
    }
    function handleStorage(event) {
      if (event.key === "inventory-demo-db") {
        load().catch(() => {});
      }
    }
    function handleLogin() {
      load().catch(() => {});
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("inventory-user-logged-in", handleLogin);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("inventory-user-logged-in", handleLogin);
    };
  }, [load]);

  useEffect(() => {
    function handleResize() {
      setCompact(window.innerWidth < 1000);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!salesMonth) return;
    const parts = salesMonth.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const orderCost = orders.reduce((sum, order) => {
      const date = new Date(order.order_date || order.created_at);
      if (date.getFullYear() === year && date.getMonth() === month) return sum + (order.total_cost || 0);
      return sum;
    }, 0);
    setCounts((current) => ({ ...current, orderCostMonth: orderCost }));
    request(`/api/stock/sales/month?month=${encodeURIComponent(salesMonth)}`)
      .then((data) => {
        setCounts((current) => ({
          ...current,
          salesNet: data.net_sales || 0,
          salesGross: data.gross_sales || 0,
        }));
      })
      .catch(() => {});
  }, [salesMonth, orders]);


  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const sortedOrders = [...orders]
    .filter((order) => {
      const time = new Date(order.order_date || order.created_at).getTime();
      return time >= thirtyDaysAgo && time <= Date.now();
    })
    .sort((a, b) => {
      if (a.fulfilled !== b.fulfilled) return a.fulfilled ? 1 : -1;
      return new Date(b.order_date || b.created_at).getTime() - new Date(a.order_date || a.created_at).getTime();
    });

  const orderIndex = (
    <div className="dashboard-panel">
      <h3>Order Index</h3>
      <table className="data-table">
        <thead><tr><th>ID</th><th>Placed By</th><th>Vendor</th><th>Status</th><th>Total</th></tr></thead>
        <tbody>
          {sortedOrders.map((order) => (
            <tr key={order.id}>
              <td>{order.id}</td>
              <td>{order.placed_by}</td>
              <td>{order.vendor_name || "-"}</td>
              <td>{order.fulfilled ? "Fulfilled" : "Unfulfilled"}</td>
              <td>{formatMoney(order.total_cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
        <button type="button" onClick={() => navigate("/orders?tab=orders")}>See more</button>
      </div>
    </div>
  );

  function openRequest(item) {
    setRequestInitialIds(item ? [item.product_id] : []);
    setRequestModalOpen(true);
  }

  const logisticsPanel = (
    <div className="dashboard-panel">
      <h3>Logistics</h3>
      <div className="stat-grid">
        <div className="stat-card"><span>Items</span><strong>{logistics.total_items}</strong></div>
        <div className="stat-card"><span>Total On Hand</span><strong>{logistics.total_on_hand}</strong></div>
        <div className="stat-card"><span>Inventory Cost</span><strong>{formatMoney(logistics.total_inventory_cost)}</strong></div>
      </div>
      <table className="data-table">
        <thead><tr><th>SKU</th><th>Name</th><th>On Hand</th><th>Required</th><th>Shortage</th><th>Status</th><th>Urgency</th><th>RPV</th><th>Order Qty</th><th>Actions</th></tr></thead>
        <tbody>
          {logistics.items
            .filter((item) => item.status === "critical" || item.status === "out_of_stock")
            .slice(0, 40)
            .map((item) => (
            <tr key={item.product_id}>
              <td>{item.sku}</td>
              <td>{item.name}</td>
              <td>{item.on_hand}</td>
              <td>{item.required_backstock}</td>
              <td>{item.shortage}</td>
              <td>{item.status}</td>
              <td><span style={{ color: `hsl(${120 - ((Number(item.urgency) - 1) / 19) * 120}, 85%, 45%)`, fontWeight: 700 }}>{Number(item.urgency).toFixed(2)}</span></td>
              <td>{relativeProfitValue(item.cost, item.price)?.toFixed(2) ?? "-"}</td>
              <td>{item.order_quantity}</td>
              <td><button type="button" onClick={() => openRequest(item)}>Request</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
        <button type="button" onClick={() => navigate("/products?tab=logistics")}>See more</button>
      </div>
    </div>
  );

  return (
    <div className="page dashboard-page">
      <h1 className="dashboard-greeting">Hello, {activeUser}</h1>
      <h2>Dashboard</h2>
      {loading && <p className="dashboard-loading">Loading dashboard data...</p>}
      {loadError && <p className="error">{loadError}</p>}
      <div className="stat-grid">
        <div className="stat-card"><span>Products</span><div className="sales-values"><div><span className="sales-label">Products</span><strong>{counts.products}</strong></div><div><span className="sales-label">Backorder</span><strong>{counts.backorderItems}</strong></div><div><span className="sales-label">Shortage</span><strong>{counts.shortageItems}</strong></div></div></div>
        <div className="stat-card"><span>Orders</span><div className="sales-values"><div><span className="sales-label">Open</span><strong>{counts.openOrders}</strong></div><div><span className="sales-label">Closed</span><strong>{counts.closedOrders30}</strong></div><div><span className="sales-label">Requested</span><strong>{counts.requestedOpen30}</strong></div></div></div>
        <div className="stat-card sales-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <span>Monthly Snapshot</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <select value={salesMonth} onChange={(event) => setSalesMonth(event.target.value)} aria-label="Snapshot month">
                {salesMonths.map((month) => (
                  <option key={month} value={month}>{formatSalesMonth(month)}</option>
                ))}
              </select>
              <button type="button" onClick={openSnapshotGraph}>Graph</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 120px" }}>
              <div className="sales-label">Order Cost</div>
              <strong>{formatMoney(counts.orderCostMonth)}</strong>
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <div className="sales-values"><div><span className="sales-label">Net</span><strong>{formatMoney(counts.salesNet)}</strong></div><div><span className="sales-label">Gross</span><strong>{formatMoney(counts.salesGross)}</strong></div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-search">
        <GlobalSearchBar />
      </div>

      {compact ? (
        <TabbedCard
          tabs={[
            { label: "Orders", content: orderIndex },
            { label: "Logistics", content: logisticsPanel },
          ]}
        />
      ) : (
        <div className="dashboard-grid">
          {orderIndex}
          {logisticsPanel}
        </div>
      )}
      <RequestItemsModal
        isOpen={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        logisticsItems={logistics.items}
        initialProductIds={requestInitialIds}
        currentUser={(() => { try { const u = JSON.parse(localStorage.getItem("inventory-user") || "null"); return u?.username || u?.name || "anonymous"; } catch { return "anonymous"; } })()}
        onCreated={() => load().catch(() => {})}
      />
      {snapshotGraphOpen && (
        <div className="edit-modal-overlay" onClick={() => setSnapshotGraphOpen(false)}>
          <div className="edit-modal-card" onClick={(event) => event.stopPropagation()} style={{ maxWidth: "92vw", width: "760px", maxHeight: "90vh", overflow: "auto" }}>
            <h3>Sales vs Order Cost: {formatSalesMonth(salesMonth)}</h3>
            {snapshotGraphLoading && <p>Loading...</p>}
            {!snapshotGraphLoading && snapshotGraphData?.days?.length && (
              <div style={{ width: "100%", height: "320px", marginTop: "12px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={snapshotGraphData.days}>
                    <XAxis dataKey="date" tickFormatter={(value) => String(value).slice(5)} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="sales" name="Sales" stroke="#3b82f6" />
                    <Line type="monotone" dataKey="order_cost" name="Order cost" stroke="#dc2626" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div style={{ display: "flex", gap: "12px", marginTop: "8px", fontSize: "0.8rem" }}>
              <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "var(--accent)" }} /> Sales</span>
              <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "var(--danger)" }} /> Order cost</span>
            </div>
            <div className="edit-modal-actions" style={{ marginTop: "12px" }}>
              <button type="button" onClick={() => setSnapshotGraphOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
