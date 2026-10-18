# Inventory Suite

Inventory Suite is a full-stack inventory and order management app built with a React + Vite frontend, a FastAPI backend, and SQLite storage.

## Features

- Item, vendor, stock, and order management
- Order check-in that adds received quantities to stock
- Stock removal for sales or liquidation
- Dashboard metrics, backorder tracking, and monthly sales summary
- Database-wide search
- User login, settings, and theme support
- Terminal-style CLI for inventory operations

## User documentation

- [User Guide](docs/USER_GUIDE.md): navigation and everyday inventory, orders, and requests workflows.
- [Support Guide](docs/SUPPORT.md): common access, search, stock, and service troubleshooting.

## Development

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm run backend  # from frontend/ creates/uses the TLS certificate and prints the admin passkey
```

Frontend development:

```bash
cd frontend
npm install
npm run dev
```

Production LAN build:

```bash
cd frontend
npm run build
```

Then run the backend. Clients should open `https://<host-ip>:8000`. The first backend run prints a temporary admin passkey and TLS certificate fingerprint. All other users self-register; activity logs are admin-only.

The frontend uses `/api` routes and is configured for Vite's dev proxy in development. SQLite stores data at `backend/data/inventory.db`, and writes are protected by per-request sessions, WAL mode, and a 30 second busy timeout.
EOF
