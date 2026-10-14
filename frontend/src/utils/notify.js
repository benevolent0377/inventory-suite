export function notify(message) {
  window.dispatchEvent(new CustomEvent("inventory-notice", { detail: { message } }));
}
