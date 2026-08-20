"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import { PanelShell } from "@/components/panel-shell";
import { useLocale } from "@/components/locale-provider";
import { StatusBadge } from "@/components/status-badge";
import {
  ApiError,
  createApplication,
  emptyLocalized,
  fetchMe,
  getToken,
  listApplicationActivity,
  listMyApplications,
  listRestaurantReservations,
  mediaUrl,
  pickLocale,
  removeApplicationPhoto,
  submitApplication,
  updateApplication,
  uploadApplicationPhoto,
  type ApplicationActivity,
  type ApplicationUpdate,
  type RestaurantReservation,
  type User,
  type VenueApplication,
} from "@/lib/api";
import { getSiteCopy } from "@/lib/site-copy";

type Section = "overview" | "profile" | "reservations" | "activity";
type ReservationFilter = "upcoming" | "history" | "all";

const DRAFT_STORAGE_PREFIX = "foodassistant:restaurant-draft:";
const BALTI_CENTER: [number, number] = [27.9289, 47.7622];
const FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

type Draft = {
  name: string;
  description: string;
  address: string;
  cuisine: string;
  phone: string;
  hours_text: string;
  email: string;
  website: string;
  lat: string;
  lng: string;
  price_level: string;
  average_check: string;
};

const navigation: { id: Section; label: string; icon: string }[] = [
  { id: "overview", label: "Обзор", icon: "⌂" },
  { id: "profile", label: "Профиль заведения", icon: "◇" },
  { id: "reservations", label: "Бронирования", icon: "▦" },
  { id: "activity", label: "История действий", icon: "↺" },
];

const activityLabels: Record<string, string> = {
  APPLICATION_CREATED: "Создан черновик ресторана",
  PROFILE_UPDATED: "Обновлены данные ресторана",
  PHOTO_ADDED: "Добавлена фотография",
  PHOTO_REMOVED: "Удалена фотография",
  APPLICATION_SUBMITTED: "Заявка отправлена на модерацию",
  REVIEW_STARTED: "Модератор начал проверку",
  APPLICATION_APPROVED: "Заявка одобрена",
  APPLICATION_REJECTED: "Заявка возвращена на доработку",
  APPLICATION_PUBLISHED: "Ресторан опубликован на карте",
};

const fieldLabels: Record<string, string> = {
  name: "название",
  description: "описание",
  address: "адрес",
  cuisine: "кухня",
  phone: "телефон",
  email: "email",
  website: "сайт ресторана",
  city: "город",
  latitude: "широта",
  longitude: "долгота",
  price_level: "ценовой уровень",
  average_check: "средний чек",
  hours: "часы работы",
  photos: "фотографии",
};

const reservationLabels: Record<string, string> = {
  CONFIRMED: "Подтверждена",
  CHECKED_IN: "Гость пришёл",
  CANCELLED: "Отменена",
  NO_SHOW: "Неявка",
};

const cabinetReferenceTime = Date.now();

function toDraft(app: VenueApplication): Draft {
  return {
    name: pickLocale(app.name, "ru") || "",
    description: pickLocale(app.description, "ru") || "",
    address: pickLocale(app.address, "ru") || "",
    cuisine: (app.cuisine || []).join(", "),
    phone: app.phone || "",
    hours_text: app.hours_text || "",
    email: app.email || "",
    website: app.website || "",
    lat: app.lat ? String(app.lat) : "",
    lng: app.lng ? String(app.lng) : "",
    price_level: app.price_level ? String(app.price_level) : "2",
    average_check: app.average_check ? String(app.average_check) : "",
  };
}

function toPayload(draft: Draft): ApplicationUpdate {
  return {
    name: emptyLocalized(draft.name.trim()),
    description: emptyLocalized(draft.description.trim()),
    address: emptyLocalized(draft.address.trim()),
    cuisine: draft.cuisine
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    phone: draft.phone.trim(),
    hours_text: draft.hours_text.trim(),
    email: draft.email.trim(),
    website: draft.website.trim(),
    lat: Number(draft.lat) || 0,
    lng: Number(draft.lng) || 0,
    price_level: Number(draft.price_level) || 2,
    average_check: Number(draft.average_check) || 0,
  };
}

function storedDraft(applicationId: string): Draft | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${applicationId}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Draft>;
    return {
      name: value.name ?? "",
      description: value.description ?? "",
      address: value.address ?? "",
      cuisine: value.cuisine ?? "",
      phone: value.phone ?? "",
      hours_text: value.hours_text ?? "",
      email: value.email ?? "",
      website: value.website ?? "",
      lat: value.lat ?? "",
      lng: value.lng ?? "",
      price_level: value.price_level ?? "2",
      average_check: value.average_check ?? "",
    };
  } catch {
    return null;
  }
}

