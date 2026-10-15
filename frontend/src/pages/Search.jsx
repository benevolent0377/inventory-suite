import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { request } from "../api/client";

import { formatMoney } from "../utils/currency";
export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q") || "";
  const [input, setInput] = useState(query);
  const [filter, setFilter] = useState(searchParams.get("filter") || "all");
  useEffect(() => {
    setFilter(searchParams.get("filter") || "all");
  }, [searchParams]);

  const [results, setResults] = useState({ query: "", products: [], vendors: [], orders: [], logistics: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    setInput(query);
    if (!query.trim()) {
      setResults({ query: "", products: [], vendors: [], orders: [], logistics: [] });
      return;
    }
    setLoading(true);
    setError("");
    request(`/api/search?q=${encodeURIComponent(query)}`)
      .then((data) => setResults(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query]);

  function handleSubmit(event) {
    event.preventDefault();
    navigate(`/search?q=${encodeURIComponent(input.trim())}&filter=${encodeURIComponent(filter)}`);
  }

  return (
    <div className="page">
      <h2>Search</h2>
      <button type="button" onClick={() => navigate(-1)}>Back</button>
      <form className="global-search" onSubmit={handleSubmit}>
        <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Search table">
          <option value="all">All Sources</option>
          <option value="products">Products</option>
          <option value="vendors">Vendors</option>
          <option value="orders">Orders</option>
          <option value="logistics">Logistics</option>
        </select>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Search the database..." />
        <button type="submit">Search</button>
      </form>
      {error && <p className="error">{error}</p>}
      {loading && <p>Loading results...</p>}

      {(filter === "all" || filter === "products") && results.products.length > 0 && (
        <section className="search-section">
          <h3>Products</h3>
          <table className="data-table">
            <thead><tr><th>ID</th><th>SKU</th><th>Name</th><th>Category</th><th>Vendor</th><th>Price</th><th>Cost</th></tr></thead>
            <tbody>
              {results.products.map((item) => (
                <tr key={item.id}><td>{item.id}</td><td>{item.sku}</td><td>{item.name}</td><td>{item.category}</td><td>{item.vendor || "-"}</td><td>{formatMoney(item.price)}</td><td>{formatMoney(item.cost)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(filter === "all" || filter === "vendors") && results.vendors.length > 0 && (
        <section className="search-section">
          <h3>Vendors</h3>
          <table className="data-table">
            <thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th></tr></thead>
            <tbody>
              {results.vendors.map((item) => (
                <tr key={item.id}><td>{item.id}</td><td>{item.name}</td><td>{item.contact_name}</td><td>{item.email}</td><td>{item.phone}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(filter === "all" || filter === "orders") && results.orders.length > 0 && (
        <section className="search-section">
          <h3>Orders</h3>
          <table className="data-table">
            <thead><tr><th>ID</th><th>Placed By</th><th>Vendor</th><th>Tracking</th><th>Total</th><th>Status</th><th>Items</th></tr></thead>
            <tbody>
              {results.orders.map((item) => (
                <tr key={item.id}><td>{item.id}</td><td>{item.placed_by}</td><td>{item.vendor || "-"}</td><td>{item.tracking_number || "-"}</td><td>{formatMoney(item.total_cost)}</td><td>{item.fulfilled ? "Fulfilled" : "Unfulfilled"}</td><td>{item.item_count}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(filter === "all" || filter === "logistics") && (results.logistics || []).length > 0 && (
        <section className="search-section">
          <h3>Logistics</h3>
          <table className="data-table">
            <thead><tr><th>SKU</th><th>Name</th><th>On Hand</th><th>Required</th><th>Shortage</th><th>Status</th><th>Urgency</th><th>Order Qty</th></tr></thead>
            <tbody>
              {(results.logistics || []).map((item) => (
                <tr key={item.product_id}><td>{item.sku}</td><td>{item.name}</td><td>{item.on_hand}</td><td>{item.required_backstock}</td><td>{item.shortage}</td><td>{item.status}</td><td><span style={{ color: `hsl(${120 - ((Number(item.urgency) - 1) / 19) * 120}, 85%, 45%)`, fontWeight: 700 }}>{Number(item.urgency).toFixed(1).padStart(4, "0")}</span></td><td>{item.order_quantity}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {query && !loading && results.products.length + results.vendors.length + results.orders.length + (results.logistics?.length || 0) === 0 && (
        <p>No results found.</p>
      )}
    </div>
  );
}
