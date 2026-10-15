import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { request } from "../api/client";
import TabbedCard from "../components/ui/TabbedCard";
import GlobalSearchBar from "../components/search/GlobalSearchBar";
import { formatMoney } from "../utils/currency";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { notify } from "../utils/notify";

export default function DashboardPage() {
  const [counts, setCounts] = useState({ products: 0, openOrders: 0, closedOrders30: 0, backorderItems: 0, shortageItems: 0, salesNet: 0, salesGross: 0, orderCostMonth: 0 });
  const [orders, setOrders] = useState([]);
  const [salesMonth, setSalesMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [salesMonths, setSalesMonths] = useState([]);
  const [snapshotGraphOpen, setSnapshotGraphOpen] = useState(false);
  const [snapshotGraphLoading, setSnapshotGraphLoading] = useState(false);
  const [snapshotGraphData, setSnapshotGraphData] = useState(null);
  const [snapshotGraphImage, setSnapshotGraphImage] = useState("");
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

  useEffect(() => {
    let active = true;
    async function load() {
      const [products, orderData, logisticsData, monthList, users] = await Promise.all([
        request("/api/products"),
        request("/api/orders"),
        request("/api/logistics"),
        request("/api/stock/sales/months"),
        request("/api/users"),
      ]);
      if (active) {
        const nowForCounts = new Date();
        const thirtyDaysAgo = nowForCounts.getTime() - 30 * 24 * 60 * 60 * 1000;
        setSalesMonths(Array.isArray(monthList) ? monthList : []);
        setCounts({
          products: products.length,
          openOrders: orderData.filter((order) => {
            if (order.fulfilled) return false;
            const date = new Date(order.order_date || order.created_at);
            const time = date.getTime();
            return time >= thirtyDaysAgo && time <= nowForCounts.getTime();
          }).length,
          closedOrders30: orderData.filter((order) => {
            if (!order.fulfilled) return false;
            const date = new Date(order.order_date || order.created_at);
            const time = date.getTime();
            return time >= thirtyDaysAgo && time <= nowForCounts.getTime();
          }).length,
          backorderItems: logisticsData.items.filter((item) => item.on_hand === 0 && item.required_backstock > 0).length,
          shortageItems: logisticsData.items.filter((item) => item.shortage > 0 && item.on_hand > 0).length,
          salesNet: 0,
          salesGross: 0,
        });
        setOrders(orderData);
        setLogistics(logisticsData);
        let selectedName = "";
        try {
          const storedUser = JSON.parse(localStorage.getItem("inventory-user") || "null");
          selectedName = storedUser?.name || storedUser?.username || (typeof storedUser === "string" ? storedUser : "");
        } catch {
          selectedName = localStorage.getItem("inventory-user") || "";
        }
        const currentUser = users.find((user) => user.name === selectedName || user.username === selectedName);
        setActiveUser(currentUser?.name || currentUser?.username || selectedName || "there");
        const now = new Date();
        const orderCostMonth = orderData.reduce((sum, order) => {
          const date = new Date(order.order_date || order.created_at);
          if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) return sum + (order.total_cost || 0);
          return sum;
        }, 0);
        setCounts((current) => ({ ...current, orderCostMonth }));
      }
    }
    load().catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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

  const logisticsPanel = (
    <div className="dashboard-panel">
      <h3>Logistics</h3>
      <div className="stat-grid">
        <div className="stat-card"><span>Items</span><strong>{logistics.total_items}</strong></div>
        <div className="stat-card"><span>Total On Hand</span><strong>{logistics.total_on_hand}</strong></div>
        <div className="stat-card"><span>Inventory Cost</span><strong>{formatMoney(logistics.total_inventory_cost)}</strong></div>
      </div>
      <table className="data-table">
        <thead><tr><th>SKU</th><th>Name</th><th>On Hand</th><th>Required</th><th>Shortage</th><th>Status</th><th>Urgency</th><th>Order Qty</th></tr></thead>
        <tbody>
          {logistics.items.map((item) => (
            <tr key={item.product_id}>
              <td>{item.sku}</td>
              <td>{item.name}</td>
              <td>{item.on_hand}</td>
              <td>{item.required_backstock}</td>
              <td>{item.shortage}</td>
              <td>{item.status}</td>
              <td><span style={{ color: `hsl(${120 - ((Number(item.urgency) - 1) / 19) * 120}, 85%, 45%)`, fontWeight: 700 }}>{Number(item.urgency).toFixed(1).padStart(4, "0")}</span></td>
              <td>{item.order_quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
        <button type="button" onClick={() => navigate("/stock")}>See more</button>
      </div>
    </div>
  );

  return (
    <div className="page dashboard-page">
      <h1 className="dashboard-greeting">Hello, {activeUser}</h1>
      <h2>Dashboard</h2>
      <div className="stat-grid">
        <div className="stat-card"><span>Products</span><div className="sales-values"><div><span className="sales-label">Products</span><strong>{counts.products}</strong></div><div><span className="sales-label">Backorder</span><strong>{counts.backorderItems}</strong></div><div><span className="sales-label">Shortage</span><strong>{counts.shortageItems}</strong></div></div></div>
        <div className="stat-card"><span>Orders</span><div className="sales-values"><div><span className="sales-label">Open</span><strong>{counts.openOrders}</strong></div><div><span className="sales-label">Closed</span><strong>{counts.closedOrders30}</strong></div></div></div>
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
