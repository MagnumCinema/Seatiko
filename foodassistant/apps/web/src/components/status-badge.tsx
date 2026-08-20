import type { ApplicationStatus } from "@/lib/api";

const LABELS: Record<ApplicationStatus, string> = {
  DRAFT: "Черновик",
  SUBMITTED: "Отправлено",
  UNDER_REVIEW: "На проверке",
  APPROVED: "Одобрено",
  REJECTED: "Отклонено",
  PUBLISHED: "Опубликовано",
};

export function StatusBadge({ status }: { status: ApplicationStatus | string }) {
  const key = status as ApplicationStatus;
  const label = LABELS[key] ?? status;
  return (
    <span className={`status-badge status-${String(status).toLowerCase()}`}>
      {label}
    </span>
  );
}
