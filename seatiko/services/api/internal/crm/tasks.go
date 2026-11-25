package crm

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/seatiko/api/internal/models"
)

const onboardingTaskPrefix = "seatiko:onboarding:"

type onboardingTask struct {
	key           string
	applicationID string
	title         string
	description   string
	dueAt         time.Time
}

func onboardingTasks(application models.VenueApplication, activity []models.ApplicationActivity, now time.Time) []onboardingTask {
	name := localizedValue(application.Name)
	if name == "" {
		name = "Ресторан " + application.ID
	}
	cycle := application.CreatedAt
	if application.SubmittedAt != nil {
		cycle = *application.SubmittedAt
	}
	stageStarted := cycle
	action := map[models.ApplicationStatus]string{
		models.AppApproved: "APPLICATION_APPROVED",
		models.AppRejected: "APPLICATION_REJECTED",
		models.AppDraft:    "APPLICATION_REJECTED",
	}[application.Status]
	for _, event := range activity {
		if action != "" && event.Action == action && event.CreatedAt.After(stageStarted) {
			stageStarted = event.CreatedAt
		}
	}
	makeTask := func(rule, title, description string, dueAt, epoch time.Time) onboardingTask {
		return onboardingTask{
			key:           onboardingTaskPrefix + application.ID + ":" + rule + ":" + epoch.UTC().Format(time.RFC3339Nano),
			applicationID: application.ID,
			title:         title + " · " + name,
			description: description + "\n\nЗаявка Seatiko: " + application.ID +
				"\nМодерация и публикация выполняются в админке Seatiko /admin.",
			dueAt: dueAt.UTC(),
		}
	}
	switch application.Status {
	case models.AppDraft:
		// Give owners a day to fill in a newly created or returned application.
		dueAt := stageStarted.Add(24 * time.Hour)
		if len(application.PhotoURLs) == 0 && !now.Before(dueAt) {
			return []onboardingTask{makeTask("photos", "Запросить фотографии", "Связаться с владельцем и помочь добавить фотографии ресторана.", dueAt, stageStarted)}
		}
	case models.AppSubmitted, models.AppUnderReview:
		tasks := []onboardingTask{makeTask("review", "Проверить заявку", "Проверить анкету, фотографии и контакты владельца. Зафиксировать решение в Seatiko.", cycle.Add(24*time.Hour), cycle)}
		deadline := cycle.Add(48 * time.Hour)
		if !now.Before(deadline) {
			tasks = append(tasks, makeTask("review-overdue", "Заявка ждёт более 48 часов", "Проверка просрочена. Назначить ответственного и связаться с владельцем.", deadline, cycle))
		}
		return tasks
	case models.AppApproved:
		return []onboardingTask{makeTask("publish", "Опубликовать ресторан", "Заявка одобрена. Проверить готовность и выполнить публикацию в Seatiko.", stageStarted.Add(24*time.Hour), stageStarted)}
	case models.AppRejected:
		return []onboardingTask{makeTask("rejected", "Обсудить исправления с владельцем", "Объяснить необходимые исправления. Причина отклонения: "+application.RejectReason, stageStarted.Add(24*time.Hour), stageStarted)}
	}
	return nil
}

// syncOnboardingTasks owns only tasks marked with our stable automation key.
// Assignees, human notes and manually completed tasks remain under CRM control.
func (s *Syncer) syncOnboardingTasks(ctx context.Context, applications []models.VenueApplication, companyIDs map[string]string, now time.Time) error {
	tasks, err := s.client.listAll(ctx, "tasks")
	if err != nil {
		return fmt.Errorf("list onboarding tasks: %w", err)
	}
	existing := make(map[string]map[string]any)
	for _, task := range tasks {
		key := stringField(task, "seatikoTaskKey")
		if !strings.HasPrefix(key, onboardingTaskPrefix) || stringField(task, "seatikoApplicationId") == "" {
			continue
		}
		if _, duplicate := existing[key]; duplicate {
			return fmt.Errorf("Twenty conflict: multiple tasks have Seatiko key %q", key)
		}
		existing[key] = task
	}
	desired := make(map[string]onboardingTask)
	for _, application := range applications {
		if companyIDs[application.ID] == "" {
			continue
		}
		activity, err := s.store.ListApplicationActivity(application.OwnerUserID, application.ID)
		if err != nil {
			return fmt.Errorf("load onboarding history for %s: %w", application.ID, err)
		}
		for _, task := range onboardingTasks(application, activity, now) {
			desired[task.key] = task
		}
	}
	var targets []map[string]any
	if len(desired) > 0 {
		targets, err = s.client.listAll(ctx, "taskTargets")
		if err != nil {
			return fmt.Errorf("list onboarding task links: %w", err)
		}
	}
	keys := make([]string, 0, len(desired))
	for key := range desired {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		task := desired[key]
		record, exists := existing[key]
		id := recordID(record)
		if !exists {
			id, err = s.client.createRecord(ctx, "tasks", map[string]any{
				"title": task.title, "bodyV2": map[string]any{"markdown": task.description},
				"dueAt": task.dueAt.Format(time.RFC3339Nano), "status": "TODO",
				"seatikoTaskKey": task.key, "seatikoApplicationId": task.applicationID, "seatikoAutoResolved": false,
			})
			if err != nil {
				return fmt.Errorf("create onboarding task: %w", err)
			}
		} else if resolved, _ := record["seatikoAutoResolved"].(bool); resolved {
			patch := map[string]any{"seatikoAutoResolved": false}
			if stringField(record, "status") == "DONE" {
				patch["status"] = "TODO"
			}
			if err := s.client.updateRecord(ctx, "tasks", id, patch); err != nil {
				return fmt.Errorf("reopen onboarding task: %w", err)
			}
		}
		companyID := companyIDs[task.applicationID]
		linked := false
		for _, target := range targets {
			if stringField(target, "taskId") == id && stringField(target, "targetCompanyId") == companyID {
				linked = true
				break
			}
		}
		if !linked {
			if _, err := s.client.createRecord(ctx, "taskTargets", map[string]any{"taskId": id, "targetCompanyId": companyID}); err != nil {
				return fmt.Errorf("link onboarding task to restaurant: %w", err)
			}
		}
	}
	for key, task := range existing {
		if _, active := desired[key]; active || stringField(task, "status") == "DONE" {
			continue
		}
		if err := s.client.updateRecord(ctx, "tasks", recordID(task), map[string]any{"status": "DONE", "seatikoAutoResolved": true}); err != nil {
			return fmt.Errorf("complete resolved onboarding task: %w", err)
		}
	}
	return nil
}
