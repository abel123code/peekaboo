import { Badge } from "./ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "completed" || status === "approved"
      ? "success"
      : status === "failed" || status === "rejected"
      ? "danger"
      : status === "running" || status === "queued"
      ? "warning"
      : status === "draft"
      ? "info"
      : "neutral";

  return <Badge variant={variant}>{status}</Badge>;
}
