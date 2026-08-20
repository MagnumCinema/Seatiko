import type { ApplicationStatus } from "@/lib/api";
import { useLocale } from "@/components/locale-provider";

const LABELS: Record<string, Record<ApplicationStatus, string>> = {
  ru: { DRAFT: "Черновик", SUBMITTED: "Отправлено", UNDER_REVIEW: "На проверке", APPROVED: "Одобрено", REJECTED: "Отклонено", PUBLISHED: "Опубликовано" },
  en: { DRAFT: "Draft", SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", APPROVED: "Approved", REJECTED: "Changes requested", PUBLISHED: "Published" },
  ro: { DRAFT: "Ciornă", SUBMITTED: "Trimis", UNDER_REVIEW: "În verificare", APPROVED: "Aprobat", REJECTED: "Necesită modificări", PUBLISHED: "Publicat" },
};

export function StatusBadge({ status }: { status: ApplicationStatus | string }) {
  const { locale } = useLocale();
  const key = status as ApplicationStatus;
  const label = LABELS[locale]?.[key] ?? status;
  return (
    <span className={`status-badge status-${String(status).toLowerCase()}`}>
      {label}
    </span>
  );
}
