import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function GlobalSearchBar() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const navigate = useNavigate();

  function handleSubmit(event) {
    event.preventDefault();
    navigate(`/search?q=${encodeURIComponent(query.trim())}&filter=${encodeURIComponent(filter)}`);
  }

  return (
    <form className="global-search" onSubmit={handleSubmit}>
      <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Search table">
        <option value="all">All Sources</option>
        <option value="products">Products</option>
        <option value="vendors">Vendors</option>
        <option value="orders">Orders</option>
        <option value="logistics">Logistics</option>
      </select>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search the database..."
        aria-label="Search query"
      />
      <button type="submit">Search</button>
    </form>
  );
}
