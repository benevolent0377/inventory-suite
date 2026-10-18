# Inventory Suite User Guide

Inventory Suite helps you maintain products, vendors, stock, purchasing orders, and requests. This guide covers the browser application.

## Sign in and navigate

1. Open the Inventory Suite address provided by your administrator.
2. Sign in with your username and passkey. If you do not have an account, choose **Need an account? Register** and create one. Passkeys must be at least eight characters.
3. Use the left sidebar to open **Dashboard**, **Products**, **Vendors**, **Orders**, or **CLI**. Administrators also see **Activity** and **Table Editor**.
4. Use the search box in the sidebar to search across products, vendors, orders, and logistics. Choose a source to narrow the search.
5. The bottom bar contains status, log out, settings, and shutdown controls. Log out when you finish using a shared device.

## Dashboard

The Dashboard summarizes product and order activity, monthly sales and order cost, and logistics priorities. Use its **Order Index** and **Logistics** tabs to inspect recent orders and urgent inventory. **See more** opens the full Orders or Products logistics view. Use **Request** on a logistics row to start an item request.

## Vendors and products

### Add a vendor

Open **Vendors → Add Vendor**, enter the vendor name and any contact details, then select **Add**. Use the Vendors tab to edit or remove a vendor. Add vendors before products if the product form does not have a vendor to select.

### Add and maintain products

Open **Products → Add Item**. SKU and name are required; select a vendor and fill in details such as vendor item ID, price, cost, and required backstock as needed. Select **Add** to save.

In the **Items** tab, search and filter the list, edit a product, or open **Statistics**. **Sell Item** removes stock and records a reason and purpose. Deleting a product is permanent, so confirm the SKU before deleting.

### Read the logistics table

Open **Products → Logistics** to see on-hand quantity, required backstock, shortage, status, urgency, RPV, and order quantity. Use **Request** to put items into a request.

RPV (relative profit value) is calculated as `price / cost` and displayed to two decimal places. A dash is shown when cost is zero or the ratio cannot be calculated. Urgency is color-coded; higher urgency values are more urgent.

## Orders and requests

### Create an order

1. Open **Orders → Create Order**.
2. Choose a vendor if applicable, enter a tracking number if available, and add one or more products with quantities and expected arrival dates.
3. Select **Create Order**. The app records the active user's identity as the person who placed it.

### Receive an order

Open the **Orders** tab and find the order using its search, status, and sort controls. Check an item's **Checked In** box when it arrives; checking it in adds the ordered quantity to stock. Use this action once per received item to avoid duplicate stock additions.

### Review and fill requests

Open **Orders → Requests** to search and filter requests by status. Select **Fill** to start an order from an open request; the request's items and quantities are copied into the order form. Create the order to link it to the request. Select **Reject** if the request should not be filled.

When creating a request from the Dashboard or Products logistics table, select items in the **Available items** pane to move them to **Selected items**. Set quantities there, remove items if needed, then select **Submit Request**. **Create separate request per selected item** submits each selected item as its own request.

## Search and jump to a table

Search from the sidebar or open the Search page. Enter a term and choose **All Sources**, **Products**, **Vendors**, **Orders**, or **Logistics**. Results are grouped by source. Each result has **Jump to**, which opens the corresponding app page with the same search term applied to that table.

## Settings and account

Select the gear in the bottom bar to open **Settings**. You can change the theme, text size, layout density, and motion preference. In **Account**, enter your current and new passkey to update it.

The **Use demo database** option is intended for testing. Changing it takes effect after reloading the page. Confirm that you are on the intended database before making changes.

## Administrator pages and shutdown

Administrators can open **Activity** to filter the audit log and **Table Editor** to inspect database tables. These pages may require an additional admin passkey check. Table editing and table clearing can affect application data; use them only when you understand the operation.

The power button at the far left of the bottom bar shuts down the web application and suspends all active user sessions. After the confirmation prompt, enter an administrator passkey. This affects everyone using the app; use it only when the service should be stopped. A server operator must start the backend again before users can sign in.

## Quick workflow

For a routine restock: check the Dashboard or Products logistics table → submit a request for items with a shortage → open the request under Orders → Fill → create the order → check items in as they arrive.