function clearStoredDraft(applicationId: string) {
  localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${applicationId}`);
}

function clearStoredDraftWhenPersisted(
  applicationId: string,
  draft: Draft,
  application: VenueApplication,
) {
  const website = draft.website.trim();
  if (website && application.website !== website) {
    localStorage.setItem(
      `${DRAFT_STORAGE_PREFIX}${applicationId}`,
      JSON.stringify(draft),
    );
    return;
  }
  clearStoredDraft(applicationId);
}

function ApplicationLocationPicker({
  lat,
  lng,
  disabled,
  onChange,
  selectedHint,
  editHint,
}: {
  lat: string;
  lng: string;
  disabled: boolean;
  onChange: (lat: string, lng: string) => void;
  selectedHint: string;
  editHint: string;
}) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!mapNodeRef.current) return;
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    const hasPoint = Boolean(parsedLat && parsedLng);
    const center: [number, number] = hasPoint
      ? [parsedLng, parsedLat]
      : BALTI_CENTER;
    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      style: FREE_MAP_STYLE,
      center,
      zoom: hasPoint ? 16 : 13.8,
      minZoom: 11,
      maxZoom: 19,
      attributionControl: false,
      cooperativeGestures: true,
    });
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    const placeMarker = (nextLng: number, nextLat: number, report: boolean) => {
      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({
          color: "#d77b48",
          draggable: !disabled,
        })
          .setLngLat([nextLng, nextLat])
          .addTo(map);
        markerRef.current.on("dragend", () => {
          const point = markerRef.current?.getLngLat();
          if (point) {
            onChangeRef.current(point.lat.toFixed(6), point.lng.toFixed(6));
          }
        });
      } else {
        markerRef.current.setLngLat([nextLng, nextLat]);
      }
      if (report) {
        onChangeRef.current(nextLat.toFixed(6), nextLng.toFixed(6));
      }
    };

    if (hasPoint) placeMarker(parsedLng, parsedLat, false);
    if (!disabled) {
      map.on("click", (event) => {
        placeMarker(event.lngLat.lng, event.lngLat.lat, true);
      });
    }

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // Recreate only when the profile becomes editable/read-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  useEffect(() => {
    const map = mapRef.current;
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!map || !parsedLat || !parsedLng) return;
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({
        color: "#d77b48",
        draggable: !disabled,
      })
        .setLngLat([parsedLng, parsedLat])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([parsedLng, parsedLat]);
    }
  }, [disabled, lat, lng]);

  return (
    <div className="owner-location-picker owner-field-wide">
      <div ref={mapNodeRef} className="owner-location-map" />
      <p>
        <span>⌖</span>
        {disabled ? selectedHint : editHint}
      </p>
    </div>
  );
}

function editable(status: string) {
  return status === "DRAFT" || status === "REJECTED";
}

function setupChecks(app: VenueApplication, draft?: Draft | null) {
  return [
    {
      label: "Название и описание",
      done: Boolean(
        (draft?.name ?? pickLocale(app.name, "ru")) &&
          (draft?.description ?? pickLocale(app.description, "ru")),
      ),
    },
    { label: "Адрес", done: Boolean(draft?.address ?? pickLocale(app.address, "ru")) },
    {
      label: "Точка на карте",
      done: Boolean(
        draft ? Number(draft.lat) && Number(draft.lng) : app.lat && app.lng,
      ),
    },
    {
      label: "Кухня",
      done: Boolean(draft ? draft.cuisine.trim() : app.cuisine?.length),
    },
    {
      label: "Контакты",
      done: Boolean(draft ? draft.phone.trim() && draft.email.trim() : app.phone && app.email),
    },
    { label: "Часы работы", done: Boolean(draft?.hours_text ?? app.hours_text) },
    { label: "Фотографии", done: Boolean(app.photo_urls?.length) },
  ];
}

function statusHint(status: string) {
  if (status === "PUBLISHED") return "Заведение видно гостям и принимает брони.";
  if (status === "APPROVED") return "Проверка завершена. Платформа готовит публикацию.";
  if (status === "UNDER_REVIEW") return "Модератор проверяет данные. Обычно это занимает 1–3 дня.";
  if (status === "SUBMITTED") return "Заявка получена и ожидает начала проверки.";
  if (status === "REJECTED") return "Исправьте замечание и отправьте заявку повторно.";
  return "Заполните обязательные данные и отправьте профиль на модерацию.";
}

function editLockHint(status: string) {
  if (status === "PUBLISHED") {
    return "Профиль опубликован. Изменение данных работающего ресторана будет оформляться отдельной заявкой.";
  }
  if (status === "APPROVED") {
    return "Профиль одобрен и ожидает публикации платформой.";
  }
  return "Редактирование временно закрыто, пока заявка проходит проверку.";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function initials(user: User) {
  return `${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`.toUpperCase() || "VR";
}

export default function CabinetPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const cabinetCopy = getSiteCopy(locale).cabinet;
  const [user, setUser] = useState<User | null>(null);
  const [apps, setApps] = useState<VenueApplication[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [reservations, setReservations] = useState<RestaurantReservation[]>([]);
  const [reservationFilter, setReservationFilter] =
    useState<ReservationFilter>("upcoming");
  const [activity, setActivity] = useState<ApplicationActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draftApplicationRef = useRef<string | null>(null);

  const selected = apps.find((app) => app.id === selectedId) ?? null;

  const load = useCallback(async () => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    try {
      const me = await fetchMe();
      if (me.role !== "restaurant" && me.role !== "admin") {
        router.replace("/");
        return;
      }
      const [applicationList, bookingList] = await Promise.all([
        listMyApplications(),
        listRestaurantReservations(),
      ]);
      setUser(me);
      setApps(applicationList);
      setReservations(bookingList);
      setSelectedId((current) => {
        if (current && applicationList.some((app) => app.id === current)) return current;
        return applicationList[0]?.id ?? null;
      });
    } catch {
      router.replace("/login");
    }
  }, [router]);

  const refreshActivity = useCallback(async (applicationId: string) => {
    setActivityLoading(true);
    try {
      setActivity(await listApplicationActivity(applicationId));
    } catch {
      setActivity([]);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextId = selected?.id ?? null;
      if (draftApplicationRef.current !== nextId) {
        draftApplicationRef.current = nextId;
        setDraft(
          selected ? storedDraft(selected.id) ?? toDraft(selected) : null,
        );
      }
      if (selected) void refreshActivity(selected.id);
      else setActivity([]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selected, refreshActivity]);

  useEffect(() => {
    if (!selectedId || !draft || draftApplicationRef.current !== selectedId) {
      return;
    }
    const timer = window.setTimeout(() => {
      localStorage.setItem(
        `${DRAFT_STORAGE_PREFIX}${selectedId}`,
        JSON.stringify(draft),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, selectedId]);

  const selectedReservations = useMemo(
    () =>
      selected?.venue_id
        ? reservations.filter((reservation) => reservation.venue_id === selected.venue_id)
        : [],
    [reservations, selected],
  );

  const filteredReservations = useMemo(() => {
    return selectedReservations.filter((reservation) => {
      if (reservationFilter === "all") return true;
      const isHistory =
        new Date(reservation.reserved_for).getTime() < cabinetReferenceTime ||
        reservation.status === "CANCELLED" ||
        reservation.status === "NO_SHOW";
      return reservationFilter === "history" ? isHistory : !isHistory;
    });
  }, [reservationFilter, selectedReservations]);

  function showApiError(value: unknown, fallback: string) {
    if (value instanceof ApiError && value.code === "incomplete") {
      const missing = selected
        ? setupChecks(selected, draft)
            .filter((check) => !check.done)
            .map((check) => check.label.toLowerCase())
        : [];
      setError(
        missing.length
          ? `Осталось заполнить: ${missing.join(", ")}.`
          : "Проверьте обязательные данные перед отправкой.",
      );
      return;
    }
    if (value instanceof ApiError && value.code === "invalid_fields") {
      setError("Проверьте email, сайт, координаты, ценовой уровень и средний чек.");
      return;
    }
    setError(value instanceof ApiError ? value.code : fallback);
  }

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const app = await createApplication();
      setApps((current) => [app, ...current]);
      setSelectedId(app.id);
      setSection("profile");
      setMsg("Черновик создан. Начните с основных данных.");
    } catch (value) {
      showApiError(value, "Не удалось создать ресторан");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!selected || !draft || !editable(selected.status)) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateApplication(selected.id, toPayload(draft));
      setApps((current) => current.map((app) => (app.id === updated.id ? updated : app)));
      clearStoredDraftWhenPersisted(selected.id, draft, updated);
      setMsg("Изменения сохранены");
      await refreshActivity(selected.id);
    } catch (value) {
      showApiError(value, "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (!selected || !draft || !editable(selected.status)) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await updateApplication(selected.id, toPayload(draft));
      setApps((current) => current.map((app) => (app.id === saved.id ? saved : app)));
      const updated = await submitApplication(selected.id);
      setApps((current) => current.map((app) => (app.id === updated.id ? updated : app)));
      clearStoredDraftWhenPersisted(selected.id, draft, updated);
      setSection("overview");
      setMsg("Заявка отправлена на модерацию");
      await refreshActivity(selected.id);
    } catch (value) {
      showApiError(value, "Ошибка отправки");
    } finally {
      setBusy(false);
    }
  }

  async function onPhoto(file: File | null) {
    if (!selected || !file || !editable(selected.status)) return;
    setBusy(true);
    setError(null);
    try {
      if (draft) {
        const saved = await updateApplication(selected.id, toPayload(draft));
        setApps((current) =>
          current.map((app) => (app.id === saved.id ? saved : app)),
        );
      }
      const updated = await uploadApplicationPhoto(selected.id, file);
      setApps((current) => current.map((app) => (app.id === updated.id ? updated : app)));
      if (draft) clearStoredDraftWhenPersisted(selected.id, draft, updated);
      setMsg("Фотография добавлена");
      await refreshActivity(selected.id);
    } catch (value) {
      showApiError(value, "Ошибка загрузки фото");
    } finally {
      setBusy(false);
    }
  }

  async function onRemovePhoto(url: string) {
    if (!selected || !editable(selected.status)) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await removeApplicationPhoto(selected.id, url);
      setApps((current) => current.map((app) => (app.id === updated.id ? updated : app)));
      setMsg("Фотография удалена");
      await refreshActivity(selected.id);
    } catch (value) {
      showApiError(value, "Ошибка удаления");
    } finally {
      setBusy(false);
    }
  }

  function updateDraft<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  if (!user) {
    return (
      <div className="panel-page owner-loading">
        <span />
        <p>Открываем кабинет…</p>
      </div>
    );
  }

  const checks = selected ? setupChecks(selected, draft) : [];
  const completedChecks = checks.filter((check) => check.done).length;
  const missingChecks = checks.filter((check) => !check.done);
  const completion = checks.length ? Math.round((completedChecks / checks.length) * 100) : 0;
  const canEdit = selected ? editable(selected.status) : false;
  const futureBookings = selectedReservations.filter(
    (reservation) =>
      new Date(reservation.reserved_for).getTime() >= cabinetReferenceTime &&
      reservation.status !== "CANCELLED",
  );

  return (
    <PanelShell
      title={cabinetCopy.title}
      subtitle={cabinetCopy.subtitle}
      email={user.email}
    >
      <div className="owner-dashboard">
        <aside className="owner-sidebar">
          <div className="owner-person">
            <span className="owner-avatar">{initials(user)}</span>
            <div>
              <strong>{user.display_name || `${user.first_name} ${user.last_name}`}</strong>
              <span>{cabinetCopy.owner}</span>
            </div>
          </div>

          <div className="owner-venue-switcher">
            <span>{cabinetCopy.venues}</span>
            {apps.map((app) => (
              <button
                key={app.id}
                type="button"
                className={app.id === selectedId ? "active" : ""}
                onClick={() => {
                  setSelectedId(app.id);
                  setSection("overview");
                  setMsg(null);
                  setError(null);
                }}
              >
                <i>{(pickLocale(app.name, "ru") || "Р").slice(0, 1).toUpperCase()}</i>
                <span>{pickLocale(app.name, "ru") || "Новый ресторан"}</span>
                <b aria-hidden>›</b>
              </button>
            ))}
            <button
              type="button"
              className="owner-add-venue"
              disabled={busy}
              onClick={() => void onCreate()}
            >
              <i>+</i>
              <span>{cabinetCopy.add}</span>
            </button>
          </div>

          {selected && (
            <nav className="owner-nav" aria-label="Разделы кабинета">
              {navigation.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={section === item.id ? "active" : ""}
                  onClick={() => setSection(item.id)}
                >
                  <i aria-hidden>{item.icon}</i>
                  <span>{cabinetCopy[item.id]}</span>
                  {item.id === "reservations" && futureBookings.length > 0 && (
                    <b>{futureBookings.length}</b>
                  )}
                </button>
              ))}
            </nav>
          )}

          <div className="owner-support">
            <span>Нужна помощь?</span>
            <p>Команда подключения поможет подготовить профиль.</p>
            <a href="mailto:partners@foodassistant.md">Связаться с поддержкой</a>
          </div>
        </aside>

        <main className="owner-content">
          {(msg || error) && (
            <div className={`owner-notice ${error ? "error" : "success"}`}>
              <span>{error ? "!" : "✓"}</span>
              <p>{error || msg}</p>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => {
                  setError(null);
                  setMsg(null);
                }}
              >
                ×
              </button>
            </div>
          )}

          {!selected ? (
            <section className="owner-empty-state">
              <span className="owner-empty-mark">FA</span>
              <span className="owner-kicker">Первый шаг</span>
              <h2>Добавьте свой ресторан</h2>
              <p>
                Создайте профиль заведения, укажите точку на карте и отправьте
                данные на проверку. Черновик можно сохранять сколько угодно раз.
              </p>
              <button
                type="button"
                className="panel-btn"
                disabled={busy}
                onClick={() => void onCreate()}
              >
                + Создать профиль ресторана
              </button>
              <div className="owner-empty-assurances">
                <span>Без оплаты на этапе заявки</span>
                <span>Проверка 1–3 рабочих дня</span>
                <span>Поддержка при заполнении</span>
              </div>
            </section>
          ) : (
            <>
              <header className="owner-section-head">
                <div>
                  <span className="owner-kicker">
                    {section === "overview" && "Центр управления"}
                    {section === "profile" && cabinetCopy.dataForGuests}
                    {section === "reservations" && "Операционная работа"}
                    {section === "activity" && "Прозрачность аккаунта"}
                  </span>
                  <h2>
                    {section === "overview" && (pickLocale(selected.name, "ru") || "Новый ресторан")}
                    {section === "profile" && cabinetCopy.profile}
                    {section === "reservations" && "Бронирования"}
                    {section === "activity" && "История действий"}
                  </h2>
                </div>
                <div className="owner-section-status">
                  <span>{cabinetCopy.status}</span>
                  <StatusBadge status={selected.status} />
                </div>
              </header>

              {section === "overview" && (
                <div className="owner-overview">
                  <section className="owner-overview-hero">
                    <div>
                      <span className="owner-kicker">
                        {selected.status === "PUBLISHED" ? "Ресторан работает" : "Подготовка к запуску"}
                      </span>
                      <h3>{statusHint(selected.status)}</h3>
                      <div className="owner-hero-actions">
                        {canEdit && (
                          <button
                            type="button"
                            className="panel-btn"
                            onClick={() => setSection("profile")}
                          >
                            Продолжить заполнение
                          </button>
                        )}
                        {selected.status === "PUBLISHED" && (
                          <Link className="panel-btn" href="/#map">
                            Посмотреть на карте
                          </Link>
                        )}
                        <button
                          type="button"
                          className="panel-btn ghost"
                          onClick={() => setSection("activity")}
                        >
                          Проверить историю
                        </button>
                      </div>
                    </div>
                    <div
                      className="owner-progress-ring"
                      style={{
                        background: `conic-gradient(#d77b48 ${completion * 3.6}deg, rgba(255,255,255,.16) 0deg)`,
                      }}
                    >
                      <span>
                        <strong>{completion}%</strong>
                        <small>готово</small>
                      </span>
                    </div>
                  </section>

                  <section className="owner-metrics">
                    <article>
                      <span>Будущие брони</span>
                      <strong>{futureBookings.length}</strong>
                      <small>по выбранному ресторану</small>
                    </article>
                    <article>
                      <span>Всего бронирований</span>
                      <strong>{selectedReservations.length}</strong>
                      <small>включая историю</small>
                    </article>
                    <article>
                      <span>Фотографии</span>
                      <strong>{selected.photo_urls?.length || 0}<i>/8</i></strong>
                      <small>в профиле заведения</small>
                    </article>
                    <article>
                      <span>Последнее изменение</span>
                      <strong className="owner-metric-date">
                        {new Date(selected.updated_at).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "short",
                        })}
                      </strong>
                      <small>{new Date(selected.updated_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</small>
                    </article>
                  </section>

                  <div className="owner-overview-grid">
                    <section className="owner-card owner-checklist-card">
                      <div className="owner-card-head">
                        <div>
                          <span className="owner-kicker">Готовность профиля</span>
                          <h3>{completedChecks} из {checks.length} пунктов</h3>
                        </div>
                        <strong>{completion}%</strong>
                      </div>
                      <div className="owner-progress-bar"><i style={{ width: `${completion}%` }} /></div>
                      <ul>
                        {checks.map((check) => (
                          <li key={check.label} className={check.done ? "done" : ""}>
                            <span>{check.done ? "✓" : ""}</span>
                            <p>{check.label}</p>
                            {!check.done && canEdit && (
                              <button type="button" onClick={() => setSection("profile")}>Заполнить</button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section className="owner-card owner-launch-card">
                      <div className="owner-card-head">
                        <div>
                          <span className="owner-kicker">Путь подключения</span>
                          <h3>От профиля до карты</h3>
                        </div>
                      </div>
                      <div className="owner-launch-steps">
                        {[
                          ["DRAFT", "Профиль", "Данные и фотографии"],
                          ["SUBMITTED", "Заявка", "Передана платформе"],
                          ["UNDER_REVIEW", "Проверка", "1–3 рабочих дня"],
                          ["APPROVED", "Одобрение", "Подготовка публикации"],
                          ["PUBLISHED", "На карте", "Доступно гостям"],
                        ].map(([status, label, detail], index, stages) => {
                          const stageOrder = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "PUBLISHED"];
                          const normalized = selected.status === "REJECTED" ? "DRAFT" : selected.status;
                          const currentIndex = stageOrder.indexOf(normalized);
                          const active = index <= currentIndex;
                          return (
                            <div key={status} className={active ? "active" : ""}>
                              <span>{active ? "✓" : index + 1}</span>
                              <p><strong>{label}</strong><small>{detail}</small></p>
                              {index < stages.length - 1 && <i />}
                            </div>
                          );
                        })}
                      </div>
                      {selected.reject_reason && (
                        <div className="owner-review-note">
                          <strong>Комментарий модератора</strong>
                          <p>{selected.reject_reason}</p>
                        </div>
                      )}
                    </section>
                  </div>

                  <section className="owner-card owner-recent-card">
                    <div className="owner-card-head">
                      <div>
                        <span className="owner-kicker">Ближайшие гости</span>
                        <h3>Следующие бронирования</h3>
                      </div>
                      <button type="button" onClick={() => setSection("reservations")}>Все брони →</button>
                    </div>
                    {futureBookings.length === 0 ? (
                      <div className="owner-inline-empty">
                        <span>▦</span>
                        <p>{selected.venue_id ? "Новых броней пока нет." : "Бронирования появятся после публикации ресторана."}</p>
                      </div>
                    ) : (
                      <div className="owner-booking-list compact">
                        {futureBookings.slice(0, 3).map((reservation) => (
                          <ReservationRow key={reservation.id} reservation={reservation} />
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {section === "profile" && draft && (
                <section className="owner-profile">
                  {!canEdit && (
                    <div className="owner-lock-note">
                      <span>⌁</span>
                      <p>{editLockHint(selected.status)}</p>
                    </div>
                  )}
                  <div className="owner-form-section">
                    <div className="owner-form-title">
                      <span>01</span>
                      <div><h3>{cabinetCopy.basic}</h3><p>{cabinetCopy.basicHint}</p></div>
                    </div>
                    <div className="owner-form-fields">
                      <div className="field owner-field-wide">
                        <label htmlFor="venue-name">{cabinetCopy.name}</label>
                        <input id="venue-name" disabled={!canEdit} value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} />
                      </div>
                      <div className="field owner-field-wide">
                        <label htmlFor="venue-description">{cabinetCopy.description}</label>
                        <textarea id="venue-description" disabled={!canEdit} maxLength={400} placeholder={cabinetCopy.descriptionPlaceholder} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} />
                        <small>{draft.description.length}/400</small>
                      </div>
                      <div className="field">
                        <label htmlFor="venue-cuisine">{cabinetCopy.cuisine}</label>
                        <input id="venue-cuisine" disabled={!canEdit} placeholder={cabinetCopy.cuisinePlaceholder} value={draft.cuisine} onChange={(event) => updateDraft("cuisine", event.target.value)} />
                      </div>
                      <div className="field">
                        <label htmlFor="venue-hours">{cabinetCopy.hours}</label>
                        <input id="venue-hours" disabled={!canEdit} placeholder={cabinetCopy.hoursPlaceholder} value={draft.hours_text} onChange={(event) => updateDraft("hours_text", event.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="owner-form-section">
                    <div className="owner-form-title">
                      <span>02</span>
                      <div><h3>{cabinetCopy.location}</h3><p>{cabinetCopy.locationHint}</p></div>
                    </div>
                    <div className="owner-form-fields">
                      <div className="field owner-field-wide">
                        <label htmlFor="venue-address">{cabinetCopy.address}</label>
                        <input id="venue-address" disabled={!canEdit} placeholder={cabinetCopy.addressPlaceholder} value={draft.address} onChange={(event) => updateDraft("address", event.target.value)} />
                      </div>
                      <div className="field">
                        <label htmlFor="venue-lat">{cabinetCopy.latitude}</label>
                        <input id="venue-lat" type="number" step="0.000001" disabled={!canEdit} placeholder="47.7617" value={draft.lat} onChange={(event) => updateDraft("lat", event.target.value)} />
                      </div>
                      <div className="field">
                        <label htmlFor="venue-lng">{cabinetCopy.longitude}</label>
                        <input id="venue-lng" type="number" step="0.000001" disabled={!canEdit} placeholder="27.9288" value={draft.lng} onChange={(event) => updateDraft("lng", event.target.value)} />
                      </div>
                      <ApplicationLocationPicker
                        lat={draft.lat}
                        lng={draft.lng}
                        disabled={!canEdit}
                        selectedHint={cabinetCopy.mapPoint}
                        editHint={cabinetCopy.mapHint}
                        onChange={(nextLat, nextLng) => {
                          setDraft((current) =>
                            current
                              ? { ...current, lat: nextLat, lng: nextLng }
                              : current,
                          );
                        }}
                      />
                    </div>
                  </div>

                  <div className="owner-form-section">
                    <div className="owner-form-title">
                      <span>03</span>
                      <div><h3>{cabinetCopy.contacts}</h3><p>{cabinetCopy.contactsHint}</p></div>
                    </div>
                    <div className="owner-form-fields">
                      <div className="field">
                        <label htmlFor="venue-phone">{cabinetCopy.phone}</label>
                        <input id="venue-phone" type="tel" disabled={!canEdit} placeholder="+373 600 00 000" value={draft.phone} onChange={(event) => updateDraft("phone", event.target.value)} />
                      </div>
                      <div className="field">
                        <label htmlFor="venue-email">{cabinetCopy.email}</label>
                        <input id="venue-email" type="email" disabled={!canEdit} value={draft.email} onChange={(event) => updateDraft("email", event.target.value)} />
                      </div>
                      <div className="field owner-field-wide">
                        <label htmlFor="venue-website">{cabinetCopy.website} <span className="field-optional">{cabinetCopy.optional}</span></label>
                        <input
                          id="venue-website"
                          type="url"
                          inputMode="url"
                          autoComplete="url"
                          disabled={!canEdit}
                          placeholder="https://restaurant.md"
                          value={draft.website}
                          onChange={(event) => updateDraft("website", event.target.value)}
                        />
                        <small>{cabinetCopy.websiteHint}</small>
                      </div>
                      <div className="field">
                        <label htmlFor="venue-price">{cabinetCopy.price}</label>
                        <select id="venue-price" disabled={!canEdit} value={draft.price_level} onChange={(event) => updateDraft("price_level", event.target.value)}>
                          <option value="1">{cabinetCopy.price1}</option>
                          <option value="2">{cabinetCopy.price2}</option>
                          <option value="3">{cabinetCopy.price3}</option>
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="venue-check">{cabinetCopy.average}</label>
                        <input id="venue-check" type="number" min="0" disabled={!canEdit} placeholder="350" value={draft.average_check} onChange={(event) => updateDraft("average_check", event.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="owner-form-section">
                    <div className="owner-form-title">
                      <span>04</span>
                      <div><h3>{cabinetCopy.photos}</h3><p>{cabinetCopy.photosHint}</p></div>
                    </div>
                    <div className="owner-photo-area">
                      <div className="photo-grid owner-photo-grid">
                        {(selected.photo_urls || []).map((url, index) => (
                          <div key={url} className="photo-thumb owner-photo-thumb">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={mediaUrl(url)} alt={`Фото ресторана ${index + 1}`} />
                            {index === 0 && <span>{cabinetCopy.cover}</span>}
                            {canEdit && (
                              <button type="button" aria-label="Удалить фото" onClick={() => void onRemovePhoto(url)}>×</button>
                            )}
                          </div>
                        ))}
                        {canEdit && (selected.photo_urls?.length || 0) < 8 && (
                          <label className="owner-photo-upload">
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(event) => {
                                void onPhoto(event.target.files?.[0] ?? null);
                                event.target.value = "";
                              }}
                            />
                            <span>＋</span>
                            <strong>{cabinetCopy.addPhoto}</strong>
                            <small>JPG, PNG или WebP · до 5 МБ</small>
                          </label>
                        )}
                      </div>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="owner-form-footer">
                      <div>
                        <strong>{completion}% {cabinetCopy.filled}</strong>
                        <p>
                          {missingChecks.length
                            ? `Осталось: ${missingChecks.map((check) => check.label).join(", ")}.`
                            : cabinetCopy.ready}
                        </p>
                      </div>
                      <div>
                        <button type="button" className="panel-btn ghost" disabled={busy} onClick={() => void onSave()}>{cabinetCopy.save}</button>
                        <button type="button" className="panel-btn" disabled={busy || missingChecks.length > 0} onClick={() => void onSubmit()}>{cabinetCopy.submit}</button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {section === "reservations" && (
                <section className="owner-reservations">
                  <div className="owner-filter-row">
                    <div className="owner-filters" role="group" aria-label="Фильтр бронирований">
                      {([
                        ["upcoming", "Предстоящие"],
                        ["history", "История"],
                        ["all", "Все"],
                      ] as const).map(([value, label]) => (
                        <button key={value} type="button" className={reservationFilter === value ? "active" : ""} onClick={() => setReservationFilter(value)}>{label}</button>
                      ))}
                    </div>
                    <span>{filteredReservations.length} записей</span>
                  </div>
                  {!selected.venue_id ? (
                    <div className="owner-section-empty">
                      <span>▦</span>
                      <h3>Брони откроются после публикации</h3>
                      <p>Когда ресторан появится на карте, новые бронирования автоматически будут доступны здесь.</p>
                    </div>
                  ) : filteredReservations.length === 0 ? (
                    <div className="owner-section-empty">
                      <span>▦</span>
                      <h3>В этом разделе пока пусто</h3>
                      <p>Новые брони появятся здесь сразу после подтверждения гостем.</p>
                    </div>
                  ) : (
                    <div className="owner-card owner-booking-list">
                      {filteredReservations.map((reservation) => (
                        <ReservationRow key={reservation.id} reservation={reservation} />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {section === "activity" && (
                <section className="owner-activity">
                  <div className="owner-audit-intro">
                    <span>✓</span>
                    <div>
                      <strong>Журнал ведётся автоматически</strong>
                      <p>Сохраняются изменения профиля, фотографии и решения модератора. Записи нельзя редактировать из кабинета.</p>
                    </div>
                  </div>
                  {activityLoading ? (
                    <div className="owner-section-empty"><p>Загружаем историю…</p></div>
                  ) : activity.length === 0 ? (
                    <div className="owner-section-empty"><span>↺</span><h3>История пока пуста</h3></div>
                  ) : (
                    <div className="owner-card owner-timeline">
                      {activity.map((entry) => (
                        <article key={entry.id}>
                          <div className="owner-timeline-mark"><span>{entry.actor_role === "admin" ? "FA" : initials(user)}</span><i /></div>
                          <div className="owner-timeline-content">
                            <div>
                              <strong>{activityLabels[entry.action] || entry.action}</strong>
                              <time>{formatDateTime(entry.created_at)}</time>
                            </div>
                            <p>{entry.actor_role === "admin" ? "Команда FoodAssistant" : user.display_name || "Владелец ресторана"}</p>
                            {entry.changed_fields?.length > 0 && (
                              <small>Изменено: {entry.changed_fields.map((field) => fieldLabels[field] || field).join(", ")}</small>
                            )}
                            {entry.note && <blockquote>{entry.note}</blockquote>}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </PanelShell>
  );
}

function ReservationRow({ reservation }: { reservation: RestaurantReservation }) {
  const bookingDate = new Date(reservation.reserved_for);
  const statusClass = reservation.status.toLowerCase().replace("_", "-");
  return (
    <article className="owner-booking-row">
      <div className="owner-booking-date">
        <strong>{bookingDate.toLocaleDateString("ru-RU", { day: "2-digit" })}</strong>
        <span>{bookingDate.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}</span>
      </div>
      <div className="owner-booking-time">
        <strong>{bookingDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</strong>
        <span>Стол №{reservation.table_number || "—"}</span>
      </div>
      <div className="owner-booking-guest">
        <span>{(reservation.guest_name || "Г").slice(0, 1).toUpperCase()}</span>
        <p><strong>{reservation.guest_name || "Гость"}</strong><small>{reservation.guest_email}</small></p>
      </div>
      <div className="owner-booking-party">
        <strong>{reservation.guests}</strong>
        <span>{reservation.guests === 1 ? "гость" : "гостей"}</span>
      </div>
      <span className={`owner-reservation-status ${statusClass}`}>{reservationLabels[reservation.status] || reservation.status}</span>
    </article>
  );
}
