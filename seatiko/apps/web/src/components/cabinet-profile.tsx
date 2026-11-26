"use client";

import "@/app/cabinet/profile.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CabinetConfirmDialog } from "@/components/cabinet-confirm-dialog";
import {
  AlertIcon,
  ChangeList,
  CheckIcon,
  ClockIcon,
  CuisinePicker,
  EditIcon,
  ExternalIcon,
  FieldError,
  fill,
  HoursEditor,
  ImageIcon,
  LocalizedField,
  LockIcon,
  ReviewDialog,
  SUPPORT_EMAIL,
  withSupportLink,
  type SiteCopy,
} from "@/components/cabinet-profile-fields";
import { PhotosSection } from "@/components/cabinet-profile-photos";
import { useLocale } from "@/components/locale-provider";
import { SelectMenu } from "@/components/ui/select-menu";
import { VenueLocationPicker } from "@/components/venue-location-picker";
import {
  ApiError,
  getApplication,
  listMyChangeRequests,
  mediaUrl,
  pickLocale,
  priceLevelLabel,
  submitApplication,
  submitProfileChangeRequest,
  updateApplication,
  type City,
  type LocaleCode,
  type MapConfig,
  type MapCoordinates,
  type ProfileChangeRequest,
  type VenueApplication,
} from "@/lib/api";
import { pluralize } from "@/lib/cabinet-helpers";
import { googleMapCoordinates, googleMapSearch } from "@/lib/google-map";
import { describeHours, hoursLabelsFor, parseHoursText } from "@/lib/venue-hours";
import { getSiteCopy } from "@/lib/site-copy";
import {
  applyPatch,
  clearStoredEdits,
  completenessErrors,
  DESCRIPTION_MAX,
  diffValues,
  draftFromApplication,
  FIELD_READINESS,
  formatErrors,
  formatMoldovaPhone,
  NAME_MAX,
  normalizeMoldovaPhone,
  normalizeWebsite,
  parseDecimal,
  patchBetween,
  patchFields,
  READINESS_KEYS,
  readiness,
  readStoredEdits,
  valuesFromApplication,
  valuesFromDraft,
  writeStoredEdits,
  type FieldErrors,
  type FieldKey,
  type ProfileChange,
  type ProfileDraft,
  type ProfileValues,
  type ReadinessKey,
} from "@/lib/venue-profile";
import { VENUE_TYPE_IDS } from "@/lib/venue-roles";

const BALTI_CENTER: MapCoordinates = { lat: 47.7622, lng: 27.9289 };

const FIELD_ELEMENT: Record<FieldKey, string> = {
  name: "venue-name",
  description: "venue-description",
  address: "venue-address",
  cuisine: "venue-cuisine",
  hours: "venue-hours",
  point: "venue-map",
  phone: "venue-phone",
  email: "venue-email",
  website: "venue-website",
  average_check: "venue-check",
  photos: "venue-photos",
};
const FIELD_ORDER: FieldKey[] = ["name", "description", "cuisine", "hours", "address", "point", "phone", "email", "website", "average_check", "photos"];

/** Wall-clock time for "saved at" (only read in event handlers). */
const timestamp = () => Date.now();

const INTL_LOCALE: Record<LocaleCode, string> = { ru: "ru-RU", en: "en-GB", ro: "ro-RO" };

