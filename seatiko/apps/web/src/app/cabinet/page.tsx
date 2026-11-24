"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import { PanelShell } from "@/components/panel-shell";
import { GoogleLocationPicker } from "@/components/google-location-picker";
import { googleMapCoordinates, googleMapSearch } from "@/lib/google-map";
import {
  CabinetFloorPanel,
  CabinetMenuPanel,
  CabinetRulesPanel,
  CabinetStaffPanel,
} from "@/components/cabinet-ops";
import { useLocale } from "@/components/locale-provider";
import { StatusBadge } from "@/components/status-badge";
import {
  ApiError,
  createApplication,
  emptyLocalized,
  fetchMe,
  fetchMapConfig,
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
  type LocaleCode,
  type MapConfig,
  type MapCoordinates,
  type RestaurantReservation,
  type User,
  type VenueApplication,
} from "@/lib/api";
import { getSiteCopy } from "@/lib/site-copy";

type Section =
  | "overview"
  | "profile"
  | "floor"
  | "menu"
  | "rules"
  | "staff"
  | "reservations"
  | "activity";
type ReservationFilter = "upcoming" | "history" | "all";

const DRAFT_STORAGE_PREFIX = "seatiko:restaurant-draft:";
const BALTI_CENTER: MapCoordinates = { lat: 47.7622, lng: 27.9289 };
const FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

type Draft = {
  name: string;
  description: string;
  address: string;
  city_id: string;
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

/* Modern SVG Icons for crisp, accessible UI */
function OverviewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="7" height="9" x="3" y="3" rx="1.5" />
      <rect width="7" height="5" x="14" y="3" rx="1.5" />
      <rect width="7" height="9" x="14" y="12" rx="1.5" />
      <rect width="7" height="5" x="3" y="16" rx="1.5" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5 12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function FloorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M6 6h10" />
      <path d="M6 10h10" />
      <path d="M6 14h6" />
    </svg>
  );
}

function RulesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
}

function StaffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ReservationsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

const cabinetReferenceTime = Date.now();

function toDraft(app: VenueApplication, locale: LocaleCode): Draft {
  return {
    name: pickLocale(app.name, locale) || pickLocale(app.name, "ru") || "",
    description: pickLocale(app.description, locale) || pickLocale(app.description, "ru") || "",
    address: pickLocale(app.address, locale) || pickLocale(app.address, "ru") || "",
    city_id: app.city_id,
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
    city_id: draft.city_id,
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

function storedDraft(applicationId: string, cityId: string): Draft | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${applicationId}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Draft>;
    return {
      name: value.name ?? "",
      description: value.description ?? "",
      address: value.address ?? "",
      city_id: value.city_id ?? cityId,
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
  config, center, query, lat, lng, disabled, onChange, selectedHint, editHint,
}: {
  config: MapConfig | null;
  center: MapCoordinates;
  query: string;
  lat: string;
  lng: string;
  disabled: boolean;
  onChange: (lat: string, lng: string) => void;
  selectedHint: string;
  editHint: string;
}) {
  const [googleFailed, setGoogleFailed] = useState(false);
  const fallback = useCallback(() => setGoogleFailed(true), []);
  const point = useMemo(() => {
    const latitude = Number(lat);
    const longitude = Number(lng);
    return latitude >= 45.45 && latitude <= 48.55 && longitude >= 26.60 && longitude <= 30.20
      ? { lat: latitude, lng: longitude }
      : null;
  }, [lat, lng]);

  return (
    <div className="owner-location-picker owner-field-wide">
      {config?.google_maps_key && !googleFailed ? (
        <GoogleLocationPicker
          apiKey={config.google_maps_key} mapId={config.google_maps_id} center={center}
          point={point} disabled={disabled} onError={fallback}
          onChange={(next) => onChange(next.lat.toFixed(6), next.lng.toFixed(6))}
        />
      ) : (
        <OpenLocationPicker lat={lat} lng={lng} disabled={disabled} onChange={onChange} center={center} />
      )}
      <p>
        {disabled ? selectedHint : editHint}{" "}
        <a href={point ? googleMapCoordinates(point) : googleMapSearch(query)} target="_blank" rel="noreferrer">
          Google Maps ↗
        </a>
      </p>
    </div>
  );
}

function OpenLocationPicker({
  lat,
  lng,
  disabled,
  onChange,
  center,
}: {
  lat: string;
  lng: string;
  disabled: boolean;
  onChange: (lat: string, lng: string) => void;
  center: MapCoordinates;
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
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapNodeRef.current,
        style: FREE_MAP_STYLE,
        center: hasPoint ? [parsedLng, parsedLat] : [center.lng, center.lat],
        zoom: hasPoint ? 16 : 13.8,
        minZoom: 8,
        maxZoom: 19,
        attributionControl: false,
        cooperativeGestures: true,
      });
    } catch {
      return;
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, center]);

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

  return <div ref={mapNodeRef} className="owner-location-map" />;
}

function editable(status: string) {
  return status === "DRAFT" || status === "REJECTED";
}

