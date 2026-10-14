import StatusDot from "./StatusDot";

export default function StatusRow({ label, status }) {
  return (
    <p className={`status-row ${status}`}>
      {label}
      <StatusDot status={status} />
    </p>
  );
}
