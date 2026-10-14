from fastapi import FastAPI

from app.routers import activity, auth, health, help, logistics, maintenance, movements, orders, products, search, stock, table_editor, users, vendors


def register_routers(app: FastAPI):
    app.include_router(health.router)
    app.include_router(activity.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(products.router, prefix="/api")
    app.include_router(stock.router, prefix="/api")
    app.include_router(table_editor.router, prefix="/api")
    app.include_router(movements.router, prefix="/api")
    app.include_router(vendors.router, prefix="/api")
    app.include_router(orders.router, prefix="/api")
    app.include_router(logistics.router, prefix="/api")
    app.include_router(search.router, prefix="/api")
    app.include_router(help.router, prefix="/api")
    app.include_router(users.router, prefix="/api")
    app.include_router(maintenance.router, prefix="/api")