function getSetupChecks(
  app: VenueApplication,
  draft: Draft | null,
  copy: ReturnType<typeof getSiteCopy>["cabinet"],
  locale: LocaleCode,
) {
  return [
    {
      label: copy.checkNameDesc,
      done: Boolean(
        (draft?.name ?? pickLocale(app.name, locale)) &&
          (draft?.description ?? pickLocale(app.description, locale)),
      ),
    },
    { label: copy.checkAddress, done: Boolean(draft?.address ?? pickLocale(app.address, locale)) },
    {
      label: copy.checkMapPoint,
      done: Boolean(
        draft ? Number(draft.lat) && Number(draft.lng) : app.lat && app.lng,
      ),
    },
    {
      label: copy.checkCuisine,
      done: Boolean(draft ? draft.cuisine.trim() : app.cuisine?.length),
    },
    {
      label: copy.checkContacts,
      done: Boolean(draft ? draft.phone.trim() && draft.email.trim() : app.phone && app.email),
    },
    { label: copy.checkHours, done: Boolean(draft?.hours_text ?? app.hours_text) },
    { label: copy.checkPhotos, done: Boolean(app.photo_urls?.length) },
  ];
}

function getStatusHint(status: string, copy: ReturnType<typeof getSiteCopy>["cabinet"]) {
  if (status === "PUBLISHED") return copy.statusHintPublished;
  if (status === "APPROVED") return copy.statusHintApproved;
  if (status === "UNDER_REVIEW") return copy.statusHintUnderReview;
  if (status === "SUBMITTED") return copy.statusHintSubmitted;
  if (status === "REJECTED") return copy.statusHintRejected;
  return copy.statusHintDraft;
}

function getEditLockHint(status: string, copy: ReturnType<typeof getSiteCopy>["cabinet"]) {
  if (status === "PUBLISHED") return copy.lockHintPublished;
  if (status === "APPROVED") return copy.lockHintApproved;
  return copy.lockHintReview;
}

