import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { request } from "../api/client";
import { notify } from "../utils/notify";

export default function StockPage() {
  const [searchParams] = useSearchParams();
  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [productSku, setProductSku] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("sale");
  const [purpose, setPurpose] = useState("sale");
  const [error, setError] = useState("");

  const load = async () => {
    const [stockData, productData] = await Promise.all([request("/api/stock"), request("/api/products")]);
    setStock(stockData);
    setProducts(productData);
  };

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function handleSale(event) {
    event.preventDefault();
    setError("");
    try {
      await request("/api/stock/remove", {
        method: "POST",
        body: JSON.stringify({
          product_sku: (productSku || "").trim(),
          quantity: Number(quantity),
          reason: reason || purpose,
          liquidated: purpose === "liquidated",
        }),
      });
      await load();
      notify(purpose === "liquidated" ? "Stock liquidated" : "Stock removed");
    } catch (err) {
      setError(err.message);
    }
  }

  const query = (searchParams.get("q") || "").toLowerCase();
  const visibleStock = query ? stock.filter((row) => [row.product_sku, row.product_name].filter(Boolean).join(" ").toLowerCase().includes(query)) : stock;

  return (
    <div className="page">
      <h2>Stock Balances</h2>
      {error && <p className="error">{error}</p>}
      <form className="form-row" onSubmit={handleSale}>
        <label>
          Item
          <select value={productSku} onChange={(e) => setProductSku(e.target.value)} required>
            <option value="">Select item</option>
            {products.map((product) => <option key={product.id} value={product.sku}>{product.sku} - {product.name}</option>)}
          </select>
        </label>
        <label>
          Qty
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </label>
        <label>
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label>
          Purpose
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            <option value="sale">Sale</option>
            <option value="liquidated">Liquidated</option>
          </select>
        </label>
        <button type="submit">Remove Stock</button>
      </form>
      <table className="data-table">
        <thead><tr><th>SKU</th><th>Product</th><th>On Hand</th><th>Reserved</th></tr></thead>
        <tbody>
          {visibleStock.map((row) => (
            <tr key={row.product_id}>
              <td>{row.product_sku}</td>
              <td>{row.product_name}</td>
              <td>{row.on_hand}</td>
              <td>{row.reserved}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
