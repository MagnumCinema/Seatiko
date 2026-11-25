"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import { PanelShell } from "@/components/panel-shell";
import { GoogleLocationPicker } from "@/components/google-location-picker";
import { googleMapCoordinates, googleMapSearch } from "@/lib/google-map";
import { applyMapLibreLocalization, getMapLibreLocale } from "@/lib/maplibre-locale";
import {
  CabinetFloorPanel,
  CabinetMenuPanel,
  CabinetRulesPanel,
  CabinetStaffPanel,
} from "@/components/cabinet-ops";
import { CabinetShiftsPlanner } from "@/components/cabinet-shifts";
import { useLocale } from "@/components/locale-provider";
import { StatusBadge } from "@/components/status-badge";
import { CabinetConfirmDialog } from "@/components/cabinet-confirm-dialog";
import {
  filterReservations,
  photoProblem,
  pluralize,
  validateVenueContacts,
  type PluralForms,
  type ReservationFilter,
  type VenueContactErrors,
} from "@/lib/cabinet-helpers";
import {
  ApiError,
  createApplication,
  deleteApplication,
  emptyLocalized,
  fetchMe,
  fetchMapConfig,
  getToken,
  listApplicationActivity,
  listMyApplications,
  listRestaurantReservations,
  listVenueWorkShifts,
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
import { VENUE_TYPE_IDS } from "@/lib/venue-roles";

type Section =
  | "overview"
  | "profile"
  | "floor"
  | "menu"
  | "rules"
  | "staff"
  | "shifts"
  | "reservations"
  | "activity";

const DRAFT_STORAGE_PREFIX = "seatiko:restaurant-draft:";
const BALTI_CENTER: MapCoordinates = { lat: 47.7622, lng: 27.9289 };
const FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

type Draft = {
  name: string;
  description: string;
  address: string;
  city_id: string;
  cuisine: string;
  venue_type: string;
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

function ShiftsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
      <circle cx="12" cy="15" r="2" />
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

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function toDraft(app: VenueApplication, locale: LocaleCode): Draft {
  return {
    name: pickLocale(app.name, locale) || pickLocale(app.name, "ru") || "",
    description: pickLocale(app.description, locale) || pickLocale(app.description, "ru") || "",
    address: pickLocale(app.address, locale) || pickLocale(app.address, "ru") || "",
    city_id: app.city_id,
    cuisine: (app.cuisine || []).join(", "),
    venue_type: app.venue_type || "",
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
    venue_type: draft.venue_type,
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
      venue_type: value.venue_type ?? "",
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

const PENDING_CHANGES_PREFIX = "seatiko_venue_pending_changes:";

function getPendingChanges(applicationId: string): Draft | null {
  try {
    const raw = localStorage.getItem(`${PENDING_CHANGES_PREFIX}${applicationId}`);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function setPendingChanges(applicationId: string, draft: Draft) {
  try {
    localStorage.setItem(
      `${PENDING_CHANGES_PREFIX}${applicationId}`,
      JSON.stringify(draft),
    );
  } catch {}
}

function clearPendingChanges(applicationId: string) {
  try {
    localStorage.removeItem(`${PENDING_CHANGES_PREFIX}${applicationId}`);
  } catch {}
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
  const { locale } = useLocale();
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
          point={point} disabled={disabled} locale={locale} onError={fallback}
          onChange={(next) => onChange(next.lat.toFixed(6), next.lng.toFixed(6))}
        />
      ) : (
        <OpenLocationPicker lat={lat} lng={lng} disabled={disabled} locale={locale} onChange={onChange} center={center} />
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
  locale,
  onChange,
  center,
}: {
  lat: string;
  lng: string;
  disabled: boolean;
  locale: "ru" | "en" | "ro";
  onChange: (lat: string, lng: string) => void;
  center: MapCoordinates;
}) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const localeRef = useRef(locale);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    localeRef.current = locale;
    if (mapRef.current) {
      applyMapLibreLocalization(mapRef.current, locale);
    }
  }, [locale]);

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
        locale: getMapLibreLocale(localeRef.current),
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
    map.once("load", () => {
      applyMapLibreLocalization(map, localeRef.current);
    });

    const placeMarker = (nextLng: number, nextLat: number, report: boolean) => {
      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({
          color: "#e9b96e",
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
        color: "#e9b96e",
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

function formatOwnerName(user: User): string {
  if (user.display_name) {
    const cleaned = user.display_name
      .replace(/\s*\((?:владелец|owner|proprietar|администратор|admin)[^)]*\)/gi, "")
      .trim();
    if (cleaned && !/^(?:владелец|owner|proprietar)$/i.test(cleaned)) {
      return cleaned;
    }
  }
  const first = user.first_name?.trim() || "";
  const last = user.last_name?.trim() || "";
  if (/^(?:владелец|owner|proprietar)$/i.test(last)) {
    return first || user.email;
  }
  return `${first} ${last}`.trim() || user.email;
}

function initials(user: User) {
  const first = user.first_name?.trim() || "";
  const last = user.last_name?.trim() || "";
  if (first && last && !/^(?:владелец|owner|proprietar)$/i.test(last)) {
    return `${first[0]}${last[0]}`.toUpperCase();
  }
  if (first && last) {
    return `${first[0]}${last[0]}`.toUpperCase();
  }
  if (first) {
    return first.slice(0, 2).toUpperCase();
  }
  const cleanName = formatOwnerName(user);
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (cleanName.slice(0, 2) || "VR").toUpperCase();
}

export default function CabinetPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const siteCopy = getSiteCopy(locale);
  const cabinetCopy = siteCopy.cabinet;
  const ui = cabinetCopy.ui;
  const [user, setUser] = useState<User | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [fieldErrors, setFieldErrors] = useState<VenueContactErrors>({});
  const [removingPhoto, setRemovingPhoto] = useState<string | null>(null);
  const contentRef = useRef<HTMLElement>(null);
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
  const [isEditingApproved, setIsEditingApproved] = useState(false);
  const [hasPendingModeration, setHasPendingModeration] = useState(false);
  const [section, setSection] = useState<Section>("overview");
  const [reservations, setReservations] = useState<RestaurantReservation[]>([]);
  const [reservationFilter, setReservationFilter] =
    useState<ReservationFilter>("upcoming");
  const [shiftAlertCount, setShiftAlertCount] = useState(0);
  const [activity, setActivity] = useState<ApplicationActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingApp, setDeletingApp] = useState<VenueApplication | null>(null);
  const draftApplicationRef = useRef<string | null>(null);

  // Keeps "upcoming" vs "history" honest when the cabinet stays open for hours.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Success notices fade on their own; errors stay until dismissed.
  useEffect(() => {
    if (!msg || error) return;
    const timer = window.setTimeout(() => setMsg(null), 6000);
    return () => window.clearTimeout(timer);
  }, [msg, error]);

  function openSection(next: Section) {
    setSection(next);
    setMsg(null);
    setError(null);
    // On phones the tab grid sits above the content; bring the opened tab into view.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 960px)").matches) {
      window.requestAnimationFrame(() =>
        contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }

  const selected = apps.find((app) => app.id === selectedId) ?? null;

  const navigation: { id: Section; label: string; icon: React.ReactNode }[] = useMemo(
    () => [
      { id: "overview", label: cabinetCopy.overview, icon: <OverviewIcon /> },
      { id: "profile", label: cabinetCopy.profile, icon: <ProfileIcon /> },
      { id: "floor", label: cabinetCopy.floor, icon: <FloorIcon /> },
      { id: "menu", label: cabinetCopy.menu, icon: <MenuIcon /> },
      { id: "rules", label: cabinetCopy.rules, icon: <RulesIcon /> },
      { id: "staff", label: cabinetCopy.staff, icon: <StaffIcon /> },
      { id: "shifts", label: cabinetCopy.shifts, icon: <ShiftsIcon /> },
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
      city: ui.city,
      latitude: cabinetCopy.latitude.replace(" *", ""),
      longitude: cabinetCopy.longitude.replace(" *", ""),
      price_level: cabinetCopy.price,
      average_check: cabinetCopy.average,
      hours: cabinetCopy.hours.replace(" *", ""),
      photos: cabinetCopy.photos,
    }),
    [cabinetCopy, ui],
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
      setLoadFailed(false);
      setNow(Date.now());
      setSelectedId((current) => {
        if (current && applicationList.some((app) => app.id === current)) return current;
        return applicationList[0]?.id ?? null;
      });
    } catch (value) {
      // Only an expired session sends the owner back to login; a network hiccup shows a retry screen.
      if (value instanceof ApiError && (value.status === 401 || value.status === 403)) {
        router.replace("/login");
        return;
      }
      setLoadFailed(true);
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
        const pending = selected ? getPendingChanges(selected.id) : null;
        setHasPendingModeration(Boolean(pending));
        setIsEditingApproved(false);
        setDraft(
          selected
            ? pending ?? storedDraft(selected.id, selected.city_id) ?? toDraft(selected, locale)
            : null,
        );
      }
      if (selected) void refreshActivity(selected.id);
      else setActivity([]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selected, locale, refreshActivity]);

  useEffect(() => {
    const targetVenueId = selected ? selected.venue_id || selected.id : "";
    if (!targetVenueId) return;
    let cancelled = false;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    listVenueWorkShifts(targetVenueId)
      .then((list) => {
        if (cancelled) return;
        const count = list.filter(
          (s) => s.date >= todayStr && (s.status === "SWAP_REQUESTED" || s.status === "DECLINED"),
        ).length;
        setShiftAlertCount(count);
      })
      .catch(() => {
        if (!cancelled) setShiftAlertCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

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

  const filteredReservations = useMemo(
    () => filterReservations(selectedReservations, reservationFilter, now),
    [reservationFilter, selectedReservations, now],
  );
  const reservationCounts = useMemo(
    () => ({
      upcoming: filterReservations(selectedReservations, "upcoming", now).length,
      history: filterReservations(selectedReservations, "history", now).length,
      all: selectedReservations.length,
    }),
    [selectedReservations, now],
  );

  function showApiError(value: unknown, fallback: string) {
    if (value instanceof ApiError && value.code === "incomplete") {
      const missing = selected
        ? getSetupChecks(selected, draft, cabinetCopy, locale)
            .filter((check) => !check.done)
            .map((check) => check.label.toLowerCase())
        : [];
      setError(
        missing.length
          ? ui.missingFields.replace("{list}", missing.join(", "))
          : ui.checkRequired,
      );
      return;
    }
    if (value instanceof ApiError && value.code === "invalid_fields") {
      setError(ui.invalidFields);
      return;
    }
    setError(fallback);
  }

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const app = await createApplication();
      setApps((current) => [app, ...current]);
      setSelectedId(app.id);
      setSection("profile");
      setMsg(ui.draftCreated);
    } catch (value) {
      showApiError(value, ui.createFailed);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteConfirm() {
    if (!deletingApp) return;
    const target = deletingApp;
    setBusy(true);
    setError(null);
    try {
      await deleteApplication(target.id);
      clearStoredDraft(target.id);
      clearPendingChanges(target.id);
      const remaining = apps.filter((item) => item.id !== target.id);
      setApps(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setSection("overview");
      setDeletingApp(null);
      setMsg(ui.venueDeleted);
    } catch (value) {
      setDeletingApp(null);
      showApiError(value, ui.deleteFailed);
    } finally {
      setBusy(false);
    }
  }

  /** Checks contact formats before anything is sent; marks the bad fields and scrolls to the first one. */
  function contactsValid(): boolean {
    if (!draft) return false;
    const errors = validateVenueContacts(draft);
    setFieldErrors(errors);
    const first = (["phone", "email", "website"] as const).find((key) => errors[key]);
    if (first) {
      setMsg(null);
      setError(ui.fixFields);
      document.getElementById(`venue-${first}`)?.focus();
      return false;
    }
    return true;
  }

  async function onSave() {
    if (!selected || !draft || !editable(selected.status)) return;
    if (!contactsValid()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateApplication(selected.id, toPayload(draft));
      setApps((current) => current.map((app) => (app.id === updated.id ? updated : app)));
      clearStoredDraftWhenPersisted(selected.id, draft, updated);
      setMsg(ui.changesSaved);
      await refreshActivity(selected.id);
    } catch (value) {
      showApiError(value, ui.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (!selected || !draft || !editable(selected.status)) return;
    if (!contactsValid()) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await updateApplication(selected.id, toPayload(draft));
      setApps((current) => current.map((app) => (app.id === saved.id ? saved : app)));
      const updated = await submitApplication(selected.id);
      setApps((current) => current.map((app) => (app.id === updated.id ? updated : app)));
      clearStoredDraftWhenPersisted(selected.id, draft, updated);
      setSection("overview");
      setMsg(ui.submitted);
      await refreshActivity(selected.id);
    } catch (value) {
      showApiError(value, ui.submitFailed);
    } finally {
      setBusy(false);
    }
  }

  async function onPhoto(file: File | null) {
    if (!selected || !file || !editable(selected.status)) return;
    const problem = photoProblem(file);
    if (problem) {
      setMsg(null);
      setError(problem === "size" ? ui.photoTooLarge : ui.photoWrongType);
      return;
    }
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
      setMsg(ui.photoAdded);
      await refreshActivity(selected.id);
    } catch (value) {
      showApiError(value, ui.photoUploadFailed);
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
      setMsg(ui.photoRemoved);
      await refreshActivity(selected.id);
    } catch (value) {
      showApiError(value, ui.photoRemoveFailed);
    } finally {
      setBusy(false);
      setRemovingPhoto(null);
    }
  }

  function updateDraft<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    if (key in fieldErrors) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[key as keyof VenueContactErrors];
        return next;
      });
    }
  }

  async function onSubmitProposedChanges() {
    if (!selected || !draft) return;
    if (!contactsValid()) return;
    setBusy(true);
    setError(null);
    try {
      setPendingChanges(selected.id, draft);
      setHasPendingModeration(true);
      setIsEditingApproved(false);
      setMsg(cabinetCopy.changesSubmittedSuccess);
      await refreshActivity(selected.id);
    } catch (value) {
      showApiError(value, ui.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    if (loadFailed) {
      return (
        <div className="panel-page owner-loading owner-load-failed" role="alert">
          <strong>{ui.loadFailedTitle}</strong>
          <p>{ui.loadFailedHint}</p>
          <button
            type="button"
            className="panel-btn"
            onClick={() => {
              setLoadFailed(false);
              void load();
            }}
          >
            {ui.retry}
          </button>
        </div>
      );
    }
    return (
      <div className="panel-page owner-loading" role="status" aria-live="polite">
        <span />
        <p>{ui.loadingWorkspace}</p>
      </div>
    );
  }

  const checks = selected ? getSetupChecks(selected, draft, cabinetCopy, locale) : [];
  const completedChecks = checks.filter((check) => check.done).length;
  const missingChecks = checks.filter((check) => !check.done);
  const completion = checks.length ? Math.round((completedChecks / checks.length) * 100) : 0;
  const isDraftStatus = selected ? editable(selected.status) : false;
  const canEdit = isDraftStatus || isEditingApproved;
  const effectiveVenueId = selected ? selected.venue_id || selected.id : "";
  const futureBookings = filterReservations(selectedReservations, "upcoming", now);
  const venueTitle = (app: VenueApplication) =>
    pickLocale(app.name, locale) || pickLocale(app.name, "ru") || ui.newVenue;

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
            <div className="owner-person-info">
              <strong>{formatOwnerName(user)}</strong>
              <span className="owner-role-badge">
                <i className="owner-role-dot" aria-hidden="true" />
                {cabinetCopy.owner}
              </span>
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
                    setFieldErrors({});
                    openSection("overview");
                  }}
                  aria-pressed={app.id === selectedId}
                >
                  <i>{venueTitle(app).slice(0, 1).toUpperCase()}</i>
                  <span title={venueTitle(app)}>{venueTitle(app)}</span>
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
                  onClick={() => openSection(item.id)}
                >
                  <span className="owner-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.id === "shifts" && shiftAlertCount > 0 && (
                    <b className="owner-nav-alert-badge">{shiftAlertCount}</b>
                  )}
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
          ref={contentRef}
          className="owner-content"
          id={`tabpanel-${section}`}
          role="tabpanel"
          aria-labelledby={`tab-${section}`}
          tabIndex={0}
        >
          {(msg || error) && (
            <div className={`owner-notice ${error ? "error" : "success"}`} role={error ? "alert" : "status"} aria-live="polite">
              <span>{error ? "!" : <CheckIcon />}</span>
              <p>{error || msg}</p>
              <button
                type="button"
                aria-label={ui.close}
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
              <span className="owner-kicker">{ui.firstStep}</span>
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
                <span>{ui.assuranceNoFees}</span>
                <span>{ui.assuranceReview}</span>
                <span>{ui.assuranceSupport}</span>
              </div>
            </section>
          ) : (
            <>
              <header className="owner-section-head">
                <div>
                  <span className="owner-kicker">
                    {section === "overview" && ui.controlCenter}
                    {section === "profile" && cabinetCopy.dataForGuests}
                    {section === "floor" && cabinetCopy.floorTitle}
                    {section === "menu" && cabinetCopy.menuSectionTitle}
                    {section === "rules" && ui.rulesKicker}
                    {section === "staff" && cabinetCopy.staffSubtitle}
                    {section === "shifts" && cabinetCopy.shiftsSubtitle}
                    {section === "reservations" && ui.operations}
                    {section === "activity" && ui.auditKicker}
                  </span>
                  <h2>
                    {section === "overview" && venueTitle(selected)}
                    {section === "profile" && cabinetCopy.profile}
                    {section === "floor" && cabinetCopy.floor}
                    {section === "menu" && cabinetCopy.menu}
                    {section === "rules" && cabinetCopy.rules}
                    {section === "staff" && cabinetCopy.staff}
                    {section === "shifts" && cabinetCopy.shifts}
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
                          ? ui.restaurantLive
                          : ui.preLaunch}
                      </span>
                      <h3>{getStatusHint(selected.status, cabinetCopy)}</h3>
                      <div className="owner-hero-actions">
                        {canEdit && (
                          <button
                            type="button"
                            className="panel-btn"
                            onClick={() => openSection("profile")}
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
                          onClick={() => openSection("activity")}
                        >
                          {cabinetCopy.checkHistory}
                        </button>
                      </div>
                    </div>
                    <div
                      className="owner-progress-ring"
                      style={{
                        background: `conic-gradient(var(--site-accent, #e9b96e) ${completion * 3.6}deg, rgba(255,255,255,.16) 0deg)`,
                      }}
                    >
                      <span>
                        <strong>{completion}%</strong>
                        <small>{ui.ready}</small>
                      </span>
                    </div>
                  </section>

                  <section className="owner-metrics" aria-label="KPI">
                    <article>
                      <span>{cabinetCopy.futureBookings}</span>
                      <strong>{futureBookings.length}</strong>
                      <small>{ui.forThisVenue}</small>
                    </article>
                    <article>
                      <span>{cabinetCopy.totalBookings}</span>
                      <strong>{selectedReservations.length}</strong>
                      <small>{ui.includingHistory}</small>
                    </article>
                    <article>
                      <span>{cabinetCopy.photosCount}</span>
                      <strong>{selected.photo_urls?.length || 0}<i>/8</i></strong>
                      <small>{ui.inGallery}</small>
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
                              <button type="button" onClick={() => openSection("profile")}>
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
                          <h3>{ui.fromProfileToMap}</h3>
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
                        <h3>{ui.upcomingReservations}</h3>
                      </div>
                      <button type="button" onClick={() => openSection("reservations")}>
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
                            guestForms={ui.guestsForms}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {section === "profile" && draft && (
                <section className="owner-profile">
                  {!isDraftStatus && (
                    <>
                      {isEditingApproved ? (
                        <div className="owner-edit-mode-note" role="alert">
                          <div className="owner-edit-mode-info">
                            <span className="owner-edit-icon"><EditIcon /></span>
                            <div>
                              <strong>{cabinetCopy.editModeActiveTitle}</strong>
                              <p>{cabinetCopy.editModeActiveHint}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="panel-btn ghost small"
                            onClick={() => {
                              setDraft(toDraft(selected, locale));
                              setIsEditingApproved(false);
                            }}
                          >
                            {cabinetCopy.cancelEdit}
                          </button>
                        </div>
                      ) : hasPendingModeration ? (
                        <div className="owner-pending-moderation-note" role="status">
                          <span className="owner-pending-badge-icon"><ClockIcon /></span>
                          <div className="owner-pending-content">
                            <strong>{cabinetCopy.pendingModerationTitle}</strong>
                            <p>{cabinetCopy.pendingModerationHint}</p>
                          </div>
                          <div className="owner-pending-actions">
                            <button
                              type="button"
                              className="panel-btn ghost small"
                              onClick={() => {
                                clearPendingChanges(selected.id);
                                setHasPendingModeration(false);
                                setDraft(toDraft(selected, locale));
                              }}
                            >
                              {cabinetCopy.cancelEdit}
                            </button>
                            <button
                              type="button"
                              className="panel-btn small"
                              onClick={() => setIsEditingApproved(true)}
                            >
                              {cabinetCopy.editAgain}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="owner-lock-note" role="note">
                          <div className="owner-lock-info">
                            <span><LockIcon /></span>
                            <p>{getEditLockHint(selected.status, cabinetCopy)}</p>
                          </div>
                          <button
                            type="button"
                            className="panel-btn owner-edit-data-btn"
                            onClick={() => setIsEditingApproved(true)}
                          >
                            <EditIcon />
                            <span>{cabinetCopy.editApprovedData}</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  <form onSubmit={(e) => { e.preventDefault(); if (isEditingApproved) void onSubmitProposedChanges(); else if (canEdit) void onSave(); }}>
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
                          <label htmlFor="venue-type">{cabinetCopy.roles.typeLabel}</label>
                          <select
                            id="venue-type"
                            disabled={!canEdit}
                            value={draft.venue_type}
                            onChange={(event) => updateDraft("venue_type", event.target.value)}
                            aria-describedby="venue-type-hint"
                          >
                            <option value="">{cabinetCopy.roles.typePlaceholder}</option>
                            {VENUE_TYPE_IDS.map((type) => (
                              <option key={type} value={type}>
                                {siteCopy.discover.chips[type]}
                              </option>
                            ))}
                          </select>
                          <p id="venue-type-hint" className="owner-field-hint">
                            {selected?.status === "PUBLISHED" ? cabinetCopy.roles.typeChangeModerated : cabinetCopy.roles.typeHint}
                          </p>
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
                            {ui.city}
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
                            aria-invalid={fieldErrors.phone ? true : undefined}
                            aria-describedby={fieldErrors.phone ? "venue-phone-error" : undefined}
                          />
                          {fieldErrors.phone && (
                            <small id="venue-phone-error" className="owner-field-error">{ui.invalidPhone}</small>
                          )}
                        </div>
                        <div className="field">
                          <label htmlFor="venue-email">{cabinetCopy.email}</label>
                          <input
                            id="venue-email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            disabled={!canEdit}
                            placeholder="hello@restaurant.md"
                            value={draft.email}
                            onChange={(event) => updateDraft("email", event.target.value)}
                            aria-invalid={fieldErrors.email ? true : undefined}
                            aria-describedby={fieldErrors.email ? "venue-email-error" : undefined}
                          />
                          {fieldErrors.email && (
                            <small id="venue-email-error" className="owner-field-error">{ui.invalidEmail}</small>
                          )}
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
                            aria-invalid={fieldErrors.website ? true : undefined}
                            aria-describedby="venue-website-hint"
                          />
                          {fieldErrors.website ? (
                            <small id="venue-website-hint" className="owner-field-error">{ui.invalidWebsite}</small>
                          ) : (
                            <p id="venue-website-hint" className="owner-field-hint">{cabinetCopy.websiteHint}</p>
                          )}
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
                              <img src={mediaUrl(url)} alt={ui.photoAlt.replace("{n}", String(index + 1))} />
                              {index === 0 && <span>{cabinetCopy.cover}</span>}
                              {canEdit && (
                                <button
                                  type="button"
                                  aria-label={ui.deletePhoto}
                                  title={ui.deletePhoto}
                                  disabled={busy}
                                  onClick={() => setRemovingPhoto(url)}
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
                              <small>{ui.photoFormats}</small>
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    {canEdit && (
                      <div className="owner-form-footer">
                        {isEditingApproved ? (
                          <>
                            <div>
                              <strong>{cabinetCopy.editApprovedData}</strong>
                              <p>{cabinetCopy.editModeActiveHint}</p>
                            </div>
                            <div className="owner-form-footer-actions">
                              <button
                                type="button"
                                className="panel-btn ghost"
                                disabled={busy}
                                onClick={() => {
                                  setDraft(toDraft(selected, locale));
                                  setIsEditingApproved(false);
                                }}
                              >
                                {cabinetCopy.cancelEdit}
                              </button>
                              <button
                                type="button"
                                className="panel-btn"
                                disabled={busy}
                                onClick={() => void onSubmitProposedChanges()}
                              >
                                {cabinetCopy.submitForModeration}
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <strong>{completion}% {cabinetCopy.filled}</strong>
                              <p>
                                {missingChecks.length
                                  ? ui.remaining.replace("{list}", missingChecks.map((check) => check.label).join(", "))
                                  : cabinetCopy.ready}
                              </p>
                            </div>
                            <div className="owner-form-footer-actions">
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
                          </>
                        )}
                      </div>
                    )}
                  </form>

                  <div className="owner-danger-zone">
                    <div>
                      <strong>{ui.dangerZoneTitle}</strong>
                      <p>{ui.dangerZoneHint}</p>
                    </div>
                    <button
                      type="button"
                      className="panel-btn ghost danger"
                      disabled={busy}
                      onClick={() => setDeletingApp(selected)}
                    >
                      {ui.deleteVenue}
                    </button>
                  </div>
                </section>
              )}

              {section === "floor" && (
                <CabinetFloorPanel venueId={effectiveVenueId} />
              )}

              {section === "menu" && (
                <CabinetMenuPanel venueId={effectiveVenueId} />
              )}

              {section === "rules" && (
                <CabinetRulesPanel venueId={effectiveVenueId} />
              )}

              {section === "staff" && (
                <CabinetStaffPanel venueId={effectiveVenueId} />
              )}

              {section === "shifts" && (
                <CabinetShiftsPlanner
                  venueId={effectiveVenueId}
                  onAlertCountChange={setShiftAlertCount}
                />
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
                          {selected.venue_id && <b>{reservationCounts[value]}</b>}
                        </button>
                      ))}
                    </div>
                    <span>
                      {filteredReservations.length} {pluralize(filteredReservations.length, ui.recordsForms, locale)}
                    </span>
                  </div>

                  {!selected.venue_id ? (
                    <div className="owner-section-empty">
                      <span aria-hidden="true"><ReservationsIcon /></span>
                      <h3>{ui.bookingsLockedTitle}</h3>
                      <p>{cabinetCopy.bookingsAppearAfterPublish}</p>
                    </div>
                  ) : filteredReservations.length === 0 ? (
                    <div className="owner-section-empty">
                      <span aria-hidden="true"><ReservationsIcon /></span>
                      <h3>
                        {reservationFilter === "upcoming"
                          ? ui.emptyUpcoming
                          : reservationFilter === "history"
                          ? ui.emptyHistory
                          : ui.emptyAll}
                      </h3>
                      <p>{reservationFilter === "history" ? ui.emptyHistoryHint : ui.emptyUpcomingHint}</p>
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
                          guestForms={ui.guestsForms}
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
                    <div className="owner-section-empty" role="status">
                      <span className="owner-inline-spinner" aria-hidden="true" />
                      <p>{cabinetCopy.loadingHistory}</p>
                    </div>
                  ) : activity.length === 0 ? (
                    <div className="owner-section-empty">
                      <span aria-hidden="true"><ActivityIcon /></span>
                      <h3>{cabinetCopy.emptyHistory}</h3>
                      <p>{ui.activityEmptyHint}</p>
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

      <CabinetConfirmDialog
        open={!!deletingApp}
        title={ui.deleteVenueTitle}
        text={ui.deleteVenueText.replace("{name}", deletingApp ? venueTitle(deletingApp) : "")}
        confirmLabel={ui.deleteVenue}
        cancelLabel={cabinetCopy.opsMenuCancel}
        busy={busy}
        onConfirm={() => void onDeleteConfirm()}
        onCancel={() => setDeletingApp(null)}
      />
      <CabinetConfirmDialog
        open={!!removingPhoto}
        title={ui.deletePhotoTitle}
        text={ui.deletePhotoText}
        confirmLabel={ui.deletePhoto}
        cancelLabel={cabinetCopy.opsMenuCancel}
        busy={busy}
        onConfirm={() => removingPhoto && void onRemovePhoto(removingPhoto)}
        onCancel={() => setRemovingPhoto(null)}
      />
    </PanelShell>
  );
}

function ReservationRow({
  reservation,
  locale,
  reservationLabels,
  tableLabel,
  guestLabel,
  guestForms,
}: {
  reservation: RestaurantReservation;
  locale: string;
  reservationLabels: Record<string, string>;
  tableLabel: string;
  guestLabel: string;
  guestForms: PluralForms;
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
          <strong title={reservation.guest_name || guestLabel}>{reservation.guest_name || guestLabel}</strong>
          {reservation.guest_email && (
            <a href={`mailto:${reservation.guest_email}`} title={reservation.guest_email}>
              {reservation.guest_email}
            </a>
          )}
        </p>
      </div>
      <div className="owner-booking-party">
        <strong>{reservation.guests}</strong>
        <span>{pluralize(reservation.guests, guestForms, locale)}</span>
      </div>
      <span className={`owner-reservation-status ${statusClass}`}>
        {reservationLabels[reservation.status] || reservation.status}
      </span>
    </article>
  );
}