function formatDateTime(value: string, locale: string) {
  const loc = locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU";
  return new Intl.DateTimeFormat(loc, {
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
  const [mapConfig, setMapConfig] = useState<MapConfig | null>(null);

  useEffect(() => {
    let active = true;
    fetchMapConfig().then((config) => { if (active) setMapConfig(config); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const locations = mapConfig?.cities.filter((city) => city.country === "MD") ?? [];
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

  const navigation: { id: Section; label: string; icon: React.ReactNode }[] = useMemo(
    () => [
      { id: "overview", label: cabinetCopy.overview, icon: <OverviewIcon /> },
      { id: "profile", label: cabinetCopy.profile, icon: <ProfileIcon /> },
      { id: "floor", label: cabinetCopy.floor, icon: <FloorIcon /> },
      { id: "menu", label: cabinetCopy.menu, icon: <MenuIcon /> },
      { id: "rules", label: cabinetCopy.rules, icon: <RulesIcon /> },
      { id: "staff", label: cabinetCopy.staff, icon: <StaffIcon /> },
      { id: "reservations", label: cabinetCopy.reservations, icon: <ReservationsIcon /> },
      { id: "activity", label: cabinetCopy.activity, icon: <ActivityIcon /> },
    ],
    [cabinetCopy],
  );

  const activityLabels: Record<string, string> = useMemo(
    () => ({
      APPLICATION_CREATED: cabinetCopy.actCreated,
      PROFILE_UPDATED: cabinetCopy.actUpdated,
      PHOTO_ADDED: cabinetCopy.actPhotoAdded,
      PHOTO_REMOVED: cabinetCopy.actPhotoRemoved,
      APPLICATION_SUBMITTED: cabinetCopy.actSubmitted,
      REVIEW_STARTED: cabinetCopy.actReviewStarted,
      APPLICATION_APPROVED: cabinetCopy.actApproved,
      APPLICATION_REJECTED: cabinetCopy.actRejected,
      APPLICATION_PUBLISHED: cabinetCopy.actPublished,
    }),
    [cabinetCopy],
  );

  const fieldLabels: Record<string, string> = useMemo(
    () => ({
      name: cabinetCopy.name.replace(" *", ""),
      description: cabinetCopy.description.replace(" *", ""),
      address: cabinetCopy.address.replace(" *", ""),
      cuisine: cabinetCopy.cuisine.replace(" *", ""),
      phone: cabinetCopy.phone.replace(" *", ""),
      email: cabinetCopy.email.replace(" *", ""),
      website: cabinetCopy.website,
      city: locale === "ro" ? "oraș" : locale === "en" ? "city" : "город",
      latitude: cabinetCopy.latitude.replace(" *", ""),
      longitude: cabinetCopy.longitude.replace(" *", ""),
      price_level: cabinetCopy.price,
      average_check: cabinetCopy.average,
      hours: cabinetCopy.hours.replace(" *", ""),
      photos: cabinetCopy.photos,
    }),
    [cabinetCopy, locale],
  );

  const reservationLabels: Record<string, string> = useMemo(
    () => ({
      CONFIRMED: cabinetCopy.resConfirmed,
      CHECKED_IN: cabinetCopy.resCheckedIn,
      CANCELLED: cabinetCopy.resCancelled,
      NO_SHOW: cabinetCopy.resNoShow,
    }),
    [cabinetCopy],
  );

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
          selected ? storedDraft(selected.id, selected.city_id) ?? toDraft(selected, locale) : null,
        );
      }
      if (selected) void refreshActivity(selected.id);
      else setActivity([]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selected, locale, refreshActivity]);

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
        ? getSetupChecks(selected, draft, cabinetCopy, locale)
            .filter((check) => !check.done)
            .map((check) => check.label.toLowerCase())
        : [];
      setError(
        missing.length
          ? `${locale === "ru" ? "Осталось заполнить: " : locale === "ro" ? "Rămâne de completat: " : "Missing fields: "}${missing.join(", ")}.`
          : locale === "ru" ? "Проверьте обязательные данные перед отправкой." : locale === "ro" ? "Verificați datele obligatorii înainte de trimitere." : "Please check required fields before submitting.",
      );
      return;
    }
    if (value instanceof ApiError && value.code === "invalid_fields") {
      setError(
        locale === "ru"
          ? "Проверьте email, сайт, координаты, ценовой уровень и средний чек."
          : locale === "ro"
          ? "Verificați emailul, site-ul, coordonatele, nivelul de preț și bonul mediu."
          : "Please check email, website, coordinates, price tier, and average spend.",
      );
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
      setMsg(
        locale === "ru"
          ? "Черновик создан. Заполните основные данные ресторана."
          : locale === "ro"
          ? "Ciorna a fost creată. Completați datele de bază."
          : "Draft created. Start with basic restaurant details.",
      );
    } catch (value) {
      showApiError(
        value,
        locale === "ru" ? "Не удалось создать ресторан" : locale === "ro" ? "Eroare la crearea localului" : "Failed to create restaurant",
      );
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
      setMsg(
        locale === "ru" ? "Изменения сохранены" : locale === "ro" ? "Modificările au fost salvate" : "Changes saved successfully",
      );
      await refreshActivity(selected.id);
    } catch (value) {
      showApiError(
        value,
        locale === "ru" ? "Ошибка сохранения" : locale === "ro" ? "Eroare la salvare" : "Error saving draft",
      );
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
      setMsg(
        locale === "ru"
          ? "Заявка отправлена на модерацию"
          : locale === "ro"
          ? "Cererea a fost trimisă spre moderare"
          : "Application submitted for moderation",
      );
      await refreshActivity(selected.id);
    } catch (value) {
      showApiError(
        value,
        locale === "ru" ? "Ошибка отправки" : locale === "ro" ? "Eroare la trimitere" : "Submission failed",
      );
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
      setMsg(
        locale === "ru" ? "Фотография добавлена" : locale === "ro" ? "Fotografia a fost adăugată" : "Photo uploaded successfully",
      );
      await refreshActivity(selected.id);
    } catch (value) {
      showApiError(
        value,
        locale === "ru" ? "Ошибка загрузки фото" : locale === "ro" ? "Eroare la încărcarea foto" : "Photo upload failed",
      );
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
      setMsg(
        locale === "ru" ? "Фотография удалена" : locale === "ro" ? "Fotografia a fost ștearsă" : "Photo deleted",
      );
      await refreshActivity(selected.id);
    } catch (value) {
      showApiError(
        value,
        locale === "ru" ? "Ошибка удаления" : locale === "ro" ? "Eroare la ștergerea foto" : "Failed to remove photo",
      );
    } finally {
      setBusy(false);
    }
  }

  function updateDraft<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  if (!user) {
    return (
      <div className="panel-page owner-loading" role="status" aria-live="polite">
        <span />
        <p>{locale === "ru" ? "Открываем кабинет…" : locale === "ro" ? "Se deschide cabinetul…" : "Loading workspace…"}</p>
      </div>
    );
  }

  const checks = selected ? getSetupChecks(selected, draft, cabinetCopy, locale) : [];
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
        <aside className="owner-sidebar" aria-label={cabinetCopy.title}>
          <div className="owner-person">
            <span className="owner-avatar">{initials(user)}</span>
            <div>
              <strong>{user.display_name || `${user.first_name} ${user.last_name}`}</strong>
              <span>{cabinetCopy.owner}</span>
            </div>
          </div>

          <div className="owner-venue-switcher">
            <span id="venue-switcher-label">{cabinetCopy.venues}</span>
            <div role="group" aria-labelledby="venue-switcher-label">
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
                  aria-pressed={app.id === selectedId}
                >
                  <i>{(pickLocale(app.name, locale) || pickLocale(app.name, "ru") || "R").slice(0, 1).toUpperCase()}</i>
                  <span>{pickLocale(app.name, locale) || pickLocale(app.name, "ru") || (locale === "ro" ? "Local nou" : locale === "en" ? "New venue" : "Новый ресторан")}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
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
            <nav
              className="owner-nav"
              role="tablist"
              aria-label={cabinetCopy.title}
              tabIndex={0}
            >
              {navigation.map((item) => (
                <button
                  key={item.id}
                  id={`tab-${item.id}`}
                  role="tab"
                  aria-selected={section === item.id}
                  aria-controls={`tabpanel-${item.id}`}
                  tabIndex={section === item.id ? 0 : -1}
                  type="button"
                  className={section === item.id ? "active" : ""}
                  onClick={() => setSection(item.id)}
                >
                  <span className="owner-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.id === "reservations" && futureBookings.length > 0 && (
                    <b>{futureBookings.length}</b>
                  )}
                </button>
              ))}
            </nav>
          )}

          <div className="owner-support">
            <span>{cabinetCopy.needHelp}</span>
            <p>{cabinetCopy.supportHelpText}</p>
            <a href="mailto:partners@seatiko.md">{cabinetCopy.contactSupport}</a>
          </div>
        </aside>

        <main
          className="owner-content"
          id={`tabpanel-${section}`}
          role="tabpanel"
          aria-labelledby={`tab-${section}`}
          tabIndex={0}
        >
          {(msg || error) && (
            <div className={`owner-notice ${error ? "error" : "success"}`} role="alert" aria-live="polite">
              <span>{error ? "!" : <CheckIcon />}</span>
              <p>{error || msg}</p>
              <button
                type="button"
                aria-label={locale === "ro" ? "Închide" : locale === "en" ? "Close" : "Закрыть"}
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
              <span className="owner-empty-mark">S</span>
              <span className="owner-kicker">{locale === "ro" ? "Primul pas" : locale === "en" ? "First step" : "Первый шаг"}</span>
              <h2>{cabinetCopy.emptyVenuesTitle}</h2>
              <p>{cabinetCopy.emptyVenuesBody}</p>
              <button
                type="button"
                className="panel-btn"
                disabled={busy}
                onClick={() => void onCreate()}
              >
                {cabinetCopy.emptyVenuesBtn}
              </button>
              <div className="owner-empty-assurances">
                <span>{locale === "ro" ? "Fără plăți în faza de cerere" : locale === "en" ? "No fees during application" : "Без оплаты на этапе заявки"}</span>
                <span>{locale === "ro" ? "Verificare în 1–3 zile lucrătoare" : locale === "en" ? "Verification in 1–3 business days" : "Проверка 1–3 рабочих дня"}</span>
                <span>{locale === "ro" ? "Suport dedicat la completare" : locale === "en" ? "Dedicated onboarding guidance" : "Поддержка при заполнении"}</span>
              </div>
            </section>
          ) : (
            <>
              <header className="owner-section-head">
                <div>
                  <span className="owner-kicker">
                    {section === "overview" && (locale === "ro" ? "Panou de control" : locale === "en" ? "Control Center" : "Центр управления")}
                    {section === "profile" && cabinetCopy.dataForGuests}
                    {section === "floor" && cabinetCopy.floorTitle}
                    {section === "menu" && cabinetCopy.menuSectionTitle}
                    {section === "rules" && cabinetCopy.rulesSubtitle}
                    {section === "staff" && cabinetCopy.staffSubtitle}
                    {section === "reservations" && (locale === "ro" ? "Activitate operațională" : locale === "en" ? "Operations" : "Операционная работа")}
                    {section === "activity" && (locale === "ro" ? "Jurnal de transparență" : locale === "en" ? "Audit & Transparency" : "Прозрачность аккаунта")}
                  </span>
                  <h2>
                    {section === "overview" && (pickLocale(selected.name, locale) || pickLocale(selected.name, "ru") || (locale === "ro" ? "Local nou" : locale === "en" ? "New venue" : "Новый ресторан"))}
                    {section === "profile" && cabinetCopy.profile}
                    {section === "floor" && cabinetCopy.floor}
                    {section === "menu" && cabinetCopy.menu}
                    {section === "rules" && cabinetCopy.rules}
                    {section === "staff" && cabinetCopy.staff}
                    {section === "reservations" && cabinetCopy.reservations}
                    {section === "activity" && cabinetCopy.activity}
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
                        {selected.status === "PUBLISHED"
                          ? (locale === "ro" ? "Restaurantul este activ" : locale === "en" ? "Restaurant is live" : "Ресторан работает")
                          : (locale === "ro" ? "Pregătire pentru lansare" : locale === "en" ? "Pre-launch preparation" : "Подготовка к запуску")}
                      </span>
                      <h3>{getStatusHint(selected.status, cabinetCopy)}</h3>
                      <div className="owner-hero-actions">
                        {canEdit && (
                          <button
                            type="button"
                            className="panel-btn"
                            onClick={() => setSection("profile")}
                          >
                            {cabinetCopy.continueEditing}
                          </button>
                        )}
                        {selected.status === "PUBLISHED" && (
                          <Link className="panel-btn" href="/#map">
                            {cabinetCopy.viewOnMap}
                          </Link>
                        )}
                        <button
                          type="button"
                          className="panel-btn ghost"
                          onClick={() => setSection("activity")}
                        >
                          {cabinetCopy.checkHistory}
                        </button>
                      </div>
                    </div>
                    <div
                      className="owner-progress-ring"
                      style={{
                        background: `conic-gradient(var(--site-accent, #d77b48) ${completion * 3.6}deg, rgba(255,255,255,.16) 0deg)`,
                      }}
                    >
                      <span>
                        <strong>{completion}%</strong>
                        <small>{locale === "ro" ? "gata" : locale === "en" ? "ready" : "готово"}</small>
                      </span>
                    </div>
                  </section>

                  <section className="owner-metrics" aria-label="KPI">
                    <article>
                      <span>{cabinetCopy.futureBookings}</span>
                      <strong>{futureBookings.length}</strong>
                      <small>{locale === "ro" ? "pentru localul curent" : locale === "en" ? "for this venue" : "по выбранному ресторану"}</small>
                    </article>
                    <article>
                      <span>{cabinetCopy.totalBookings}</span>
                      <strong>{selectedReservations.length}</strong>
                      <small>{locale === "ro" ? "inclusiv istoricul" : locale === "en" ? "including history" : "включая историю"}</small>
                    </article>
                    <article>
                      <span>{cabinetCopy.photosCount}</span>
                      <strong>{selected.photo_urls?.length || 0}<i>/8</i></strong>
                      <small>{locale === "ro" ? "în profilul localului" : locale === "en" ? "in venue gallery" : "в профиле заведения"}</small>
                    </article>
                    <article>
                      <span>{cabinetCopy.lastUpdate}</span>
                      <strong className="owner-metric-date">
                        {new Date(selected.updated_at).toLocaleDateString(locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU", {
                          day: "numeric",
                          month: "short",
                        })}
                      </strong>
                      <small>
                        {new Date(selected.updated_at).toLocaleTimeString(locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </article>
                  </section>

                  <div className="owner-overview-grid">
                    <section className="owner-card owner-checklist-card">
                      <div className="owner-card-head">
                        <div>
                          <span className="owner-kicker">{cabinetCopy.profileReadiness}</span>
                          <h3>{cabinetCopy.completedOf.replace("{done}", String(completedChecks)).replace("{total}", String(checks.length))}</h3>
                        </div>
                        <strong>{completion}%</strong>
                      </div>
                      <div className="owner-progress-bar">
                        <i style={{ width: `${completion}%` }} />
                      </div>
                      <ul>
                        {checks.map((check) => (
                          <li key={check.label} className={check.done ? "done" : ""}>
                            <span>{check.done ? <CheckIcon /> : null}</span>
                            <p>{check.label}</p>
                            {!check.done && canEdit && (
                              <button type="button" onClick={() => setSection("profile")}>
                                {cabinetCopy.fillAction}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section className="owner-card owner-launch-card">
                      <div className="owner-card-head">
                        <div>
                          <span className="owner-kicker">{cabinetCopy.launchPipeline}</span>
                          <h3>{locale === "ro" ? "De la profil la hartă" : locale === "en" ? "From profile to live map" : "От профиля до карты"}</h3>
                        </div>
                      </div>
                      <div className="owner-launch-steps">
                        {[
                          ["DRAFT", cabinetCopy.pipelineProfile, cabinetCopy.pipelineProfileHint],
                          ["SUBMITTED", cabinetCopy.pipelineSubmitted, cabinetCopy.pipelineSubmittedHint],
                          ["UNDER_REVIEW", cabinetCopy.pipelineReview, cabinetCopy.pipelineReviewHint],
                          ["APPROVED", cabinetCopy.pipelineApproved, cabinetCopy.pipelineApprovedHint],
                          ["PUBLISHED", cabinetCopy.pipelinePublished, cabinetCopy.pipelinePublishedHint],
                        ].map(([status, label, detail], index, stages) => {
                          const stageOrder = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "PUBLISHED"];
                          const normalized = selected.status === "REJECTED" ? "DRAFT" : selected.status;
                          const currentIndex = stageOrder.indexOf(normalized);
                          const active = index <= currentIndex;
                          return (
                            <div key={status} className={active ? "active" : ""}>
                              <span>{active ? <CheckIcon /> : index + 1}</span>
                              <p>
                                <strong>{label}</strong>
                                <small>{detail}</small>
                              </p>
                              {index < stages.length - 1 && <i />}
                            </div>
                          );
                        })}
                      </div>
                      {selected.reject_reason && (
                        <div className="owner-review-note">
                          <strong>{cabinetCopy.moderatorNote}</strong>
                          <p>{selected.reject_reason}</p>
                        </div>
                      )}
                    </section>
                  </div>

                  <section className="owner-card owner-recent-card">
                    <div className="owner-card-head">
                      <div>
                        <span className="owner-kicker">{cabinetCopy.recentGuests}</span>
                        <h3>{locale === "ro" ? "Următoarele rezervări" : locale === "en" ? "Upcoming reservations" : "Следующие бронирования"}</h3>
                      </div>
                      <button type="button" onClick={() => setSection("reservations")}>
                        {cabinetCopy.viewAllBookings}
                      </button>
                    </div>
                    {futureBookings.length === 0 ? (
                      <div className="owner-inline-empty">
                        <span aria-hidden="true">
                          <ReservationsIcon />
                        </span>
                        <p>{selected.venue_id ? cabinetCopy.noBookingsYet : cabinetCopy.bookingsAppearAfterPublish}</p>
                      </div>
                    ) : (
                      <div className="owner-booking-list compact">
                        {futureBookings.slice(0, 3).map((reservation) => (
                          <ReservationRow
                            key={reservation.id}
                            reservation={reservation}
                            locale={locale}
                            reservationLabels={reservationLabels}
                            tableLabel={cabinetCopy.table}
                            guestLabel={cabinetCopy.guest}
                            guestSingle={cabinetCopy.guestSingle}
                            guestPlural={cabinetCopy.guestPlural}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {section === "profile" && draft && (
                <section className="owner-profile">
                  {!canEdit && (
                    <div className="owner-lock-note" role="note">
                      <span><LockIcon /></span>
                      <p>{getEditLockHint(selected.status, cabinetCopy)}</p>
                    </div>
                  )}

                  <form onSubmit={(e) => { e.preventDefault(); if (canEdit) void onSave(); }}>
                    <div className="owner-form-section">
                      <div className="owner-form-title">
                        <span>01</span>
                        <div>
                          <h3>{cabinetCopy.basic}</h3>
                          <p>{cabinetCopy.basicHint}</p>
                        </div>
                      </div>
                      <div className="owner-form-fields">
                        <div className="field owner-field-wide">
                          <label htmlFor="venue-name">{cabinetCopy.name}</label>
                          <input
                            id="venue-name"
                            disabled={!canEdit}
                            value={draft.name}
                            onChange={(event) => updateDraft("name", event.target.value)}
                            required
                            enterKeyHint="next"
                          />
                        </div>
                        <div className="field owner-field-wide">
                          <label htmlFor="venue-description">{cabinetCopy.description}</label>
                          <textarea
                            id="venue-description"
                            disabled={!canEdit}
                            maxLength={400}
                            placeholder={cabinetCopy.descriptionPlaceholder}
                            value={draft.description}
                            onChange={(event) => updateDraft("description", event.target.value)}
                            required
                            rows={3}
                          />
                          <small aria-live="polite">{draft.description.length}/400</small>
                        </div>
                        <div className="field">
                          <label htmlFor="venue-cuisine">{cabinetCopy.cuisine}</label>
                          <input
                            id="venue-cuisine"
                            disabled={!canEdit}
                            placeholder={cabinetCopy.cuisinePlaceholder}
                            value={draft.cuisine}
                            onChange={(event) => updateDraft("cuisine", event.target.value)}
                            enterKeyHint="next"
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="venue-hours">{cabinetCopy.hours}</label>
                          <input
                            id="venue-hours"
                            disabled={!canEdit}
                            placeholder={cabinetCopy.hoursPlaceholder}
                            value={draft.hours_text}
                            onChange={(event) => updateDraft("hours_text", event.target.value)}
                            enterKeyHint="next"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="owner-form-section">
                      <div className="owner-form-title">
                        <span>02</span>
                        <div>
                          <h3>{cabinetCopy.location}</h3>
                          <p>{cabinetCopy.locationHint}</p>
                        </div>
                      </div>
                      <div className="owner-form-fields">
                        <div className="field owner-field-wide">
                          <label htmlFor="venue-city">
                            {locale === "ru" ? "Город" : locale === "ro" ? "Oraș" : "City"}
                          </label>
                          <select
                            id="venue-city"
                            disabled={!canEdit}
                            value={draft.city_id}
                            onChange={(event) => {
                              const cityId = event.target.value;
                              setDraft((current) => current ? { ...current, city_id: cityId, lat: "", lng: "" } : current);
                            }}
                          >
                            {!locations.some((city) => city.id === draft.city_id) && (
                              <option value={draft.city_id}>{draft.city_id === "city-balti" ? "Bălți" : draft.city_id}</option>
                            )}
                            {locations.map((city) => (
                              <option key={city.id} value={city.id}>{pickLocale(city.name, locale)}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field owner-field-wide">
                          <label htmlFor="venue-address">{cabinetCopy.address}</label>
                          <input
                            id="venue-address"
                            disabled={!canEdit}
                            placeholder={cabinetCopy.addressPlaceholder}
                            value={draft.address}
                            onChange={(event) => updateDraft("address", event.target.value)}
                            enterKeyHint="next"
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="venue-lat">{cabinetCopy.latitude}</label>
                          <input
                            id="venue-lat"
                            type="number"
                            step="0.000001"
                            inputMode="decimal"
                            disabled={!canEdit}
                            placeholder="47.7617"
                            value={draft.lat}
                            onChange={(event) => updateDraft("lat", event.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="venue-lng">{cabinetCopy.longitude}</label>
                          <input
                            id="venue-lng"
                            type="number"
                            step="0.000001"
                            inputMode="decimal"
                            disabled={!canEdit}
                            placeholder="27.9288"
                            value={draft.lng}
                            onChange={(event) => updateDraft("lng", event.target.value)}
                          />
                        </div>
                        <ApplicationLocationPicker
                          key={`${selected.id}:${draft.city_id}`}
                          config={mapConfig}
                          center={locations.find((city) => city.id === draft.city_id)?.center ?? BALTI_CENTER}
                          query={`${draft.name} ${draft.address} Moldova`}
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
                        <div>
                          <h3>{cabinetCopy.contacts}</h3>
                          <p>{cabinetCopy.contactsHint}</p>
                        </div>
                      </div>
                      <div className="owner-form-fields">
                        <div className="field">
                          <label htmlFor="venue-phone">{cabinetCopy.phone}</label>
                          <input
                            id="venue-phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            disabled={!canEdit}
                            placeholder="+373 600 00 000"
                            value={draft.phone}
                            onChange={(event) => updateDraft("phone", event.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="venue-email">{cabinetCopy.email}</label>
                          <input
                            id="venue-email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            disabled={!canEdit}
                            value={draft.email}
                            onChange={(event) => updateDraft("email", event.target.value)}
                          />
                        </div>
                        <div className="field owner-field-wide">
                          <label htmlFor="venue-website">
                            {cabinetCopy.website} <span className="field-optional">{cabinetCopy.optional}</span>
                          </label>
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
                          <select
                            id="venue-price"
                            disabled={!canEdit}
                            value={draft.price_level}
                            onChange={(event) => updateDraft("price_level", event.target.value)}
                          >
                            <option value="1">{cabinetCopy.price1}</option>
                            <option value="2">{cabinetCopy.price2}</option>
                            <option value="3">{cabinetCopy.price3}</option>
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor="venue-check">{cabinetCopy.average}</label>
                          <input
                            id="venue-check"
                            type="number"
                            inputMode="numeric"
                            min="0"
                            disabled={!canEdit}
                            placeholder="350"
                            value={draft.average_check}
                            onChange={(event) => updateDraft("average_check", event.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="owner-form-section">
                      <div className="owner-form-title">
                        <span>04</span>
                        <div>
                          <h3>{cabinetCopy.photos}</h3>
                          <p>{cabinetCopy.photosHint}</p>
                        </div>
                      </div>
                      <div className="owner-photo-area">
                        <div className="photo-grid owner-photo-grid">
                          {(selected.photo_urls || []).map((url, index) => (
                            <div key={url} className="photo-thumb owner-photo-thumb">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={mediaUrl(url)} alt={`Photo ${index + 1}`} />
                              {index === 0 && <span>{cabinetCopy.cover}</span>}
                              {canEdit && (
                                <button
                                  type="button"
                                  aria-label={locale === "ro" ? "Șterge foto" : locale === "en" ? "Delete photo" : "Удалить фото"}
                                  onClick={() => void onRemovePhoto(url)}
                                >
                                  ×
                                </button>
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
                              <span aria-hidden="true">+</span>
                              <strong>{cabinetCopy.addPhoto}</strong>
                              <small>JPG, PNG, WebP · max 5 MB</small>
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
                              ? `${locale === "ru" ? "Осталось: " : locale === "ro" ? "Rămase: " : "Remaining: "}${missingChecks.map((check) => check.label).join(", ")}.`
                              : cabinetCopy.ready}
                          </p>
                        </div>
                        <div>
                          <button
                            type="button"
                            className="panel-btn ghost"
                            disabled={busy}
                            onClick={() => void onSave()}
                          >
                            {cabinetCopy.save}
                          </button>
                          <button
                            type="button"
                            className="panel-btn"
                            disabled={busy || missingChecks.length > 0}
                            onClick={() => void onSubmit()}
                          >
                            {cabinetCopy.submit}
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                </section>
              )}

              {section === "floor" && (
                selected.venue_id ? (
                  <CabinetFloorPanel venueId={selected.venue_id} />
                ) : (
                  <div className="owner-section-empty">
                    <span aria-hidden="true"><FloorIcon /></span>
                    <h3>{cabinetCopy.floor}</h3>
                    <p>
                      {locale === "ro"
                        ? "Gestionarea sălii și a codurilor QR devine disponibilă după publicarea restaurantului pe hartă."
                        : locale === "en"
                        ? "Floor plan and table QR code management unlock once your restaurant is published on the map."
                        : "Схема зала и QR-коды столов доступны после публикации ресторана на карте."}
                    </p>
                  </div>
                )
              )}

              {section === "menu" && (
                selected.venue_id ? (
                  <CabinetMenuPanel venueId={selected.venue_id} />
                ) : (
                  <div className="owner-section-empty">
                    <span aria-hidden="true"><MenuIcon /></span>
                    <h3>{cabinetCopy.menu}</h3>
                    <p>
                      {locale === "ro"
                        ? "Gestionarea meniului devine disponibilă după publicarea restaurantului pe hartă."
                        : locale === "en"
                        ? "Menu management unlocks once your restaurant is published on the map."
                        : "Управление меню доступно после публикации ресторана на карте."}
                    </p>
                  </div>
                )
              )}

              {section === "rules" && (
                selected.venue_id ? (
                  <CabinetRulesPanel venueId={selected.venue_id} />
                ) : (
                  <div className="owner-section-empty">
                    <span aria-hidden="true"><RulesIcon /></span>
                    <h3>{cabinetCopy.rules}</h3>
                    <p>
                      {locale === "ro"
                        ? "Configurarea regulilor de rezervare devine disponibilă după publicarea restaurantului pe hartă."
                        : locale === "en"
                        ? "Booking rules configuration unlocks once your restaurant is published on the map."
                        : "Настройка правил бронирования доступна после публикации ресторана на карте."}
                    </p>
                  </div>
                )
              )}

              {section === "staff" && (
                selected.venue_id ? (
                  <CabinetStaffPanel venueId={selected.venue_id} />
                ) : (
                  <div className="owner-section-empty">
                    <span aria-hidden="true"><StaffIcon /></span>
                    <h3>{cabinetCopy.staff}</h3>
                    <p>
                      {locale === "ro"
                        ? "Gestionarea personalului și analitica de tură devin disponibile după publicarea restaurantului pe hartă."
                        : locale === "en"
                        ? "Staff management and shift analytics unlock once your restaurant is published on the map."
                        : "Управление персоналом и аналитика смены доступны после публикации ресторана на карте."}
                    </p>
                  </div>
                )
              )}

              {section === "reservations" && (
                <section className="owner-reservations">
                  <div className="owner-filter-row">
                    <div className="owner-filters" role="group" aria-label={cabinetCopy.reservations}>
                      {([
                        ["upcoming", cabinetCopy.filterUpcoming],
                        ["history", cabinetCopy.filterHistory],
                        ["all", cabinetCopy.filterAll],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={reservationFilter === value ? "active" : ""}
                          onClick={() => setReservationFilter(value)}
                          aria-pressed={reservationFilter === value}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <span>{filteredReservations.length} {cabinetCopy.records}</span>
                  </div>

                  {!selected.venue_id ? (
                    <div className="owner-section-empty">
                      <span aria-hidden="true"><ReservationsIcon /></span>
                      <h3>{locale === "ro" ? "Rezervările se activează după publicare" : locale === "en" ? "Bookings unlock after publishing" : "Брони откроются после публикации"}</h3>
                      <p>{cabinetCopy.bookingsAppearAfterPublish}</p>
                    </div>
                  ) : filteredReservations.length === 0 ? (
                    <div className="owner-section-empty">
                      <span aria-hidden="true"><ReservationsIcon /></span>
                      <h3>{locale === "ro" ? "Nicio rezervare în această secțiune" : locale === "en" ? "No bookings in this section" : "В этом разделе пока пусто"}</h3>
                      <p>{cabinetCopy.noBookingsYet}</p>
                    </div>
                  ) : (
                    <div className="owner-card owner-booking-list">
                      {filteredReservations.map((reservation) => (
                        <ReservationRow
                          key={reservation.id}
                          reservation={reservation}
                          locale={locale}
                          reservationLabels={reservationLabels}
                          tableLabel={cabinetCopy.table}
                          guestLabel={cabinetCopy.guest}
                          guestSingle={cabinetCopy.guestSingle}
                          guestPlural={cabinetCopy.guestPlural}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {section === "activity" && (
                <section className="owner-activity">
                  <div className="owner-audit-intro">
                    <span><CheckIcon /></span>
                    <div>
                      <strong>{cabinetCopy.auditAutoNotice}</strong>
                      <p>{cabinetCopy.auditAutoNoticeHint}</p>
                    </div>
                  </div>

                  {activityLoading ? (
                    <div className="owner-section-empty">
                      <p>{cabinetCopy.loadingHistory}</p>
                    </div>
                  ) : activity.length === 0 ? (
                    <div className="owner-section-empty">
                      <span aria-hidden="true"><ActivityIcon /></span>
                      <h3>{cabinetCopy.emptyHistory}</h3>
                    </div>
                  ) : (
                    <div className="owner-card owner-timeline">
                      {activity.map((entry) => (
                        <article key={entry.id}>
                          <div className="owner-timeline-mark">
                            <span>{entry.actor_role === "admin" ? "S" : initials(user)}</span>
                            <i />
                          </div>
                          <div className="owner-timeline-content">
                            <div>
                              <strong>{activityLabels[entry.action] || entry.action}</strong>
                              <time>{formatDateTime(entry.created_at, locale)}</time>
                            </div>
                            <p>{entry.actor_role === "admin" ? cabinetCopy.seatikoTeam : user.display_name || cabinetCopy.venueOwner}</p>
                            {entry.changed_fields?.length > 0 && (
                              <small>
                                {cabinetCopy.changedFields}:{" "}
                                {entry.changed_fields.map((field) => fieldLabels[field] || field).join(", ")}
                              </small>
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

function ReservationRow({
  reservation,
  locale,
  reservationLabels,
  tableLabel,
  guestLabel,
  guestSingle,
  guestPlural,
}: {
  reservation: RestaurantReservation;
  locale: string;
  reservationLabels: Record<string, string>;
  tableLabel: string;
  guestLabel: string;
  guestSingle: string;
  guestPlural: string;
}) {
  const loc = locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU";
  const bookingDate = new Date(reservation.reserved_for);
  const statusClass = reservation.status.toLowerCase().replace("_", "-");

  return (
    <article className="owner-booking-row">
      <div className="owner-booking-date">
        <strong>{bookingDate.toLocaleDateString(loc, { day: "2-digit" })}</strong>
        <span>{bookingDate.toLocaleDateString(loc, { month: "short" }).replace(".", "")}</span>
      </div>
      <div className="owner-booking-time">
        <strong>{bookingDate.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}</strong>
        <span>{tableLabel} {reservation.table_number || "—"}</span>
      </div>
      <div className="owner-booking-guest">
        <span>{(reservation.guest_name || guestLabel).slice(0, 1).toUpperCase()}</span>
        <p>
          <strong>{reservation.guest_name || guestLabel}</strong>
          <small>{reservation.guest_email}</small>
        </p>
      </div>
      <div className="owner-booking-party">
        <strong>{reservation.guests}</strong>
        <span>{reservation.guests === 1 ? guestSingle : guestPlural}</span>
      </div>
      <span className={`owner-reservation-status ${statusClass}`}>
        {reservationLabels[reservation.status] || reservation.status}
      </span>
    </article>
  );
}
