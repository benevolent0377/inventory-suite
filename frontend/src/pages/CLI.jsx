import { useEffect, useState } from "react";
import { request } from "../api/client";

export default function CLIPage() {
  const [output, setOutput] = useState("Loading CLI help...");
  const [command, setCommand] = useState("");

  useEffect(() => {
    request("/api/help")
      .then((data) => setOutput(data.help))
      .catch((err) => setOutput(err.message));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = command.trim();
    if (trimmed === "" || trimmed === "help") {
      try {
        const data = await request("/api/help");
        setOutput(data.help);
      } catch (err) {
        setOutput(err.message);
      }
    } else {
      setOutput(`Unknown command: ${trimmed}\nType 'help' to list CLI commands.`);
    }
    setCommand("");
  }

  return (
    <div className="page cli-page">
      <pre className="terminal-output">{output}</pre>
      <form className="form-row cli-input-row" onSubmit={handleSubmit}>
        <label>
          Command
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="help" />
        </label>
        <button type="submit">Run</button>
      </form>
      <p className="cli-note">CLI equivalent: python -m app.cli help</p>
    </div>
  );
}
