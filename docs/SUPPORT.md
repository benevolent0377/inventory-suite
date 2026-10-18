# Inventory Suite Support Guide

Use this guide to resolve common issues. If an issue persists, contact the person who administers the Inventory Suite server.

## Sign-in and access

### I cannot sign in

- Confirm the username and passkey are entered correctly. Passkeys are case-sensitive.
- If you do not have an account, select **Need an account? Register** on the sign-in panel.
- If your passkey is forgotten, ask an administrator to reset it. The application does not display stored passkeys.
- If the server is unavailable for everyone, ask the server operator to check that the backend is running.

### Activity or Table Editor says admin access is required

Those pages are restricted to administrator accounts. Ask an Inventory Suite administrator to grant access if you need these tools for your role.

## Products, vendors, and stock

### I cannot add a product

Products require a SKU, name, and vendor. Create the vendor in **Vendors → Add Vendor** first, then return to **Products → Add Item**. Check that number fields contain valid numeric values.

### The search returned no results

- Check the selected source filter or change it to **All Sources**.
- Try a shorter term such as a SKU, product name, vendor name, order ID, or tracking number.
- On a destination page opened with **Jump to**, clear its search field to see the full table again.

### The on-hand quantity does not match what I counted

Check whether an order item was checked in more than once, or stock was removed through **Sell Item**. Use the item statistics and the Activity page (admin access) to help trace changes. Check-in adds the ordered quantity to stock; it does not confirm the physical count automatically.

### RPV shows a dash

RPV is `price / cost`. A dash appears when cost is zero or the value is unavailable. Review the product's price and cost in **Products → Items**.

## Orders and requests

### An item is missing from an order form

Confirm that the product exists in **Products → Items**. Use the item search button beside the order item's dropdown to search by SKU, name, or description.

### A request is not available to fill

Open **Orders → Requests**, set the status filter to **Open + Filled** or **Open**, and clear the request search field. Only open requests have **Fill** and **Reject** actions.

### A request was marked filled but I cannot find its order

Search the **Orders** tab by order ID, vendor, or item. Filling a request copies its items into the Create Order form; it is linked and marked filled when that order is submitted.

## Settings and demo data

### A setting did not take effect

Theme, text size, layout density, and motion settings update in the browser. If you changed the demo database option, reload the page; that option explicitly requires a reload to switch databases.

### I see different data than expected

Check whether **Use demo database** is enabled under **Settings → Data & Testing**. Reload after changing it. The demo database is separate from the normal database.

## The web app was shut down

The bottom-bar power button stops the backend and deletes active user sessions. It requires an administrator passkey, even if a different user is signed in. All users must sign in again after the service is restarted. Contact the server operator to restart it. In a local development checkout, the frontend's `npm run backend` command starts the backend (from the `frontend` directory).

## What to include when reporting a problem

Send the server administrator:

- The page and action you were using.
- The steps that led to the issue and what you expected to happen.
- The exact error message and approximate time it occurred.
- Whether the issue affects one user or everyone.

Screenshots can help, but do not include passkeys, passwords, access tokens, or other credentials.
