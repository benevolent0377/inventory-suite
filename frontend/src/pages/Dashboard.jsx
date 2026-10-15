import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { request } from "../api/client";
import TabbedCard from "../components/ui/TabbedCard";
import GlobalSearchBar from "../components/search/GlobalSearchBar";
import { formatMoney } from "../utils/currency";

export default function DashboardPage() {
  const [counts, setCounts] = useState({ products: 0, openOrders: 0, closedOrdersMonth: 0, backorderItems: 0, shortageItems: 0, salesNet: 0, salesGross: 0, orderCostMonth: 0 });
  const [orders, setOrders] = useState([]);
  const [salesMonth, setSalesMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [salesMonths, setSalesMonths] = useState([]);
  const [logistics, setLogistics] = useState({ total_items: 0, total_on_hand: 0, total_inventory_cost: 0, items: [] });
  const [compact, setCompact] = useState(window.innerWidth < 1000);
  const [activeUser, setActiveUser] = useState("");
  function formatSalesMonth(value) {
    const parts = String(value || "").split("-");
    if (parts.length !== 2) return value;
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    return date.toLocaleString("default", { month: "short", year: "numeric" });
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
        setSalesMonths(Array.isArray(monthList) ? monthList : []);
        setCounts({
          products: products.length,
          openOrders: orderData.filter((order) => !order.fulfilled).length,
          closedOrdersMonth: orderData.filter((order) => {
            if (!order.fulfilled) return false;
            const date = new Date(order.order_date || order.created_at);
            return date.getMonth() === nowForCounts.getMonth() && date.getFullYear() === nowForCounts.getFullYear();
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
        <div className="stat-card"><span>Products</span><strong>{counts.products}</strong></div>
        <div className="stat-card"><span>Orders</span><div className="sales-values"><div><span className="sales-label">Open</span><strong>{counts.openOrders}</strong></div><div><span className="sales-label">Closed</span><strong>{counts.closedOrdersMonth}</strong></div></div></div>
        <div className="stat-card"><div className="sales-values"><div><span className="sales-label">Backorder</span><strong>{counts.backorderItems}</strong></div><div><span className="sales-label">Shortage</span><strong>{counts.shortageItems}</strong></div></div></div>
        <div className="stat-card sales-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <span>Monthly Snapshot</span>
            <select value={salesMonth} onChange={(event) => setSalesMonth(event.target.value)} aria-label="Snapshot month">
              {salesMonths.map((month) => (
                <option key={month} value={month}>{formatSalesMonth(month)}</option>
              ))}
            </select>
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
    </div>
  );
}
