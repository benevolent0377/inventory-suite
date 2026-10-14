import { useEffect, useState } from "react";
import { request } from "../api/client";
import TabbedCard from "../components/ui/TabbedCard";
import GlobalSearchBar from "../components/search/GlobalSearchBar";
import { formatMoney } from "../utils/currency";

export default function DashboardPage() {
  const [counts, setCounts] = useState({ products: 0, openOrders: 0, backorderItems: 0, shortageItems: 0, salesNet: 0, salesGross: 0, orderCostMonth: 0 });
  const [orders, setOrders] = useState([]);
  const [logistics, setLogistics] = useState({ total_items: 0, total_on_hand: 0, total_inventory_cost: 0, items: [] });
  const [compact, setCompact] = useState(window.innerWidth < 1000);
  const [activeUser, setActiveUser] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const [products, orderData, logisticsData, salesData, users] = await Promise.all([
        request("/api/products"),
        request("/api/orders"),
        request("/api/logistics"),
        request("/api/stock/sales/month"),
        request("/api/users"),
      ]);
      if (active) {
        setCounts({
          products: products.length,
          openOrders: orderData.filter((order) => !order.fulfilled).length,
          backorderItems: logisticsData.items.filter((item) => item.on_hand === 0 && item.required_backstock > 0).length,
          shortageItems: logisticsData.items.filter((item) => item.shortage > 0 && item.on_hand > 0).length,
          salesNet: salesData.net_sales || 0,
          salesGross: salesData.gross_sales || 0,
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

  const sortedOrders = [...orders].sort((a, b) => {
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
        <thead><tr><th>SKU</th><th>Name</th><th>On Hand</th><th>Required</th><th>Shortage</th><th>Urgency</th><th>Order Qty</th></tr></thead>
        <tbody>
          {logistics.items.map((item) => (
            <tr key={item.product_id}>
              <td>{item.sku}</td>
              <td>{item.name}</td>
              <td>{item.on_hand}</td>
              <td>{item.required_backstock}</td>
              <td>{item.shortage}</td>
              <td>{item.urgency}</td>
              <td>{item.order_quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="page">
      <h1 className="dashboard-greeting">Hello, {activeUser}</h1>
      <h2>Dashboard</h2>
      <div className="stat-grid">
        <div className="stat-card"><span>Products</span><strong>{counts.products}</strong></div>
        <div className="stat-card"><span>Open Orders</span><strong>{counts.openOrders}</strong></div>
        <div className="stat-card"><div className="sales-values"><div><span className="sales-label">Backorder</span><strong>{counts.backorderItems}</strong></div><div><span className="sales-label">Shortage</span><strong>{counts.shortageItems}</strong></div></div></div>
        <div className="stat-card sales-card"><span>Sales This Month</span><div className="sales-values"><div><span className="sales-label">Net</span><strong>{formatMoney(counts.salesNet)}</strong></div><div><span className="sales-label">Gross</span><strong>{formatMoney(counts.salesGross)}</strong></div></div></div>
        <div className="stat-card"><span>Order Cost This Month</span><strong>{formatMoney(counts.orderCostMonth)}</strong></div>
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
