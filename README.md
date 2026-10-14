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

## Development

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend uses `/api` routes and is configured for Vite's dev proxy. SQLite stores data at `backend/data/inventory.db`.
EOF