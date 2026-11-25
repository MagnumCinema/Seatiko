// Onboarding tasks the CRM keeps for each application stage (internal/crm/tasks.go).
import { dbDate, formatDbTime } from '../../../core/time/time.js';
import { localizedValue } from './projection.js';
import type { LocalizedString } from '../../../database/schema/columns.js';

export const TASK_PREFIX = 'seatiko:onboarding:';
const H = 3600_000;

export type TaskApplication = {
  id: string;
  name: LocalizedString;
  status: string;
  photoUrls: string[];
  rejectReason: string;
  /** Database timestamps (microseconds kept: they are part of the task keys, as in Go). */
  createdAt: string;
  submittedAt: string | null;
};
export type OnboardingTask = { key: string; applicationId: string; title: string; description: string; dueAt: Date };

/** Tasks that should be open now for one application; keys are stable per stage and cycle. */
export function onboardingTasks(app: TaskApplication, activity: Array<{ action: string; createdAt: string }>, now: Date): OnboardingTask[] {
  const name = localizedValue(app.name) || `Ресторан ${app.id}`;
  const cycleAt = app.submittedAt ?? app.createdAt;
  const cycle = dbDate(cycleAt);
  const action = ({ APPROVED: 'APPLICATION_APPROVED', REJECTED: 'APPLICATION_REJECTED', DRAFT: 'APPLICATION_REJECTED' } as Record<string, string>)[app.status];
  let stageAt = cycleAt;
  for (const e of activity) if (action && e.action === action && dbDate(e.createdAt) > dbDate(stageAt)) stageAt = e.createdAt;
  const stage = dbDate(stageAt);
  const task = (rule: string, title: string, description: string, dueAt: Date, epoch: string): OnboardingTask => ({
    key: `${TASK_PREFIX}${app.id}:${rule}:${formatDbTime(epoch)}`,
    applicationId: app.id,
    title: `${title} · ${name}`,
    description: `${description}\n\nЗаявка Seatiko: ${app.id}\nМодерация и публикация выполняются в админке Seatiko /admin.`,
    dueAt,
  });
  switch (app.status) {
    case 'DRAFT': {
      const due = new Date(stage.getTime() + 24 * H);
      return !app.photoUrls.length && now >= due
        ? [task('photos', 'Запросить фотографии', 'Связаться с владельцем и помочь добавить фотографии ресторана.', due, stageAt)]
        : [];
    }
    case 'SUBMITTED':
    case 'UNDER_REVIEW': {
      const tasks = [task('review', 'Проверить заявку', 'Проверить анкету, фотографии и контакты владельца. Зафиксировать решение в Seatiko.', new Date(cycle.getTime() + 24 * H), cycleAt)];
      const deadline = new Date(cycle.getTime() + 48 * H);
      if (now >= deadline) tasks.push(task('review-overdue', 'Заявка ждёт более 48 часов', 'Проверка просрочена. Назначить ответственного и связаться с владельцем.', deadline, cycleAt));
      return tasks;
    }
    case 'APPROVED':
      return [task('publish', 'Опубликовать ресторан', 'Заявка одобрена. Проверить готовность и выполнить публикацию в Seatiko.', new Date(stage.getTime() + 24 * H), stageAt)];
    case 'REJECTED':
      return [task('rejected', 'Обсудить исправления с владельцем', `Объяснить необходимые исправления. Причина отклонения: ${app.rejectReason}`, new Date(stage.getTime() + 24 * H), stageAt)];
  }
  return [];
}
