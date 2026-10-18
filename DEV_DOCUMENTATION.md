# Inventory Suite Developer Cookbook

This guide is a working reference for developers who need to run, understand, extend, or troubleshoot Inventory Suite. It documents the application architecture, common development recipes, data and API contracts, and the functions implemented in the frontend and backend.

## Table of contents

- [At a glance](#at-a-glance)
- [Set up and run locally](#set-up-and-run-locally)
- [Where to make a change](#where-to-make-a-change)
- [Application architecture](#application-architecture)
- [Data model and persistence](#data-model-and-persistence)
- [API reference](#api-reference)
- [Frontend reference](#frontend-reference)
- [Backend function reference](#backend-function-reference)
- [Frontend function reference](#frontend-function-reference)
- [Development recipes](#development-recipes)
- [Validation and troubleshooting](#validation-and-troubleshooting)

## At a glance

| Concern | Implementation | Main location |
| --- | --- | --- |
| Browser UI | React 19, React Router, Vite | `frontend/src/` |
| API | FastAPI | `backend/app/main.py`, `backend/app/routers/` |
| Persistence | SQLite through SQLAlchemy | `backend/app/db.py`, `backend/app/models.py` |
| Request/response validation | Pydantic v2 | `backend/app/schemas.py` and router-local models |
| Login and authorization | Bearer session tokens, scrypt passkey hashes | `backend/app/auth.py`, `backend/app/routers/auth.py` |
| Styling | CSS variables and theme stylesheets | `frontend/src/themes/` |
| Browser API access | Shared fetch wrapper with short GET cache | `frontend/src/api/client.js` |

The root [README](README.md) is the short install overview; the user workflows are in `docs/USER_GUIDE.md` and troubleshooting is in `docs/SUPPORT.md`.

## Set up and run locally

### Backend environment

From the repository root:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

The backend database defaults to `backend/data/inventory.db`. Set `INVENTORY_DB_PATH` before starting the server to use a different SQLite file. The first server start creates the schema, performs lightweight additive schema updates for older databases, bootstraps the administrator, and prints a temporary admin passkey. The local TLS certificate is generated under the database directory's `certs/` folder.

### Frontend development server

```bash
cd frontend
npm install
npm run dev
```

Vite listens on port `5173` and proxies `/api` and `/health` to `https://127.0.0.1:8000`. Run the backend at the same time (the `npm run app` script runs both processes). The proxy accepts the local backend certificate for development.

### Production build

```bash
cd frontend
npm run build
```

The backend serves the compiled `frontend/dist/` SPA when that directory exists. `frontend/public/` files are copied to `dist/` by Vite; this is how the bundled license and guides are linked locally.

### Useful scripts

| Command (run in `frontend/`) | Purpose |
| --- | --- |
| `npm run dev` | Start Vite in development mode. |
| `npm run app` | Start frontend and backend together using `concurrently`. |
| `npm run build` | Produce the production frontend in `dist/`. |
| `npm run preview` | Serve a local preview of the production bundle. |
| `npm run lint` | Run Oxlint on the frontend. |
| `npm run backend` | Generate/use the local TLS certificate, then run Uvicorn with reload. |

The backend CLI can also be invoked from `backend/` as `python -m app.cli <command>`.

## Where to make a change

| Change | Start here | Follow through to |
| --- | --- | --- |
| Add a frontend page | `frontend/src/pages/` | Register it in `frontend/src/routes/appRoutes.jsx`; add API calls and CSS as needed. |
| Add an API endpoint | `backend/app/routers/<area>.py` | Add or update Pydantic schemas, register the router in `backend/app/routers/__init__.py`, and call it via `request()` in the frontend. |
| Change a stored field | `backend/app/models.py` | Update Pydantic schemas, `ensure_schema()` compatibility handling if needed, forms, tables, and CLI serialization. |
| Change order/stock behavior | `backend/app/routers/orders.py`, `stock.py`, `movements.py` | Keep ledger movements and on-hand balances consistent; update dashboard/product views. |
| Change logistics/urgency | `backend/app/utils.py`, `backend/app/routers/logistics.py` | Keep calculations consistent in requests and search endpoints, CLI output, and UI display. |
| Add a theme or appearance preference | `frontend/src/themes/`, `frontend/src/theme/`, `frontend/src/pages/Settings.jsx` | Register the value in theme controls and ensure theme variables have sensible defaults. |
| Add an admin-only view | `frontend/src/routes/appRoutes.jsx` | Wrap the route in `AdminPasskeyGate`; enforce actual API authorization in backend dependencies too. |

## Application architecture

### Browser startup and routing

`frontend/src/main.jsx` mounts React in `StrictMode`, wraps it in `ThemeProvider`, and renders `App`. `App` installs the router and `AppFrame`; the frame owns the persistent sidebar, footer, global overlays, settings/search routes, and the mapped routes from `appRoutes.jsx`.

Routes are UI navigation only. Protect sensitive operations in the API as well; hiding a route or displaying a passkey gate is not an authorization boundary.

### API requests

Frontend modules should use `request(path, options)` from `frontend/src/api/client.js`, rather than calling `fetch` directly for API operations. The wrapper:

1. Reads the selected demo-database flag and bearer token from `localStorage`.
2. Adds `Authorization` and `X-Demo-DB` headers when applicable.
3. Caches successful GET responses in `sessionStorage` for 30 seconds, with a separate key for demo and normal data.
4. Clears API cache after writes and clears login state on HTTP 401.
5. Converts API errors into thrown `Error` objects using FastAPI's `detail` field where available.

When adding a new mutation, use the existing pattern: `await request("/api/...", { method: "POST", body: JSON.stringify(payload) })`, then refresh the relevant view and surface errors in the page.

### Authentication and authorization

Registration and login are public API operations. Login creates a random opaque bearer token, but only its SHA-256 hash is persisted in `user_sessions`; the raw token is stored by the browser. Passkeys are stored as salted scrypt hashes. Tokens expire after 12 hours. `require_user` and `require_admin` are FastAPI dependencies for routes that require an authenticated user or admin.

The middleware in `backend/app/main.py` selects the database for each request, rejects unauthenticated API writes (except register/login), and records authenticated writes in the activity log. Router dependencies remain the clearest way to express endpoint-specific read/admin access.

### Demo database routing

The frontend sets `X-Demo-DB: true` when `inventory-demo-db` is enabled in local storage. Backend middleware places the choice in a `ContextVar`; `get_engine()` then selects `demo/inventory.db` when present, otherwise the normal database. Always reset the context token in `finally` blocks when setting the database context manually.

### UI messages and modal interactions

`confirm()`, `promptPasskey()`, and `notify()` communicate with mounted React components through browser custom events. Components listen for those event names and resolve the pending promises. Use these helpers instead of introducing ad-hoc `window.confirm()` for normal application workflows; the low-level table editor currently uses native confirmation for row deletion.

## Data model and persistence

SQLAlchemy models in `backend/app/models.py` map to SQLite tables:

| Model/table | Purpose | Important fields/relationships |
| --- | --- | --- |
| `Product` / `products` | Catalog master data | Unique SKU, vendor, price/cost, backstock target, lead-time overhead and vendor item ID. |
| `Vendor` / `vendors` | Suppliers | Unique vendor name and contact details. |
| `Stock` / `stock` | Current balances | One row per product, `on_hand` and `reserved`. |
| `Movement` / `movements` | Stock activity | Product, movement type, quantity, reference and timestamp. Sales/liquidations are recorded as negative quantities by the stock-removal endpoint. |
| `Order` / `orders` | Purchase order header | Placed by, vendor, tracking, total, status and fulfillment flag. |
| `OrderItem` / `order_items` | Purchase order lines | Product, ordered quantity, expected arrival, unit cost and check-in state. |
| `Request` / `requests` | Replenishment request | Request status and timestamps, link to an order, aggregate quantity and JSON item snapshots. |
| `User` / `users` | User profile and credentials | Name/username, theme, scrypt passkey hash and admin flag. |
| `UserSession` / `user_sessions` | Bearer-token session | User, token hash, expiry and client host. |
| `ActivityLog` / `activity_logs` | Audit trail | Actor, action, entity, result, client host and timestamp. |

Pydantic API DTOs are in `backend/app/schemas.py`; auth-specific request/response models and maintenance request models live beside their routers. The schema bootstrap in `db.ensure_schema()` creates new tables and adds missing columns, then backfills selected legacy values. For structural migrations that require data transforms, use an explicit migration rather than relying on the additive compatibility helper.

SQLite engines use `NullPool`, WAL mode, a 30-second busy timeout, and `synchronous=NORMAL`. `get_db()` yields and closes one SQLAlchemy session per request. Keep multi-step state changes in one transaction and commit only after dependent rows are consistent.

## API reference

API routers are mounted under `/api` except the health checks. Payload/response details are defined by the Pydantic models in `backend/app/schemas.py` or by router-local models.

| Method and path | Router handler | Behavior |
| --- | --- | --- |
| `GET /health/system` | `health.system_health` | Process health probe. |
| `GET /health/db` | `health.db_health` | Execute a database ping. |
| `GET /api/products` | `products.list_products` | List catalog products. |
| `GET /api/products/{id}` | `products.get_product` | Read one product. |
| `POST /api/products` | `products.create_product` | Add a product; generates a vendor item ID if missing. |
| `PUT /api/products/{id}` | `products.update_product` | Replace editable product fields and track previous price. |
| `DELETE /api/products/{id}` | `products.delete_product` | Delete a product. |
| `GET /api/products/{id}/stats?date_range=30` | `products.product_stats` | Daily/bucketed ordered and sold quantities. `date_range` supports 7, 30, 90, or `all`. |
| `GET /api/vendors` | `vendors.list_vendors` | List vendors. |
| `POST /api/vendors` | `vendors.create_vendor` | Add a unique vendor. |
| `PUT /api/vendors/{id}` | `vendors.update_vendor` | Replace vendor details. |
| `DELETE /api/vendors/{id}` | `vendors.delete_vendor` | Delete a vendor. |
| `GET /api/stock?product_id=...` | `stock.list_stock` | Read balances, optionally filtered by product. |
| `POST /api/stock/remove` | `stock.remove_stock` | Record sale/liquidation and decrement inventory. |
| `GET /api/stock/sales/months` | `stock.sales_months` | List months containing sales, including current month. |
| `GET /api/stock/sales/daily?month=YYYY-MM` | `stock.daily_sales` | Daily sales revenue and order cost. |
| `GET /api/stock/sales/month?month=YYYY-MM` | `stock.monthly_sales` | Monthly gross, net, and cost of goods sold. |
| `GET /api/movements?product_id=...` | `movements.list_movements` | List latest stock movements. |
| `POST /api/movements` | `movements.create_movement` | Apply receipt, issue, or adjustment and record movement. |
| `GET /api/orders` | `orders.list_orders` | List open orders first, then fulfilled orders. |
| `GET /api/orders/{id}` | `orders.get_order` | Read an order and expanded item/product data. |
| `POST /api/orders` | `orders.create_order` | Create order header and lines; calculate total from quantity × unit cost. |
| `PATCH /api/orders/{id}/items/{item_id}/checkin` | `orders.checkin_item` | Toggle a line's check-in and add/remove its quantity from stock. |
| `PATCH /api/orders/{id}/fulfill` | `orders.fulfill_order` | Manually set order fulfillment status. |
| `GET /api/logistics` | `logistics.logistics` | Compute stock, shortage, status, urgency, order quantity and totals. |
| `GET /api/requests` | `requests.list_requests` | List replenishment requests newest first. |
| `POST /api/requests` | `requests.create_requests` | Create one request per vendor or separate requests per item. |
| `PATCH /api/requests/{id}` | `requests.update_request` | Update request status, updater and linked order. |
| `GET /api/search?q=...` | `search.search` | Search products, vendors, orders, movements and logistics. |
| `GET /api/activity?...` | `activity.list_activity` | Admin-filtered, paginated activity log. |
| `GET /api/activity/export?...` | `activity.export_activity` | Admin CSV-like text export of matching log rows. |
| `GET /api/tables` | `table_editor.list_tables` | Admin-only table/column metadata. |
| `GET /api/tables/{table}?limit=&offset=` | `table_editor.read_table` | Admin-only paginated table data. |
| `PATCH /api/tables/{table}/{row_id}` | `table_editor.update_row` | Admin-only update of non-primary-key columns. |
| `DELETE /api/tables/{table}/{row_id}` | `table_editor.delete_row` | Admin-only row deletion. |
| `POST /api/auth/register` | `auth.register` | Public account creation and session issue. |
| `POST /api/auth/login` | `auth.login` | Public passkey login and session issue. |
| `GET /api/auth/me` | `auth.me` | Return current authenticated user. |
| `POST /api/auth/change-passkey` | `auth.change_passkey` | Change current user's passkey. |
| `POST /api/auth/users/{id}/passkey` | `auth.reset_passkey` | Admin resets another user's passkey. |
| `POST /api/auth/logout` | `auth.logout` | Revoke the bearer session. |
| `PATCH /api/auth/users/{id}/admin` | `auth.set_admin` | Admin changes a user's admin flag. |
| `POST /api/auth/verify-passkey` | `auth.verify_admin_passkey` | Verify the authenticated administrator's passkey. |
| `GET /api/users` | `users.list_users` | List user profiles. |
| `POST /api/users` | `users.create_user` | Admin creates a profile. |
| `PUT /api/users/{id}` | `users.update_user` | User updates own profile; admins may update another profile. |
| `DELETE /api/users/{id}` | `users.delete_user` | Admin deletes a user. |
| `GET /api/help` | `help.help_text` | Return generated CLI usage text. |
| `POST /api/maintenance/tables/clear` | `maintenance.clear_tables` | Admin clears selected tables after a database backup. |
| `POST /api/maintenance/shutdown` | `maintenance.shutdown` | Verify admin passkey, revoke sessions and terminate service. |

`backend/app/main.py` has a catch-all SPA route after API registration. Keep new API routers under `/api` so SPA fallback does not intercept them.

## Frontend reference

### Main modules

| Location | Responsibility |
| --- | --- |
| `frontend/src/App.jsx` | Persistent app frame, route mounting, footer actions, global dialogs and login reminders. |
| `frontend/src/routes/appRoutes.jsx` | Navigation route metadata and admin-gated route elements. |
| `frontend/src/pages/` | Page-level data loading, user workflows and page-specific state. |
| `frontend/src/components/` | Reusable forms, dialogs, status indicators, navigation and search. |
| `frontend/src/api/client.js` | Authenticated API transport and short-lived read cache. |
| `frontend/src/theme/` | Theme context, stored preferences, theme persistence. |
| `frontend/src/themes/` | Global layout and theme styling. Theme variants are in `themes/wf/`. |
| `frontend/public/` | Static assets copied into the Vite production output. |

### State and event conventions

- Keep page-local server data in the page component that owns the workflow; reload after successful mutations.
- Use `request()` for HTTP and `notify()`/`confirm()`/`promptPasskey()` for shared user feedback.
- User identity and bearer token use `inventory-user` and `inventory-token` in `localStorage`.
- Appearance and database selection are stored separately (`inventory-theme`, `inventory-text-size`, `inventory-demo-db`, and related preferences).
- When browser custom events are used, unregister handlers in effect cleanup.
- Reuse `TabbedCard`, `GlobalSearchBar`, and modal/dialog components before adding another equivalent component.

## Backend function reference

Function entries below describe each named function and route handler under `backend/app/`. Small anonymous lambdas used as SQLAlchemy filters or argparse callbacks are described with their owning function.

### `backend/app/db.py`

- `_create_engine(path)` — Create a SQLite SQLAlchemy engine for a file path and install connection pragmas for concurrent access.
- `_enable_sqlite_concurrency(dbapi_connection, connection_record)` — Configure a newly opened SQLite connection with WAL, busy timeout and normal synchronous mode.
- `get_engine()` — Select the normal or context-local demo database and return its cached engine.
- `SessionLocal()` — Create a fresh SQLAlchemy session bound to the currently selected engine.
- `set_demo_db(enabled)` — Set the current context's demo-database selection and return the ContextVar reset token.
- `reset_demo_db(token)` — Restore the previous demo-database context using its token.
- `demo_db_enabled()` — Return whether the current context is routed to the demo database.
- `ensure_schema(engine=None)` — Create missing model tables, add missing columns to existing tables, and backfill selected legacy nullable fields.
- `get_db()` — FastAPI dependency that yields one session and always closes it.

### `backend/app/models.py`

This module contains SQLAlchemy declarations rather than custom functions. `Product`, `Stock`, `User`, `Vendor`, `Movement`, `Order`, `OrderItem`, `UserSession`, `ActivityLog`, and `Request` map the application entities listed in [Data model and persistence](#data-model-and-persistence). When adding a field, update its API schema and legacy database handling as well as its model.

### `backend/app/schemas.py`

This module contains Pydantic request/response DTOs and no custom functions. `ProductCreate`/`ProductRead`, `VendorCreate`/`VendorRead`, `UserCreate`/`UserRead`, `MovementCreate`/`MovementRead`, `StockRead`/`StockAdjustment`, `OrderItemCreate`/`OrderItemRead`, `OrderCreate`/`OrderRead`, `LogisticsItem`/`LogisticsRead`, and request DTOs define validation and serialization contracts. `from_attributes` is enabled on read models that serialize SQLAlchemy objects.

### `backend/app/auth.py`

- `generate_passkey(length=14)` — Generate a random passkey meeting the supported length and character-class requirements.
- `hash_passkey(passkey)` — Salt and scrypt a passkey; encode algorithm parameters, salt and digest for later verification.
- `verify_passkey(passkey, passkey_hash)` — Parse a stored hash, derive a candidate digest and compare in constant time.
- `_b64_decode(value)` — Decode URL-safe base64 fields, adding omitted padding first.
- `get_user_by_token(db, raw_token)` — Hash the supplied bearer token, find its session, remove expired sessions, and return the associated user when valid.
- `issue_session(db, user, client_host="")` — Persist a hashed token and expiry while returning the raw token to the caller.
- `revoke_session(db, raw_token)` — Delete the database session associated with the given raw token.
- `_bearer_token(request)` — Extract a token only when the Authorization header has the Bearer scheme.
- `get_current_user(request, db)` — Resolve the request's bearer token to a user (or `None`).
- `require_user(user)` — FastAPI dependency that rejects absent users with HTTP 401.
- `require_admin(user)` — FastAPI dependency that rejects non-admin users with HTTP 403.

### `backend/app/audit.py`, `certs.py`, and `utils.py`

- `audit.log_activity(db, action, ...)` — Add an `ActivityLog` row with actor, entity, outcome and client metadata; caller controls transaction commit.
- `certs._local_ips()` — Discover localhost and local IPv4 addresses for TLS Subject Alternative Names.
- `certs.ensure_certificate()` — Reuse an existing local certificate/key or generate a self-signed certificate and report its fingerprint.
- `utils.compute_urgency(status, shortage, required, order_overhead_days=0)` — Combine status priority with shortage and weighted overhead into the bounded floating-point urgency score.

### `backend/app/main.py`

- `_bootstrap_admin(demo=False, passkey=None)` — Ensure an admin user exists for the selected database, set its hashed passkey and return the key used for bootstrap.
- `require_auth_and_audit(request, call_next)` — Middleware that selects the request database, guards API writes, audits authenticated writes, and resets database context on completion.
- `SPAStaticFiles.get_response(path, scope)` — StaticFiles subclass override that would serve the SPA for missing assets; the current app uses the explicit `spa_fallback` route instead.
- `spa_fallback(full_path)` — Return a requested built asset when present, otherwise return `frontend/dist/index.html` for client-side routes.

### Router registration and health

`backend/app/routers/__init__.py`:

- `register_routers(app)` — Mount each API router under `/api`; health endpoints are mounted outside that prefix.

`backend/app/routers/health.py`:

- `system_health()` — Report that the FastAPI process is responsive.
- `db_health(db)` — Execute `SELECT 1` and report database health.

`backend/app/routers/help.py`:

- `help_text()` — Build the CLI parser, render its help to memory, and return the text as JSON.

### Product and logistics routes

`backend/app/routers/products.py`:

- `_random_vendor_item_id(vendor_id, db)` — Create a vendor-patterned item identifier, retry collisions, and use a vendor-derived prefix for unknown vendor IDs.
- `list_products(db)` — Return products in ID order.
- `get_product(product_id, db)` — Return a product or raise 404.
- `create_product(payload, db)` — Reject duplicate SKU, generate missing vendor item ID, persist and return the new product.
- `update_product(product_id, payload, db)` — Replace product fields, preserve the previous price when the price changes, and generate a missing vendor item ID.
- `delete_product(product_id, db)` — Delete a product or raise 404.
- `product_stats(product_id, date_range, db)` — Aggregate order quantities and sale/liquidation movements by day; bucket long ranges for chart rendering.
- `to_date_key(value)` — Normalize datetime/string date values to ISO calendar-day keys, returning `None` for invalid/missing values.

`backend/app/routers/logistics.py`:

- `logistics(db)` — Aggregate stock per product, classify stock status, compute shortages/urgency/order quantity and return sorted logistics totals.

`backend/app/routers/search.py`:

- `product_to_dict(product, db)` — Serialize the fields used by global search and attach the vendor display name.
- `search(q, db)` — Search across product, vendor, order, movement and logistics records and return grouped result arrays.

### Stock, movement and order routes

`backend/app/routers/stock.py`:

- `list_stock(product_id, db)` — Join stock rows to products and return balances, optionally for one product.
- `sales_months(db)` — Return descending month keys present in sale movements plus the current month.
- `daily_sales(month, db)` — Create a calendar-day series for the selected month and aggregate sale revenue and order cost per day.
- `monthly_sales(month, db)` — Calculate gross sales, cost of goods sold and net sales for one month.
- `remove_stock(payload, db)` — Validate product and balance, decrement stock, and record either a sale or liquidation movement.

`backend/app/routers/movements.py`:

- `get_or_create_stock(db, product_id)` — Return a product's balance row, creating a zero-balance row when absent.
- `list_movements(product_id, db)` — List movements newest first with optional product filtering.
- `create_movement(payload, db)` — Validate and apply a receipt, issue or adjustment, then persist its movement record.

`backend/app/routers/orders.py`:

- `build_order_read(order, db)` — Construct an order DTO enriched with vendor and product identifiers/names.
- `list_orders(db)` — Return unfulfilled orders first and sort each fulfillment group newest first.
- `get_order(order_id, db)` — Retrieve one order and expand its lines or raise 404.
- `create_order(payload, db)` — Validate vendor/products/date, compute line and header costs, persist header and lines.
- `checkin_item(order_id, item_id, checked_in, db)` — Toggle a line's receipt; apply only the check-in state delta to inventory and update order fulfillment status.
- `fulfill_order(order_id, fulfilled, db)` — Set the header fulfillment/status fields directly and return the expanded order.

### Requests and user data

`backend/app/routers/requests.py`:

- `_product_logistics(product, db)` — Recalculate a product's status, urgency and priority details for request snapshots.
- `_build_item(item_in, db)` — Validate the product ID and create the denormalized request-line snapshot.
- `_build_request_read(request, db)` — Rehydrate the JSON line snapshots into `RequestItemRead` DTOs and the parent `RequestRead` DTO.
- `list_requests(db)` — Sort requests newest first and serialize each request.
- `create_requests(payload, db)` — Validate input, group lines by vendor (unless separate-per-item is requested), save one or more request rows and serialize them.
- `update_request(request_id, payload, db)` — Update allowed status/actor/order fields and set or clear completion time consistently.

`backend/app/routers/users.py`:

- `list_users(db)` — List users in stable ID order.
- `create_user(payload, db, admin)` — Admin-only profile creation with duplicate-name validation.
- `update_user(user_id, payload, db, current)` — Allow self-update or admin update of a user profile.
- `delete_user(user_id, db, admin)` — Admin-only user deletion.

`backend/app/routers/vendors.py`:

- `list_vendors(db)` — List vendors in stable ID order.
- `create_vendor(payload, db)` — Reject duplicate vendor names and persist a new vendor.
- `update_vendor(vendor_id, payload, db)` — Replace vendor details or raise 404.
- `delete_vendor(vendor_id, db)` — Delete a vendor or raise 404.

### Authentication, activity and maintenance routes

`backend/app/routers/auth.py`:

- `register(payload, db)` — Validate a new account, store a passkey hash, audit registration and issue a session.
- `login(payload, db)` — Verify username/passkey, audit success/failure and return a new session token.
- `me(user)` — Return the authenticated user's public profile or 401.
- `change_passkey(payload, db, user)` — Validate current/new passkeys, update the hash/timestamp and audit the change.
- `reset_passkey(user_id, payload, db, admin)` — Admin reset of a user's passkey with audit entry.
- `logout(request, db)` — Extract and revoke the Bearer token if present.
- `set_admin(user_id, payload, db, admin)` — Change a user's admin flag and audit who made the change.
- `verify_admin_passkey(payload, db, admin)` — Verify the current admin's passkey for sensitive actions.

Router-local Pydantic classes (`LoginRequest`, `RegisterRequest`, `TokenResponse`, `PasskeyChangeRequest`, `PasskeyResetRequest`, `PasskeyVerifyRequest`, `UserReadAuth`, and `AdminFlagRequest`) define these route payloads and responses.

`backend/app/routers/activity.py`:

- `_parse_dt(value)` — Parse an optional ISO datetime filter, returning `None` for missing or invalid input.
- `list_activity(...)` — Admin-only filtered/paginated log retrieval with serialized timestamps.
- `export_activity(...)` — Admin-only export of all filtered rows as quoted CSV-like text.

`backend/app/routers/table_editor.py`:

- `_validate_table(table_name)` — Allow only SQLAlchemy-mapped table names and return their metadata.
- `_json_value(value)` — Convert date-like and byte values into JSON-friendly representations.
- `_columns(table)` — Describe a table's columns, types, primary-key flags and nullability.
- `_primary_key(table)` — Return a single-column primary key; reject composite keys unsupported by the editor.
- `_cast_pk(table, row_id)` — Convert a URL row ID to the primary key's Python type or return HTTP 400.
- `list_tables(admin)` — Admin-only list of exposed tables and their column definitions.
- `read_table(table_name, limit, offset, db, admin)` — Admin-only paginated table query with validated table name and serialization.
- `update_row(table_name, row_id, payload, db, admin)` — Update allowed non-key columns using bound values and a validated metadata table.
- `delete_row(table_name, row_id, db, admin)` — Delete one row by typed primary key or return 404.

`backend/app/routers/maintenance.py`:

- `clear_tables(payload, admin)` — Normalize allowed table aliases, back up the selected database, clear rows and reset SQLite sequences.
- `shutdown(payload, user)` — Verify an administrator passkey, revoke all sessions and schedule process termination.
- `_shutdown()` — Send SIGTERM to the current process after the HTTP response can return.

### CLI functions in `backend/app/cli.py`

- `session()` — Open a SQLAlchemy session using the active normal database engine.
- `print_json(value)` — Print indented JSON, converting non-JSON-native values to strings.
- `resolve_vendor(db, value)` — Resolve a vendor by ID or exact name; stop the command if it does not exist.
- `resolve_product(db, value)` — Resolve a product by ID or SKU; stop the command if it does not exist.
- `parse_list(value)` — Split a comma-separated string into trimmed non-empty values.
- `cmd_items_list(args)` — Print product summaries in text or JSON form, including summed on-hand quantities in text mode.
- `cmd_items_get(args)` — Print one product's catalog and stock details as JSON.
- `cmd_items_create(args)` — Validate SKU uniqueness and create a product from parsed CLI flags.
- `cmd_items_update(args)` — Apply only CLI options explicitly provided and update the previous-price field when needed.
- `cmd_vendors_list(args)` — Print vendor ID, name and contact summary.
- `cmd_vendors_create(args)` — Create and print a vendor from CLI arguments.
- `cmd_stock_adjust(args)` — Apply a signed balance adjustment and record an adjustment movement.
- `cmd_orders_list(args)` — Print order headers and their individual lines.
- `cmd_orders_create(args)` — Parse comma-delimited SKU/quantity/date specifications and persist an order plus lines.
- `schemasplaceholder(sku, quantity, expected)` — Return the supplied order-line tuple unchanged; currently a legacy placeholder helper.
- `cmd_orders_checkin(args)` — Update one line's `checked_in` flag by order and item IDs.
- `cmd_orders_fulfill(args)` — Set an order's fulfilled flag and matching status.
- `cmd_logistics(args)` — Print stock shortages, status, urgency and cost in a terminal table.
- `cmd_help(args)` — Print CLI root help or a short topic-specific help hint.
- `build_parser()` — Define subcommands, positional/options arguments, and dispatch functions for the CLI.
- `cmd_movement_create(args)` — Apply and persist a receipt, issue or adjustment through the CLI.
- `main()` — Parse command-line arguments and dispatch to the configured command handler.
- `cmd_clear(args)` — Require explicit `--yes`, normalize table aliases, and clear selected rows/reset IDs.

`build_parser()` also installs two small lambdas: `movements list` prints that listing is not implemented in the CLI, and `movements create` dispatches to `cmd_movement_create`.

## Frontend function reference

This catalog covers every named function/component in `frontend/src/`. Anonymous JSX event handlers and collection callbacks are described with their owning component or handler rather than given artificial names.

### App shell, routes and API utilities

`frontend/src/App.jsx`:

- `App()` — Mount the router and register unload behavior that clears session identity on normal tab close, while preserving it on reload.
- `handleBeforeUnload()` — Remove stored user and token for non-reload navigation/unload.
- `AppFrame()` — Render the persistent frame, page routes, footer actions, global authentication/dialog components and help popup.
- `handleLogin()` — Show the post-login reminder sequence in response to the `inventory-user-logged-in` event.

`frontend/src/routes/appRoutes.jsx` — `appRoutes` is configuration rather than a function; it maps page paths to labels/icons/elements and marks admin-only routes.

`frontend/src/api/client.js`:

- `cacheKey(path, demoDb)` — Build a request cache key scoped to the active database mode.
- `clearApiCache()` — Remove all `inventory-api-cache:` session-storage entries; storage failures are intentionally ignored.
- `request(path, options={})` — Execute an API request with auth/demo headers, GET caching, cache invalidation, JSON parsing and normalized errors.

`frontend/src/theme/ThemeContext.jsx`:

- `readActiveName()` — Read the current user's display name/username from the persisted identity, tolerating legacy plain-string storage.
- `ThemeProvider({children})` — Provide theme and text-size state, sync preferences with local storage/user profile, and apply browser-level size styles.
- `applyUserTheme()` — Load the current user's profile and adopt its saved theme when available.
- `setTheme(nextTheme)` — Apply and persist a theme immediately, then attempt to save it to the current user's profile.

`frontend/src/theme/useTheme.js`:

- `useTheme()` — Read `ThemeContext` and fail early if called outside its provider.

`frontend/src/utils/confirm.js`:

- `confirm(message)` — Return a promise resolved by the shared confirmation dialog's custom-event response.
- `resolveConfirm(value)` — Resolve and clear the pending confirmation promise.

`frontend/src/utils/promptPasskey.js`:

- `promptPasskey(message)` — Return a promise resolved by the shared passkey dialog.
- `resolvePromptPasskey(value)` — Resolve and clear the active prompt; `null` represents cancellation.

`frontend/src/utils/notify.js`:

- `notify(message)` — Dispatch a shared notice event for the mounted notifier.

`frontend/src/utils/currency.js`:

- `formatMoney(value)` — Convert a numeric-like input to USD with exactly two fraction digits.

`frontend/src/utils/sound.js`:

- `getContext()` — Lazily create and cache browser AudioContext, returning `null` when unsupported.
- `playTone(frequency, duration, type, gainValue, delay)` — Schedule a synthesized oscillator tone with an attack and exponential fade.
- `playPopup()` — Play the two-note popup sound.
- `playDing()` — Play the two-note confirmation/ding sound.

### Reusable UI components

`frontend/src/components/requests/RequestItemsModal.jsx`:

- `RequestItemsModal(props)` — Filter/sort logistics items, manage selected quantities, submit request groups, and render available/selected item lists.
- `toggleItem(itemId)` — Add an item using logistics order quantity as its initial quantity, or remove it from the selection.
- `updateQuantity(itemId, value)` — Update a selected quantity while enforcing a minimum of one.
- `handleSubmit(event)` — Validate selection, POST request items and grouping preference, notify the parent on success, and expose API errors in the modal.

`frontend/src/components/user/UserGate.jsx`:

- `UserGate()` — Render login/register overlay when there is no stored bearer token.
- `finishSession(data)` — Store auth token/profile, announce login, display welcome notice and navigate to dashboard.
- `handleLogin(event)` — Submit credentials and pass a successful response to `finishSession`.
- `handleRegister(event)` — Submit account fields and pass a successful response to `finishSession`.

`frontend/src/components/user/AdminPasskeyGate.jsx`:

- `AdminPasskeyGate({storageKey, children})` — Gate a sensitive page behind a per-page session passkey confirmation.
- `verify(event)` — Verify the passkey with the API and persist page-specific confirmation for the browser session.

`frontend/src/components/user/UserPicker.jsx`:

- `UserPicker()` — Display the signed-in profile and refresh it after login events.
- `sync()` — Load `/api/auth/me` when a token exists and refresh persisted/profile state.
- `handler()` — Event callback that delegates login synchronization to `sync()`.

`frontend/src/components/search/GlobalSearchBar.jsx`:

- `GlobalSearchBar()` — Render a global search input/filter and navigate to the search page.
- `handleSubmit(event)` — Prevent form navigation and encode query/filter into the search route.

`frontend/src/components/ui/TabbedCard.jsx`:

- `TabbedCard({tabs, style, className, defaultTab})` — Render the selected tab and synchronize active index when the parent changes `defaultTab`.

`frontend/src/components/status/APIStatus.jsx`:

- `checkHealth(path)` — Fetch a health endpoint and map its JSON response to online/offline.
- `getBatchStatus(statuses)` — Collapse service states into checking, online, warning or offline.
- `useAPIStatuses()` — Provide live backend/database status state and a manual/periodic refresh function.
- `updateStatuses()` — Check each health endpoint sequentially, update individual results and clear the loading flag.

`frontend/src/components/status/StatusDropdown.jsx`:

- `StatusDropdown()` — Render the service-status button and optional details dropdown using `useAPIStatuses()`.

`frontend/src/components/status/StatusDot.jsx`:

- `StatusDot({status})` — Map online/checking/warning/offline states to the corresponding accessible dot.

`frontend/src/components/status/StatusRow.jsx`:

- `StatusRow({label, status})` — Render a labeled status line with its `StatusDot`.

`frontend/src/components/confirm/ConfirmDialog.jsx`:

- `ConfirmDialog()` — Listen for confirmation requests and render the shared confirm/cancel overlay.
- `handleConfirm(event)` — Set dialog text from the dispatched event, falling back to a generic question.

`frontend/src/components/confirm/PromptPasskeyDialog.jsx`:

- `PromptPasskeyDialog()` — Listen for passkey prompt events, focus the password input and render a promise-backed form.
- `handlePrompt(event)` — Set prompt text from a custom event.
- `submit(value)` — Resolve the pending prompt and close the dialog.

`frontend/src/components/notify/Notifier.jsx`:

- `Notifier()` — Listen for notice events and render a transient accessible notice.
- `handleNotice(event)` — Replace the current notice and reset its dismissal timer.

`frontend/src/components/layout/Sidebar/Sidebar.jsx`:

- `Sidebar()` — Render brand/search/navigation and filter admin-only links using the persisted profile's admin flag.
- `isAdmin` initializer — Parse persisted profile once for navigation filtering; malformed or absent profile defaults to non-admin.

`frontend/src/components/layout/Header/Header.jsx`:

- `Header()` — Render the reusable product title header.

### Pages

`frontend/src/pages/Dashboard.jsx`:

- `relativeProfitValue(cost, price)` — Return price divided by positive cost when the inputs are usable; otherwise return `null`.
- `DashboardPage()` — Load dashboard datasets, derive summaries, render order/logistics panels and host request/sales graph dialogs.
- `openSnapshotGraph()` — Fetch selected-month daily sales/cost data and open the graph dialog with loading/error states.
- `formatSalesMonth(value)` — Format a `YYYY-MM` key as localized abbreviated month and year.
- `renderSnapshotGraph()` — Render a compact SVG sales-versus-cost chart (retained helper; the current UI also renders a Recharts graph in the graph dialog).
- `load()` — Fetch products/orders/logistics/months/users/requests in parallel and derive dashboard counters and user greeting.
- `handleResize()` — Keep the dashboard's compact tabbed layout in sync with viewport width.
- `openRequest(item)` — Open the request modal with the chosen product preselected, or no preset item.
- `x(index)` / `y(value)` — Convert graph data to SVG chart coordinates within `renderSnapshotGraph()`.

`frontend/src/pages/Products.jsx`:

- `relativeProfitValue(cost, price)` — Calculate the product price-to-cost ratio when cost is positive and price finite.
- `ProductsPage()` — Manage catalog CRUD, search, vendor filtering, logistics, statistics, stock removal and request dialogs.
- `load()` — Fetch products, vendors, balances and logistics concurrently and initialize a default vendor on the add form.
- `handleSubmit(event)` — Normalize and create a catalog item, reset the form, refresh data and report success/errors.
- `startEdit(product)` — Load product values into the edit form and play the popup interaction sound.
- `saveEdit(id)` — Update a product, close edit state and reload the catalog.
- `handleDelete(id)` — Confirm and delete a product, then refresh the view.
- `openStats(product)` — Initialize statistics dialog state and read current on-hand amount for the selected product.
- `toPayload(raw)` — Convert numeric values, comma-separated duplicate identifiers and vendor selection into the API payload shape.
- `openRemoveStock(sku)` — Initialize and open the stock-removal dialog for an item.
- `submitRemoveStock(event)` — Submit a sale/liquidation request, refresh inventory and report the result.

`frontend/src/pages/Orders.jsx`:

- `OrdersPage()` — Manage order creation, order check-in, request fulfillment/rejection, filtering, search and item lookup.
- `load()` — Fetch orders, vendors, products, users and requests concurrently.
- `updateItem(index, key, value)` — Update one draft order-line field immutably.
- `addItem()` — Append a blank order line.
- `removeItem(index)` — Remove a draft line while preserving at least one row.
- `rejectRequest(requestRow)` — Mark a request rejected with the active user and reload request data.
- `fillRequest(requestRow)` — Navigate to order creation with the request ID so its lines/vendor can be prefilled.
- `handleSubmit(event)` — Create an order; when linked to a request, mark the request filled and attach the new order ID.
- `toggleCheckin(order, item)` — Confirm early receipt when its expected date is in the future, then toggle check-in and reload stock/order state.

`frontend/src/pages/Stock.jsx`:

- `StockPage()` — Show filtered stock balances and the form for recording a sale/liquidation removal.
- `load()` — Fetch stock balances and product choices concurrently.
- `handleSale(event)` — Remove the chosen quantity, reload balances and show a success/error message.

`frontend/src/pages/Vendors.jsx`:

- `VendorsPage()` — Render vendor creation, editing, deletion and URL-query filtering.
- `load()` — Fetch current vendor records.
- `handleSubmit(event)` — Create a vendor, clear the form and refresh data.
- `startEdit(vendor)` — Copy a vendor into the inline edit form.
- `saveEdit(id)` — Persist vendor edits, exit edit mode and reload.
- `handleDelete(id)` — Confirm and delete a vendor, then reload.

`frontend/src/pages/Activity.jsx`:

- `ActivityPage()` — Render admin activity filters, loading/errors and the result table.
- `load(activeFilters=filters)` — Build query parameters, request matching audit rows and maintain loading/error state.

`frontend/src/pages/CLI.jsx`:

- `CLIPage()` — Fetch and display backend CLI help in the terminal-style panel.
- `handleSubmit(event)` — Re-fetch help for empty/help commands; display a clear unknown-command hint for other text.

`frontend/src/pages/Search.jsx`:

- `SearchPage()` — Fetch global search results based on URL state and render the selected source tables.
- `handleSubmit(event)` — Navigate using the encoded query and selected result filter.

`frontend/src/pages/Settings.jsx`:

- `SettingsPage()` — Render appearance, accessibility, account and demo-database preferences.
- `handleChangePasskey(event)` — Submit old/new passkey values, clear form state on success and show errors otherwise.

`frontend/src/pages/TableEditor.jsx`:

- `stringifyValue(value)` — Convert database cell values, including objects and nulls, to editable text.
- `TableEditorTab({tableName, columns})` — Load and render a table's rows, with inline edit/delete actions.
- `load()` — Fetch the first 100 rows and row count for the selected table.
- `startEdit(row)` — Initialize an edit form from a row's non-primary-key fields.
- `cancelEdit()` — Clear active edit ID and input values.
- `saveEdit()` — Convert editable values to a PATCH payload, save the row and reload it.
- `deleteRow(rowId)` — Confirm and delete a table row, then refresh the page.
- `TableEditorPage()` — Load admin table metadata, render per-table tabs and expose backed-up table clearing.
- `resetTables()` — Confirm destructive clearing, call maintenance API and display backup/result status.
- Effect initializer — Load table metadata asynchronously and ignore state writes after unmount.

## Development recipes

### Add a new persistent field

1. Add the SQLAlchemy column in `backend/app/models.py`.
2. Add it to create/read DTOs in `backend/app/schemas.py` (and any router-local request models).
3. Decide how older SQLite databases should gain/backfill the field; extend `ensure_schema()` only for safe additive changes.
4. Update router serialization and mutation paths.
5. Update frontend form initial state, payload conversion, edit form and list/detail display.
6. Update CLI display/create/update arguments if the field is part of supported operations.
7. Document the field here and verify with a fresh DB and an existing DB.

### Add a new API route

1. Put the handler in the resource router under `backend/app/routers/`.
2. Validate input using a Pydantic request schema and declare a response model where one exists.
3. Use `Depends(get_db)` for the database session; use `require_user`/`require_admin` for access control.
4. Register any new router in `backend/app/routers/__init__.py` under the `/api` prefix.
5. Add the endpoint to the API table above and call it with the shared frontend `request()` wrapper.

### Add a page or workflow

1. Create a page component in `frontend/src/pages/`.
2. Register its route/navigation metadata in `frontend/src/routes/appRoutes.jsx` (direct global routes may also be mounted in `App.jsx`).
3. Use `request()` for I/O; keep form state in the page/component and refresh after successful writes.
4. Use shared `notify`, `confirm`, and `promptPasskey` helpers for consistent user interaction.
5. Add styles in the appropriate theme stylesheet and check compact viewport layouts.

### Change stock behavior safely

Treat `Stock.on_hand` as the current balance and `Movement` as an audit record. When a transaction adjusts stock, update the balance and create a corresponding movement in the same database transaction. For order check-in, apply only the change between previous and requested check-in states; otherwise toggling a checkbox twice will double-count inventory. Validate that issue/sale operations cannot create negative stock.

### Change urgency or order quantity

`compute_urgency()` provides the shared urgency scalar, while status and shortage are assembled by logistics/request/search code. Keep those call sites consistent, because logistics values appear in the product page, dashboard, search, requests modal and CLI. Order quantity currently corresponds to shortage; request form defaults and displayed “Qty needed” should continue to follow `order_quantity`.

### Add a theme

1. Add a theme stylesheet in `frontend/src/themes/wf/` with the CSS variables needed by the application.
2. Import it from `frontend/src/themes/allThemes.css`.
3. Add the user-facing option in `THEMES` in `frontend/src/pages/Settings.jsx`.
4. Verify text, borders, panels, status badges, modal overlays and form controls in both the new theme and high-contrast mode.

## Validation and troubleshooting

### Standard checks

```bash
cd frontend
npm run lint
npm run build
```

For Python syntax checks:

```bash
cd backend
python -m compileall -q app
```

There is no `backend/tests/` suite in this repository at the time this guide was written. For endpoint behavior changes, exercise the affected routes against a disposable database (set `INVENTORY_DB_PATH`) and verify both data and error responses.

### Common issues

| Symptom | Check |
| --- | --- |
| Browser reports API network failure | Confirm backend is on HTTPS port 8000; confirm Vite proxy target and local certificate trust. |
| API returns 401 unexpectedly | Check `inventory-token`, request's `Authorization` header and the token's 12-hour session expiry. A 401 clears local frontend session state. |
| Data differs in demo mode | Inspect `inventory-demo-db` in local storage and `X-Demo-DB` in the request; selected database is isolated per request context. |
| Frontend shows stale GET data briefly | GET responses are cached in session storage for up to 30 seconds; mutations clear that cache. |
| A new database field is absent on a user's database | Ensure `ensure_schema()` adds/backfills it safely or run a deliberate migration. |
| Static guide/license links return SPA HTML | Rebuild the frontend so `frontend/public/` files are present in `frontend/dist/`; the backend falls back to the SPA for missing files. |
| Dashboard counters do not refresh after a mutation | Ensure the owning page's reload function is in component scope and passed to the modal/action callback. |

## Keeping this guide useful

Update this cookbook whenever adding a model field, route, user workflow, shared function or developer command. Keep the API table, model table, setup instructions and function references aligned with code. The function catalog intentionally documents named functions/components; trivial anonymous handlers and array callbacks are grouped under their owning component to keep the reference navigable.
