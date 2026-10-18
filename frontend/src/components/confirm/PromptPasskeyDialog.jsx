import { useEffect, useRef, useState } from "react";
import { resolvePromptPasskey } from "../../utils/promptPasskey";

export default function PromptPasskeyDialog() {
  const [message, setMessage] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handlePrompt(event) {
      setMessage(event.detail?.message || "Enter your passkey:");
    }
    window.addEventListener("inventory-prompt-passkey", handlePrompt);
    return () => window.removeEventListener("inventory-prompt-passkey", handlePrompt);
  }, []);

  useEffect(() => {
    if (message && inputRef.current) {
      inputRef.current.focus();
    }
  }, [message]);

  if (!message) return null;

  function submit(value) {
    resolvePromptPasskey(value);
    setMessage(null);
  }

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <form
        className="confirm-card"
        onSubmit={(event) => {
          event.preventDefault();
          submit(inputRef.current?.value || "");
        }}
      >
        <p className="confirm-message">{message}</p>
        <input
          ref={inputRef}
          type="password"
          placeholder="Passkey"
          className="prompt-input"
          autoComplete="current-password"
        />
        <div className="confirm-actions">
          <button type="button" onClick={() => submit(null)}>Cancel</button>
          <button type="submit" className="danger-button">Confirm</button>
        </div>
      </form>
    </div>
  );
}
