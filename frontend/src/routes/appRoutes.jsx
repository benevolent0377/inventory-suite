import { Package, Layers, House, Store, ClipboardList, Terminal as TerminalIcon } from "lucide-react";

import DashboardPage from "../pages/Dashboard";
import ProductsPage from "../pages/Products";
import StockPage from "../pages/Stock";
import VendorsPage from "../pages/Vendors";
import OrdersPage from "../pages/Orders";
import CLIPage from "../pages/CLI";

export const appRoutes = [
  { path: "/", title: "Dashboard", icon: House, element: <DashboardPage /> },
  { path: "/products", title: "Products", icon: Package, element: <ProductsPage /> },
  { path: "/stock", title: "Stock", icon: Layers, element: <StockPage /> },
  { path: "/vendors", title: "Vendors", icon: Store, element: <VendorsPage /> },
  { path: "/orders", title: "Orders", icon: ClipboardList, element: <OrdersPage /> },
  { path: "/cli", title: "CLI", icon: TerminalIcon, element: <CLIPage /> },
];
