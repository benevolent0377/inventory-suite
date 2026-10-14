import { useState } from "react";
import { getBatchStatus, useAPIStatuses } from "./APIStatus";
import StatusRow from "./StatusRow";
import StatusDot from "./StatusDot";

export function StatusDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const { statuses, loading, updateStatuses } = useAPIStatuses();
  const batchStatus = getBatchStatus(statuses);

  return (
    <div className="status-dropdown">
      <button className="status-button" onClick={() => setIsOpen(!isOpen)}>
        <span>Service Status</span>
        <StatusDot status={batchStatus} />
      </button>
      {isOpen && (
        <div className="status-card">
          <StatusRow label="Backend" status={statuses.backend} />
          <StatusRow label="Database" status={statuses.database} />
          <button className="status-reload-button" onClick={updateStatuses} disabled={loading}>
            {loading ? "Reloading..." : "Reload"}
          </button>
        </div>
      )}
    </div>
  );
}

export default StatusDropdown;
