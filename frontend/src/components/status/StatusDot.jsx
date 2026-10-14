function StatusDot({ status }) {
  if (status === "online") {
    return <span className="status-dot online" aria-label="online" />;
  }
  if (status === "warning" || status === "checking") {
    return <span className="status-dot warning" aria-label="warning" />;
  }
  return <span className="status-dot offline" aria-label="offline" />;
}

export default StatusDot;
