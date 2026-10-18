let currentResolve = null;

export function promptPasskey(message) {
  return new Promise((resolve) => {
    currentResolve = resolve;
    window.dispatchEvent(new CustomEvent("inventory-prompt-passkey", { detail: { message } }));
  });
}

export function resolvePromptPasskey(value) {
  if (currentResolve) {
    currentResolve(value);
    currentResolve = null;
  }
}
