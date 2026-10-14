let currentResolve = null;

export function confirm(message) {
  return new Promise((resolve) => {
    currentResolve = resolve;
    window.dispatchEvent(new CustomEvent("inventory-confirm", { detail: { message } }));
  });
}

export function resolveConfirm(value) {
  if (currentResolve) {
    currentResolve(value);
    currentResolve = null;
  }
}
