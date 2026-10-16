import { useEffect, useMemo, useState } from "react";
import { request } from "../../api/client";

export default function RequestItemsModal({ isOpen, onClose, logisticsItems, initialProductIds = [], currentUser = "anonymous", onCreated }) {
  const items = Array.isArray(logisticsItems) ? logisticsItems : (logisticsItems?.items || []);
  const vendors = useMemo(() => [...new Set(items.map((item) => item.vendor_name).filter(Boolean))], [items]);

  const [selected, setSelected] = useState({});
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [separate, setSeparate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    const next = {};
    (initialProductIds || []).forEach((id) => {
      const item = items.find((entry) => entry.product_id === id);
      if (item) next[id] = Math.max(1, Number(item.shortage || item.order_quantity || 1));
    });
    setSelected(next);
  }, [isOpen, initialProductIds, items]);

  const filtered = useMemo(() => {
    const query = (search || "").toLowerCase();
    let result = items.filter((item) => {
      if (vendorFilter && item.vendor_name !== vendorFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (!query) return true;
      return [item.sku, item.name, item.vendor_name, item.status, item.vendor_item_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
    result = [...result].sort((a, b) => {
      if (sortBy === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      if (sortBy === "sku") return String(a.sku || "").localeCompare(String(b.sku || ""));
      if (sortBy === "vendor") return String(a.vendor_name || "").localeCompare(String(b.vendor_name || ""));
      if (sortBy === "status") return String(a.status || "").localeCompare(String(b.status || ""));
      if (sortBy === "quantity") return Number(b.shortage || 0) - Number(a.shortage || 0);
      if (sortBy === "urgency") return Number(b.urgency || 0) - Number(a.urgency || 0);
      return 0;
    });
    return result;
  }, [items, search, vendorFilter, statusFilter, sortBy]);

  function toggleItem(itemId) {
    setSelected((current) => {
      const next = { ...current };
      if (next[itemId]) {
        delete next[itemId];
      } else {
        const item = items.find((entry) => entry.product_id === itemId);
        next[itemId] = Math.max(1, Number(item?.shortage || item?.order_quantity || 1));
      }
      return next;
    });
  }

  function updateQuantity(itemId, value) {
    setSelected((current) => ({ ...current, [itemId]: Math.max(1, Number(value) || 1) }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const selectedItems = Object.entries(selected).map(([id, quantity]) => ({
      product_id: Number(id),
      quantity: Number(quantity) || 1,
    }));
    if (!selectedItems.length) {
      setError("Select at least one item.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await request("/api/requests", {
        method: "POST",
        body: JSON.stringify({
          opened_by: currentUser || "anonymous",
          items: selectedItems,
          separate_per_item: separate,
        }),
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="edit-modal-overlay" onClick={onClose}>
      <div className="edit-modal-card" onClick={(event) => event.stopPropagation()} style={{ maxWidth: "96vw", width: "720px", height: "80vh", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden", padding: "20px", borderRadius: "18px", boxShadow: "0 24px 80px rgba(0,0,0,0.24)" }}>
        <h3 style={{ marginBottom: "16px", fontSize: "1.25rem" }}>Request Items</h3>
        {error && <p className="error">{error}</p>}

        <div className="form-row" style={{ marginBottom: "0.75rem" }}>
          <label>Search<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items" /></label>
          <label>Vendor
            <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
              <option value="">All vendors</option>
              {vendors.map((vendor) => <option key={vendor} value={vendor}>{vendor}</option>)}
            </select>
          </label>
          <label>Status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="out_of_stock">out_of_stock</option>
              <option value="critical">critical</option>
              <option value="low">low</option>
              <option value="healthy">healthy</option>
              <option value="not_tracked">not_tracked</option>
            </select>
          </label>
          <label>Sort
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name">Name</option>
              <option value="sku">SKU</option>
              <option value="vendor">Vendor</option>
              <option value="status">Status</option>
              <option value="quantity">Shortage</option>
              <option value="urgency">Urgency</option>
            </select>
          </label>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", marginBottom: "12px" }}>
          <strong>Available items</strong>
          <div className="order-items-scroll" style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, minHeight: 0, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px", marginTop: "8px" }}>
            {filtered.map((item) => (
              <label key={item.product_id} style={{ display: "flex", alignItems: "flex-start", gap: "8px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
                <input type="checkbox" style={{ width: "14px", height: "14px", marginTop: "2px" }} checked={Boolean(selected[item.product_id])} onChange={() => toggleItem(item.product_id)} />
                <span style={{ flex: 1, fontSize: "0.85rem" }}>{item.sku} - {item.name}<br />{item.vendor_name || "No vendor"} - {item.status}{item.vendor_item_id ? ` - ${item.vendor_item_id}` : ""}</span>
                {selected[item.product_id] ? (
                  <input style={{ width: "64px" }} type="number" min="1" value={selected[item.product_id]} onChange={(e) => updateQuantity(item.product_id, e.target.value)} />
                ) : null}
              </label>
            ))}
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <input type="checkbox" style={{ width: "14px", height: "14px" }} checked={separate} onChange={(e) => setSeparate(e.target.checked)} />
          Create separate request per selected item
        </label>

        <div className="edit-modal-actions" style={{ marginTop: "16px" }}>
          <button type="button" onClick={handleSubmit} disabled={submitting}>{submitting ? "Requesting..." : "Submit Request"}</button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