function formatWhen(iso: string, locale: LocaleCode) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatTimeOfDay(ms: number, locale: LocaleCode) {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

/** How a saved value reads in a change list. */
function useValueText(copy: SiteCopy, cities: City[], locale: LocaleCode) {
  return useCallback(
    (change: ProfileChange, values: ProfileValues): string => {
      const t = copy.cabinet.profileTab;
      const cuisineNames = copy.catalog.cuisines as Record<string, string>;
      const typeNames = copy.discover.chips as Record<string, string>;
      const or = (value: string) => value || t.notSet;
      switch (change.field) {
        case "name":
        case "description":
        case "address":
          return or(values[change.field][change.locale ?? locale]);
        case "city_id": {
          const city = cities.find((item) => item.id === values.city_id);
          return city ? pickLocale(city.name, locale) : or(values.city_id);
        }
        case "cuisine":
          return or(values.cuisine.map((code) => cuisineNames[code] ?? code).join(", "));
        case "venue_type":
          return or(values.venue_type ? typeNames[values.venue_type] ?? values.venue_type : "");
        case "hours_text": {
          const week = parseHoursText(values.hours_text);
          return week ? describeHours(week, hoursLabelsFor(locale)) : or(values.hours_text);
        }
        case "point":
          return values.lat && values.lng ? `${values.lat.toFixed(5)}, ${values.lng.toFixed(5)}` : t.notSet;
        case "price_level":
          return values.price_level ? priceLabel(copy, values.price_level) : t.notSet;
        case "average_check":
          return values.average_check ? `${values.average_check} MDL` : t.notSet;
        default:
          return or(values[change.field]);
      }
    },
    [copy, cities, locale],
  );
}

function priceLabel(copy: SiteCopy, level: number) {
  const cabinet = copy.cabinet;
  return level === 1 ? cabinet.price1 : level === 3 ? cabinet.price3 : cabinet.price2;
}

/* —— Panel —— */

export type CabinetProfilePanelProps = {
  application: VenueApplication;
  /** Map key and cities (the page loads them once). */
  mapConfig: MapConfig | null;
  /** Moldovan cities to pick from. */
  cities: City[];
  /** A fresher copy of the application (after save, upload, submit or a reload). */
  onApplicationChange: (app: VenueApplication) => void;
  /** Shows a notice above the tab; an empty text clears it. */
  onNotice: (text: string, tone?: "success" | "error") => void;
  /** Something was written to the activity journal. */
  onActivityChange: () => void;
  /** The application went to moderation. */
  onSubmitted: () => void;
  onDelete: () => void;
  deleteBusy?: boolean;
};

export function CabinetProfilePanel({
  application,
  mapConfig,
  cities,
  onApplicationChange,
  onNotice,
  onActivityChange,
  onSubmitted,
  onDelete,
  deleteBusy = false,
}: CabinetProfilePanelProps) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale);
  const cabinet = copy.cabinet;
  const ui = cabinet.ui;
  const t = cabinet.profileTab;

  const status = application.status;
  const draftStatus = status === "DRAFT" || status === "REJECTED";
  const published = status === "PUBLISHED";

  const [initial] = useState(() => readStoredEdits(application, locale));
  const [draft, setDraft] = useState<ProfileDraft>(() => initial?.draft ?? draftFromApplication(application));
  const [editingPublished, setEditingPublished] = useState(() => initial?.mode === "change");
  const [restoredAt, setRestoredAt] = useState<number | null>(() => (initial && !initial.legacy_unsent ? initial.saved_at : null));
  const [legacyUnsent, setLegacyUnsent] = useState(() => Boolean(initial?.legacy_unsent));
  const [textLocale, setTextLocale] = useState<LocaleCode>(locale);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState<"save" | "submit" | "change" | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<"discard" | "reset" | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [cityChanged, setCityChanged] = useState(false);
  const [requests, setRequests] = useState<ProfileChangeRequest[] | null>(null);
  const [requestsFailed, setRequestsFailed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Bumped when the form is reset, so editors with their own state (hours grid, custom cuisine) start over.
  const [formKey, setFormKey] = useState(0);

  const editing = draftStatus || (published && editingPublished);
  const readOnly = !editing;
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // A newer application (saved, refreshed, approved) replaces the form unless the owner has edits in it.
  const [syncedApp, setSyncedApp] = useState(application);
  if (syncedApp !== application) {
    setSyncedApp(application);
    if (diffValues(valuesFromApplication(syncedApp), valuesFromDraft(draft)).length === 0) {
      setDraft(draftFromApplication(application));
    }
  }

  const savedValues = useMemo(() => valuesFromApplication(application), [application]);
  const draftValues = useMemo(() => valuesFromDraft(draft), [draft]);
  const changes = useMemo(() => (editing ? diffValues(savedValues, draftValues) : []), [editing, savedValues, draftValues]);
  const dirty = changes.length > 0;
  const photoCount = application.photo_urls?.length ?? 0;
  const valueText = useValueText(copy, cities, locale);

  const loadRequests = useCallback(async () => {
    try {
      const list = await listMyChangeRequests();
      setRequests(list.filter((request) => request.application_id === application.id));
      setRequestsFailed(false);
    } catch {
      setRequestsFailed(true);
    }
  }, [application.id]);

  // Fresh data on open: the profile may have changed on another device or after a moderator's decision.
  useEffect(() => {
    let active = true;
    getApplication(application.id)
      .then((fresh) => {
        if (active && fresh.updated_at !== application.updated_at) onApplicationChange(fresh);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // Only when another venue opens; later updates come through the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application.id]);

  useEffect(() => {
    if (!published) return;
    const timer = window.setTimeout(() => void loadRequests(), 0);
    return () => window.clearTimeout(timer);
  }, [published, loadRequests]);

  // Leaving the page with edits that are neither saved nor sent.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const persist = useCallback(
    (next: ProfileDraft, mode: "draft" | "change") => {
      if (diffValues(valuesFromApplication(application), valuesFromDraft(next)).length === 0) clearStoredEdits(application.id);
      else writeStoredEdits(application.id, { draft: next, mode, saved_at: Date.now(), legacy_unsent: legacyUnsent || undefined });
    },
    [application, legacyUnsent],
  );

  function update(patch: Partial<ProfileDraft>, clear: FieldKey[] = []) {
    if (readOnly) return;
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    persist(next, draftStatus ? "draft" : "change");
    if (clear.some((key) => errors[key])) {
      setErrors((current) => {
        const copyErrors = { ...current };
        for (const key of clear) delete copyErrors[key];
        return copyErrors;
      });
    }
  }

  /** Re-checks one field's format when the owner leaves it. */
  function checkOnBlur(key: FieldKey) {
    const problem = formatErrors(draftRef.current)[key];
    setErrors((current) => {
      if (current[key] === problem) return current;
      const next = { ...current };
      if (problem) next[key] = problem;
      else delete next[key];
      return next;
    });
  }

  function focusFirst(found: FieldErrors) {
    const first = FIELD_ORDER.find((key) => found[key]);
    if (!first) return;
    window.requestAnimationFrame(() => {
      const node = document.getElementById(FIELD_ELEMENT[first]);
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
      node?.focus({ preventScroll: true });
    });
  }

  const readinessLabels: Record<ReadinessKey, string> = {
    basics: cabinet.checkNameDesc,
    address: cabinet.checkAddress,
    point: cabinet.checkMapPoint,
    cuisine: cabinet.checkCuisine,
    contacts: cabinet.checkContacts,
    hours: cabinet.checkHours,
    photos: cabinet.checkPhotos,
  };
  const missingList = (found: FieldErrors) => {
    const groups = new Set((Object.keys(found) as FieldKey[]).filter((key) => found[key]).map((key) => FIELD_READINESS[key]));
    return READINESS_KEYS.filter((key) => groups.has(key))
      .map((key) => readinessLabels[key].toLowerCase())
      .join(", ");
  };

  function errorText(key: FieldKey): string | null {
    const problem = errors[key];
    if (!problem) return null;
    switch (key) {
      case "name":
      case "description":
      case "address":
        return problem === "too_long" ? fill(t.tooLong, { max: key === "name" ? NAME_MAX : DESCRIPTION_MAX }) : t.requiredText;
      case "cuisine":
        return t.cuisineRequired;
      case "hours":
        return t.hoursRequired;
      case "point":
        return problem === "outside" ? t.pointOutside : problem === "invalid" ? t.pointInvalid : t.pointRequired;
      case "phone":
        return problem === "invalid" ? t.phoneInvalid : t.required;
      case "email":
        return problem === "invalid" ? t.emailInvalid : t.required;
      case "website":
        return t.websiteInvalid;
      case "average_check":
        return t.averageInvalid;
      case "photos":
        return t.photoRequired;
    }
  }

  function apiProblem(error: unknown, fallback: string) {
    if (error instanceof ApiError) {
      if (error.code === "invalid_fields") return ui.invalidFields;
      if (error.code === "incomplete") return fill(t.missing, { list: missingList(completenessErrors(draftRef.current, photoCount)) });
      if (error.status === 409) {
        void getApplication(application.id).then(onApplicationChange).catch(() => {});
        return t.notEditable;
      }
    }
    return fallback;
  }

  /** Saves the draft's changes (DRAFT / REJECTED). Returns false when nothing could be saved. */
  async function saveDraft(quiet = false): Promise<boolean> {
    const found = formatErrors(draft);
    if (Object.keys(found).length) {
      setErrors(found);
      focusFirst(found);
      onNotice(ui.fixFields, "error");
      return false;
    }
    const patch = patchBetween(savedValues, draftValues);
    if (Object.keys(patch).length === 0) {
      if (!quiet) onNotice(t.allSaved);
      return true;
    }
    const sent = draft;
    const updated = await updateApplication(application.id, patch);
    onApplicationChange(updated);
    // Fields typed while the request was on its way stay in the form.
    if (draftRef.current === sent) {
      const fresh = draftFromApplication(updated);
      draftRef.current = fresh;
      setDraft(fresh);
      clearStoredEdits(application.id);
    }
    setSavedAt(timestamp());
    setRestoredAt(null);
    onActivityChange();
    if (!quiet) onNotice(t.draftSaved);
    return true;
  }

  async function onSave() {
    if (saving) return;
    onNotice("");
    setSaving("save");
    try {
      await saveDraft();
    } catch (error) {
      onNotice(apiProblem(error, ui.saveFailed), "error");
    } finally {
      setSaving(null);
    }
  }

  async function onSubmit() {
    if (saving) return;
    onNotice("");
    const found = completenessErrors(draft, photoCount);
    if (Object.keys(found).length) {
      setErrors(found);
      focusFirst(found);
      onNotice(fill(t.missing, { list: missingList(found) }), "error");
      return;
    }
    setSaving("submit");
    try {
      if (!(await saveDraft(true))) return;
      const updated = await submitApplication(application.id);
      clearStoredEdits(application.id);
      onApplicationChange(updated);
      onActivityChange();
      onSubmitted();
    } catch (error) {
      onNotice(apiProblem(error, ui.submitFailed), "error");
    } finally {
      setSaving(null);
    }
  }

  function startEditing() {
    setFormKey((key) => key + 1);
    const fresh = draftFromApplication(application);
    draftRef.current = fresh;
    setDraft(fresh);
    setErrors({});
    setEditingPublished(true);
  }

  function stopEditing() {
    setFormKey((key) => key + 1);
    const fresh = draftFromApplication(application);
    draftRef.current = fresh;
    setDraft(fresh);
    setErrors({});
    setEditingPublished(false);
    setLegacyUnsent(false);
    setRestoredAt(null);
    setCityChanged(false);
    clearStoredEdits(application.id);
  }

  function resetDraft() {
    setFormKey((key) => key + 1);
    const fresh = draftFromApplication(application);
    draftRef.current = fresh;
    setDraft(fresh);
    setErrors({});
    setRestoredAt(null);
    setCityChanged(false);
    clearStoredEdits(application.id);
  }

  function openReview() {
    onNotice("");
    const found = completenessErrors(draft, photoCount);
    delete found.photos;
    if (Object.keys(found).length) {
      setErrors(found);
      focusFirst(found);
      onNotice(ui.fixFields, "error");
      return;
    }
    if (!dirty) return;
    setReviewOpen(true);
  }

  async function sendChanges() {
    if (saving) return;
    setSaving("change");
    try {
      const request = await submitProfileChangeRequest(application.id, patchBetween(savedValues, draftValues));
      setRequests((current) => [request, ...(current ?? [])]);
      setReviewOpen(false);
      stopEditing();
      onActivityChange();
      onNotice(t.changeSent);
    } catch (error) {
      setReviewOpen(false);
      onNotice(error instanceof ApiError && error.status === 409 ? t.changeNotPublished : t.changeFailed, "error");
      if (error instanceof ApiError && error.status === 409) void getApplication(application.id).then(onApplicationChange).catch(() => {});
    } finally {
      setSaving(null);
    }
  }

  /* —— Derived view data —— */

  const point = useMemo<MapCoordinates | null>(() => {
    const lat = parseDecimal(draft.lat);
    const lng = parseDecimal(draft.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat && lng ? { lat, lng } : null;
  }, [draft.lat, draft.lng]);
  const cityCenter = cities.find((city) => city.id === draft.city_id)?.center ?? BALTI_CENTER;
  const checks = readiness(draftValues, photoCount);
  const doneCount = READINESS_KEYS.filter((key) => checks[key]).length;
  const completion = Math.round((doneCount / READINESS_KEYS.length) * 100);
  const missingNow = READINESS_KEYS.filter((key) => !checks[key]).map((key) => readinessLabels[key].toLowerCase());
  const pending = (requests ?? []).filter((request) => request.status === "PENDING");
  const decided = (requests ?? []).filter((request) => request.status !== "PENDING");
  const changesCount = fill(pluralize(changes.length, t.changesCount, locale), { n: changes.length });
  const typeNames = copy.discover.chips as Record<string, string>;
  const cuisineNames = copy.catalog.cuisines as Record<string, string>;

  const statusBanner = (() => {
    if (status === "REJECTED") {
      return (
        <div className="vp-banner danger" role="note">
          <span className="vp-banner-icon"><AlertIcon /></span>
          <div>
            <strong>{t.rejectedTitle}</strong>
            {application.reject_reason && (
              <blockquote>
                <small>{cabinet.moderatorNote}</small>
                {application.reject_reason}
              </blockquote>
            )}
            <p>{t.rejectedHint}</p>
          </div>
        </div>
      );
    }
    if (status === "SUBMITTED" || status === "UNDER_REVIEW" || status === "APPROVED") {
      const approved = status === "APPROVED";
      return (
        <div className="vp-banner" role="note">
          <span className="vp-banner-icon"><LockIcon /></span>
          <div>
            <strong>{approved ? t.approvedTitle : t.reviewTitle}</strong>
            <p>{approved ? t.approvedHint : t.reviewHint}</p>
            <p className="vp-banner-support">
              {t.urgentFix} <a href={`mailto:${SUPPORT_EMAIL}`}>{t.writeSupport}</a>
            </p>
          </div>
        </div>
      );
    }
    if (published && !editingPublished) {
      return (
        <div className="vp-banner ok" role="note">
          <span className="vp-banner-icon"><CheckIcon /></span>
          <div>
            <strong>{t.publishedTitle}</strong>
            <p>{t.publishedHint}</p>
          </div>
          <button type="button" className="btn btn--primary btn--md vp-nowrap vp-edit-btn" onClick={startEditing}>
            <EditIcon />
            <span>{t.edit}</span>
          </button>
        </div>
      );
    }
    if (published && editingPublished) {
      return (
        <div className={`vp-banner ${legacyUnsent ? "danger" : "accent"}`} role="note">
          <span className="vp-banner-icon">{legacyUnsent ? <AlertIcon /> : <EditIcon />}</span>
          <div>
            <strong>{legacyUnsent ? t.legacyUnsentTitle : t.editingTitle}</strong>
            <p>{legacyUnsent ? t.legacyUnsentHint : t.editingHint}</p>
            {pending.length > 0 && <p className="vp-banner-support">{t.pendingWhileEditing}</p>}
          </div>
        </div>
      );
    }
    return null;
  })();

  // While editing, the banner says a request is pending; the full list returns in read mode.
  const requestsCard = published && !editingPublished && (requestsFailed || pending.length > 0 || decided.length > 0) && (
    <section className="owner-card vp-requests" aria-labelledby="vp-requests-title">
      <div className="vp-requests-head">
        <h3 id="vp-requests-title">{t.requestsTitle}</h3>
        {requestsFailed && (
          <button type="button" className="btn btn--secondary btn--sm vp-nowrap" onClick={() => void loadRequests()}>
            {t.retry}
          </button>
        )}
      </div>
      {requestsFailed && <p className="vp-muted">{t.requestsLoadFailed}</p>}
      {pending.map((request) => {
        const after = applyPatch(savedValues, request.patch ?? {});
        const list = diffValues(savedValues, after);
        return (
          <article key={request.id} className="vp-request pending">
            <header>
              <span className="vp-status pending"><ClockIcon />{t.requestPending}</span>
              <time dateTime={request.created_at}>{fill(t.requestSent, { date: formatWhen(request.created_at, locale) })}</time>
            </header>
            {list.length ? (
              <ChangeList changes={list} before={savedValues} after={after} valueText={valueText} t={t} />
            ) : (
              <p className="vp-muted">{t.requestSame}</p>
            )}
          </article>
        );
      })}
      {pending.length > 0 && <p className="vp-muted vp-requests-hint">{withSupportLink(t.requestCancelHint)}</p>}
      {decided.length > 0 && (
        <div className="vp-requests-history">
          <button type="button" className="btn btn--link vp-link-btn" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}>
            {fill(t.requestsHistory, { n: decided.length })}
            <span aria-hidden="true">{historyOpen ? "▴" : "▾"}</span>
          </button>
          {historyOpen &&
            decided.slice(0, 10).map((request) => {
              const names = t.fieldNames as Record<string, string>;
              const fields = patchFields(request.patch ?? {}).map((field) => names[field] ?? field);
              const approved = request.status === "APPROVED";
              return (
                <article key={request.id} className={`vp-request ${approved ? "approved" : "rejected"}`}>
                  <header>
                    <span className={`vp-status ${approved ? "approved" : "rejected"}`}>
                      {approved ? <CheckIcon /> : <AlertIcon />}
                      {approved ? t.requestApproved : t.requestRejected}
                    </span>
                    <time dateTime={request.created_at}>{fill(t.requestSent, { date: formatWhen(request.created_at, locale) })}</time>
                  </header>
                  {fields.length > 0 && <p className="vp-request-fields">{fields.join(", ")}</p>}
                  {request.note && (
                    <blockquote>
                      <small>{t.requestNote}</small>
                      {request.note}
                    </blockquote>
                  )}
                </article>
              );
            })}
        </div>
      )}
    </section>
  );

  const previewName = pickLocale(draftValues.name, textLocale);
  const previewMeta = [
    draftValues.venue_type ? typeNames[draftValues.venue_type] ?? draftValues.venue_type : "",
    draftValues.cuisine.slice(0, 3).map((code) => cuisineNames[code] ?? code).join(", "),
    draftValues.price_level ? priceLevelLabel(draftValues.price_level) : "",
    draftValues.average_check ? `~${draftValues.average_check} MDL` : "",
  ].filter(Boolean);
  const previewWeek = parseHoursText(draftValues.hours_text);
  const previewHours = previewWeek ? describeHours(previewWeek, hoursLabelsFor(textLocale)) : draftValues.hours_text;
  const cover = application.photo_urls?.[0];

  const preview = (
    <section className="vp-preview" aria-label={t.previewTitle}>
      <div className="vp-preview-media">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(cover)} alt="" />
        ) : (
          <span className="vp-preview-nophoto"><ImageIcon />{t.previewNoPhoto}</span>
        )}
      </div>
      <div className="vp-preview-body">
        <span className="owner-kicker">
          {t.previewTitle} · {textLocale.toUpperCase()}
        </span>
        <h3>{previewName || <span className="vp-muted">{t.previewNoName}</span>}</h3>
        {previewMeta.length > 0 && <p className="vp-preview-meta">{previewMeta.join(" · ")}</p>}
        {pickLocale(draftValues.address, textLocale) && <p className="vp-preview-line">⌖ {pickLocale(draftValues.address, textLocale)}</p>}
        {previewHours && <p className="vp-preview-line">◷ {previewHours}</p>}
        {pickLocale(draftValues.description, textLocale) && <p className="vp-preview-desc">{pickLocale(draftValues.description, textLocale)}</p>}
        {published && application.venue_id ? (
          <a className="vp-preview-link" href={`/venues/${application.venue_id}`} target="_blank" rel="noreferrer">
            {t.previewOpen}
            <ExternalIcon />
          </a>
        ) : (
          <span className="vp-preview-later">{t.previewAfterPublish}</span>
        )}
      </div>
    </section>
  );

  const footer = editing && (
    <div className="owner-form-footer vp-footer" role="region" aria-label={cabinet.profile}>
      {draftStatus ? (
        <>
          <div className="vp-footer-state">
            <strong>
              {completion}% {cabinet.filled}
              {dirty ? <span className="vp-dot" title={t.unsaved} /> : null}
            </strong>
            <p>
              {[
                dirty
                  ? restoredAt
                    ? fill(t.restoredAt, { time: formatTimeOfDay(restoredAt, locale) })
                    : t.unsaved
                  : savedAt
                    ? fill(t.savedAt, { time: formatTimeOfDay(savedAt, locale) })
                    : "",
                missingNow.length ? fill(t.missing, { list: missingNow.join(", ") }) : t.readyToSubmit,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="owner-form-footer-actions vp-footer-actions">
            {dirty && (
              <button type="button" className="btn btn--ghost btn--md vp-nowrap" disabled={Boolean(saving)} onClick={() => setConfirm("reset")}>
                {t.reset}
              </button>
            )}
            <button type="button" className="btn btn--secondary btn--md vp-nowrap" disabled={Boolean(saving)} onClick={() => void onSave()}>
              {saving === "save" ? ui.loading : cabinet.save}
            </button>
            <button type="button" className="btn btn--primary btn--md vp-nowrap" disabled={Boolean(saving)} onClick={() => void onSubmit()}>
              {saving === "submit" ? ui.loading : cabinet.submit}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="vp-footer-state">
            <strong>
              {dirty ? changesCount : t.noChanges}
              {dirty ? <span className="vp-dot" title={t.unsaved} /> : null}
            </strong>
            <p>{t.publishedHint}</p>
          </div>
          <div className="owner-form-footer-actions vp-footer-actions">
            <button
              type="button"
              className="btn btn--ghost btn--md vp-nowrap"
              disabled={Boolean(saving)}
              onClick={() => (dirty ? setConfirm("discard") : stopEditing())}
            >
              {t.cancel}
            </button>
            <button type="button" className="btn btn--primary btn--md vp-nowrap" disabled={Boolean(saving) || !dirty} onClick={openReview}>
              {t.sendChanges}
            </button>
          </div>
        </>
      )}
    </div>
  );

  const hint = (id: string, text: string) => (
    <p id={id} className="owner-field-hint">
      {text}
    </p>
  );

  return (
    <section className={`owner-profile vp-profile${readOnly ? " is-readonly" : ""}`}>
      {statusBanner}
      {requestsCard}
      {preview}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (draftStatus) void onSave();
        }}
      >
        <div className="owner-form-section">
          <div className="owner-form-title">
            <span>01</span>
            <div>
              <h3>{cabinet.basic}</h3>
              <p>{cabinet.basicHint}</p>
            </div>
          </div>
          <div className="owner-form-fields">
            <LocalizedField
              id="venue-name"
              label={t.nameLabel}
              value={draft.name}
              locale={textLocale}
              onLocaleChange={setTextLocale}
              onChange={(name) => update({ name }, ["name"])}
              readOnly={readOnly}
              required
              maxLength={NAME_MAX}
              error={errorText("name")}
              t={t}
            />
            <LocalizedField
              id="venue-description"
              label={t.descriptionLabel}
              value={draft.description}
              locale={textLocale}
              onLocaleChange={setTextLocale}
              onChange={(description) => update({ description }, ["description"])}
              readOnly={readOnly}
              required
              multiline
              maxLength={DESCRIPTION_MAX}
              placeholder={cabinet.descriptionPlaceholder}
              error={errorText("description")}
              t={t}
            />
            <div className="field owner-field-wide">
              <label htmlFor="venue-type">{cabinet.roles.typeLabel}</label>
              <SelectMenu
                id="venue-type"
                disabled={readOnly}
                value={draft.venue_type}
                placeholder={readOnly ? t.notSet : cabinet.roles.typePlaceholder}
                onChange={(venue_type) => update({ venue_type })}
                ariaDescribedBy={readOnly ? undefined : "venue-type-hint"}
                options={VENUE_TYPE_IDS.map((type) => ({ value: type, label: copy.discover.chips[type] }))}
              />
              {!readOnly && hint("venue-type-hint", published ? cabinet.roles.typeChangeModerated : cabinet.roles.typeHint)}
            </div>
            <CuisinePicker
              key={formKey}
              value={draft.cuisine}
              onChange={(cuisine) => update({ cuisine }, ["cuisine"])}
              readOnly={readOnly}
              error={errorText("cuisine")}
              copy={copy}
            />
          </div>
        </div>

        <div className="owner-form-section">
          <div className="owner-form-title">
            <span>02</span>
            <div>
              <h3>{t.hoursTitle}</h3>
              {!readOnly && <p>{t.hoursHint}</p>}
            </div>
          </div>
          <div className="owner-form-fields">
            <div className="field owner-field-wide">
              <HoursEditor
                key={formKey}
                value={draft.hours_text}
                onChange={(hours_text) => update({ hours_text }, ["hours"])}
                readOnly={readOnly}
                error={errorText("hours")}
                t={t}
                days={copy.hours}
              />
            </div>
          </div>
        </div>

        <div className="owner-form-section">
          <div className="owner-form-title">
            <span>03</span>
            <div>
              <h3>{cabinet.location}</h3>
              <p>{cabinet.locationHint}</p>
            </div>
          </div>
          <div className="owner-form-fields">
            <div className="field owner-field-wide">
              <label htmlFor="venue-city">{ui.city}</label>
              <SelectMenu
                id="venue-city"
                disabled={readOnly}
                value={draft.city_id}
                onChange={(city_id) => {
                  if (city_id === draft.city_id) return;
                  setCityChanged(Boolean(point));
                  update({ city_id, lat: "", lng: "" }, ["point"]);
                }}
                options={[
                  ...(!cities.some((city) => city.id === draft.city_id)
                    ? [{ value: draft.city_id, label: draft.city_id === "city-balti" ? "Bălți" : draft.city_id }]
                    : []),
                  ...cities.map((city) => ({ value: city.id, label: pickLocale(city.name, locale) })),
                ]}
              />
            </div>
            <LocalizedField
              id="venue-address"
              label={t.addressLabel}
              value={draft.address}
              locale={textLocale}
              onLocaleChange={setTextLocale}
              onChange={(address) => update({ address }, ["address"])}
              readOnly={readOnly}
              required
              maxLength={160}
              placeholder={cabinet.addressPlaceholder}
              error={errorText("address")}
              t={t}
            />
            <div className={`owner-location-picker owner-field-wide${errors.point ? " invalid" : ""}`} id="venue-map" tabIndex={-1}>
              <VenueLocationPicker
                key={draft.city_id}
                config={mapConfig}
                center={cityCenter}
                point={point}
                readOnly={readOnly}
                locale={locale}
                onChange={(next) => {
                  setCityChanged(false);
                  update({ lat: String(next.lat), lng: String(next.lng) }, ["point"]);
                }}
              />
              <p>
                <span>
                  {errors.point
                    ? errorText("point")
                    : cityChanged && !point
                      ? t.cityChanged
                      : point
                        ? fill(t.mapCaptionSet, { coords: `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` })
                        : readOnly
                          ? t.notSet
                          : t.mapCaptionEmpty}
                </span>
                <a
                  href={point ? googleMapCoordinates(point) : googleMapSearch(`${pickLocale(draftValues.name, "ru")} ${pickLocale(draftValues.address, "ru")} Moldova`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Maps ↗
                </a>
              </p>
            </div>
            {!readOnly && (
              <details className="vp-coords owner-field-wide" open={Boolean(errors.point === "invalid" || errors.point === "outside")}>
                <summary>{t.manualCoords}</summary>
                <div className="vp-coords-grid">
                  <div className="field">
                    <label htmlFor="venue-lat">{t.latitude}</label>
                    <input
                      id="venue-lat"
                      inputMode="decimal"
                      placeholder="47.7617"
                      value={draft.lat}
                      onChange={(event) => update({ lat: event.target.value }, ["point"])}
                      onBlur={() => checkOnBlur("point")}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="venue-lng">{t.longitude}</label>
                    <input
                      id="venue-lng"
                      inputMode="decimal"
                      placeholder="27.9290"
                      value={draft.lng}
                      onChange={(event) => update({ lng: event.target.value }, ["point"])}
                      onBlur={() => checkOnBlur("point")}
                    />
                  </div>
                </div>
              </details>
            )}
          </div>
        </div>

        <div className="owner-form-section">
          <div className="owner-form-title">
            <span>04</span>
            <div>
              <h3>{cabinet.contacts}</h3>
              <p>{cabinet.contactsHint}</p>
            </div>
          </div>
          <div className="owner-form-fields">
            <div className="field">
              <label htmlFor="venue-phone">
                {t.phoneLabel}
                {!readOnly && <span className="vp-req" aria-hidden="true"> *</span>}
              </label>
              <input
                id="venue-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                readOnly={readOnly}
                placeholder={readOnly ? t.notSet : "+373 69 123 456"}
                value={draft.phone}
                onChange={(event) => update({ phone: event.target.value }, ["phone"])}
                onBlur={() => {
                  if (readOnly) return;
                  if (normalizeMoldovaPhone(draft.phone)) update({ phone: formatMoldovaPhone(draft.phone) });
                  checkOnBlur("phone");
                }}
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={readOnly ? undefined : errors.phone ? "venue-phone-error" : "venue-phone-hint"}
              />
              {errors.phone ? <FieldError id="venue-phone-error">{errorText("phone")}</FieldError> : !readOnly && hint("venue-phone-hint", t.phoneHint)}
            </div>
            <div className="field">
              <label htmlFor="venue-email">
                {t.emailLabel}
                {!readOnly && <span className="vp-req" aria-hidden="true"> *</span>}
              </label>
              <input
                id="venue-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                readOnly={readOnly}
                placeholder={readOnly ? t.notSet : "hello@restaurant.md"}
                value={draft.email}
                onChange={(event) => update({ email: event.target.value }, ["email"])}
                onBlur={() => {
                  if (readOnly) return;
                  if (draft.email !== draft.email.trim()) update({ email: draft.email.trim() });
                  checkOnBlur("email");
                }}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? "venue-email-error" : undefined}
              />
              {errors.email && <FieldError id="venue-email-error">{errorText("email")}</FieldError>}
            </div>
            <div className="field owner-field-wide">
              <label htmlFor="venue-website">
                {t.websiteLabel} {!readOnly && <span className="field-optional">{cabinet.optional}</span>}
              </label>
              {readOnly && draft.website ? (
                <a id="venue-website" className="vp-readonly-link" href={normalizeWebsite(draft.website) || draft.website} target="_blank" rel="noreferrer">
                  {draft.website}
                  <ExternalIcon />
                </a>
              ) : (
                <input
                  id="venue-website"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  readOnly={readOnly}
                  placeholder={readOnly ? t.notSet : "restaurant.md"}
                  value={draft.website}
                  onChange={(event) => update({ website: event.target.value }, ["website"])}
                  onBlur={() => {
                    if (readOnly) return;
                    const normalized = normalizeWebsite(draft.website);
                    if (normalized !== null && normalized !== draft.website) update({ website: normalized });
                    checkOnBlur("website");
                  }}
                  aria-invalid={errors.website ? true : undefined}
                  aria-describedby={readOnly ? undefined : errors.website ? "venue-website-error" : "venue-website-hint"}
                />
              )}
              {errors.website ? <FieldError id="venue-website-error">{errorText("website")}</FieldError> : !readOnly && hint("venue-website-hint", t.websiteHint)}
            </div>
            <div className="field">
              <label htmlFor="venue-price">{t.priceLabel}</label>
              <SelectMenu
                id="venue-price"
                disabled={readOnly}
                value={draft.price_level}
                placeholder={readOnly ? t.notSet : t.pricePlaceholder}
                onChange={(price_level) => update({ price_level })}
                options={[
                  { value: "1", label: cabinet.price1 },
                  { value: "2", label: cabinet.price2 },
                  { value: "3", label: cabinet.price3 },
                ]}
              />
            </div>
            <div className="field">
              <label htmlFor="venue-check">{t.averageLabel}</label>
              <div className="vp-suffix">
                <input
                  id="venue-check"
                  inputMode="numeric"
                  readOnly={readOnly}
                  placeholder={readOnly ? t.notSet : "350"}
                  value={draft.average_check}
                  onChange={(event) => update({ average_check: event.target.value.replace(/\s/g, "") }, ["average_check"])}
                  onBlur={() => !readOnly && checkOnBlur("average_check")}
                  aria-invalid={errors.average_check ? true : undefined}
                  aria-describedby={errors.average_check ? "venue-check-error" : undefined}
                />
                <span aria-hidden="true">MDL</span>
              </div>
              {errors.average_check && <FieldError id="venue-check-error">{errorText("average_check")}</FieldError>}
            </div>
          </div>
        </div>

        <PhotosSection
          application={application}
          editable={draftStatus}
          published={published}
          error={errorText("photos")}
          onApplicationChange={(next) => {
            onApplicationChange(next);
            if (errors.photos) setErrors((current) => ({ ...current, photos: undefined }));
          }}
          onNotice={onNotice}
          onActivityChange={onActivityChange}
          copy={copy}
        />

        {footer}
      </form>

      <div className="owner-danger-zone">
        <div>
          <strong>{ui.dangerZoneTitle}</strong>
          <p>{ui.dangerZoneHint}</p>
        </div>
        <button type="button" className="btn btn--danger-outline btn--md vp-nowrap" disabled={deleteBusy || Boolean(saving)} onClick={onDelete}>
          {ui.deleteVenue}
        </button>
      </div>

      <ReviewDialog
        open={reviewOpen}
        busy={saving === "change"}
        count={changesCount}
        onSend={() => void sendChanges()}
        onClose={() => setReviewOpen(false)}
        t={t}
      >
        <ChangeList changes={changes} before={savedValues} after={draftValues} valueText={valueText} t={t} />
      </ReviewDialog>
      <CabinetConfirmDialog
        open={confirm !== null}
        tone="warning"
        title={confirm === "reset" ? t.resetTitle : t.discardTitle}
        text={confirm === "reset" ? t.resetText : t.discardText}
        confirmLabel={confirm === "reset" ? t.reset : t.discardConfirm}
        cancelLabel={t.keepEditing}
        onConfirm={() => {
          if (confirm === "reset") resetDraft();
          else stopEditing();
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
