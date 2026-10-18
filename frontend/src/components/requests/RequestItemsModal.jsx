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
      if (item) next[id] = Math.max(1, Number(item.order_quantity || item.shortage || 1));
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
        // Match the logistics table's order quantity when pre-filling a request.
        next[itemId] = Math.max(1, Number(item?.order_quantity || item?.shortage || 1));
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
    <div className="request-modal-overlay" onClick={onClose}>
      <div className="request-modal-card" onClick={(event) => event.stopPropagation()}>
        <h3 className="request-modal-title">Request Items</h3>
        {error && <p className="request-modal-error">{error}</p>}

        <div className="request-modal-filters">
          <label>
            <span>Search</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items" />
          </label>
          <label>
            <span>Vendor</span>
            <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
              <option value="">All vendors</option>
              {vendors.map((vendor) => <option key={vendor} value={vendor}>{vendor}</option>)}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="out_of_stock">out_of_stock</option>
              <option value="critical">critical</option>
              <option value="low">low</option>
              <option value="healthy">healthy</option>
              <option value="not_tracked">not_tracked</option>
            </select>
          </label>
          <label>
            <span>Sort</span>
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

        <div className="request-modal-columns">
          <div className="request-modal-column">
            <strong className="request-modal-column-title">Available items</strong>
            <div className="request-modal-list">
              {filtered.filter((item) => !selected[item.product_id]).map((item) => (
                <button
                  key={item.product_id}
                  type="button"
                  onClick={() => toggleItem(item.product_id)}
                  className="request-modal-item"
                >
                  <span className="request-modal-item-name">{item.sku} - {item.name}</span>
                  <span className="request-modal-item-meta">
                    {item.vendor_name || "No vendor"}
                    <span className={`request-modal-status request-modal-status-${item.status}`}>{item.status}</span>
                    <span className="request-modal-qty">Qty needed: {Number(item.order_quantity ?? item.shortage ?? 0).toFixed(0)}</span>
                    {item.vendor_item_id}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="request-modal-column">
            <strong className="request-modal-column-title">Selected items</strong>
            <div className="request-modal-list">
              {Object.keys(selected).length === 0 && <span className="request-modal-empty">No items selected</span>}
              {items.filter((item) => selected[item.product_id]).map((item) => (
                <div key={item.product_id} className="request-modal-selected-card">
                  <div className="request-modal-selected-header">
                    <span>{item.sku} - {item.name}</span>
                    <button type="button" onClick={() => toggleItem(item.product_id)} className="request-modal-remove">Remove</button>
                  </div>
                  <input type="number" min="1" value={selected[item.product_id]} onChange={(e) => updateQuantity(item.product_id, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <label className="request-modal-separate">
          <input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} />
          Create separate request per selected item
        </label>

        <div className="request-modal-actions">
          <button type="button" onClick={handleSubmit} disabled={submitting}>{submitting ? "Requesting..." : "Submit Request"}</button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
