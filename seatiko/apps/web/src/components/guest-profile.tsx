"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, type Locale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import { getSiteCopy } from "@/lib/site-copy";
import {
  ApiError,
  cancelReservation,
  clearHistoryReservations,
  confirmArrival,
  deleteReservation,
  fetchReservations,
  fetchVenues,
  listEventInquiries,
  updateEmail,
  updateMe,
  updatePassword,
  updateReservation,
  type EventInquiry,
  type Reservation,
  type User,
  type Venue,
} from "@/lib/api";
import {
  addFavoriteVenue,
  emptyGuestLocalPrefs,
  loadGuestLocalPrefs,
  removeFavoriteVenue,
  saveGuestLocalPrefs,
  type FavoriteVenue,
  type GuestLocalPrefs,
} from "@/lib/guest-local-prefs";
import { venueBookingHref } from "@/lib/booking-link";

export type GuestProfileProps = {
  user: User | null;
  onRequestSignIn: () => void;
  onQuickDemoSignIn?: () => void;
  onUserUpdated?: (user: User) => void;
  onLogout: () => void;
  onToast?: (message: string) => void;
  embedded?: boolean;
};

type ProfileDraft = {
  first_name: string;
  last_name: string;
  display_name: string;
  phone: string;
};

type ProfileTab = "bookings" | "personal" | "diet" | "favorites" | "settings";

const COMMON_DIET_TAGS: Array<{ key: string; ru: string; en: string; ro: string }> = [
  { key: "vegetarian", ru: "Вегетарианство", en: "Vegetarian", ro: "Vegetarian" },
  { key: "vegan", ru: "Веганство", en: "Vegan", ro: "Vegan" },
  { key: "lactose_free", ru: "Без лактозы", en: "Lactose-free", ro: "Fără lactoză" },
  { key: "gluten_free", ru: "Без глютена", en: "Gluten-free", ro: "Fără gluten" },
  { key: "nut_allergy", ru: "Аллергия на орехи", en: "Nut allergy", ro: "Alergie la nuci" },
  { key: "seafood", ru: "Морепродукты", en: "Seafood only", ro: "Fructe de mare" },
  { key: "no_spicy", ru: "Не острое", en: "Mild / Not spicy", ro: "Nu picant" },
  { key: "halal", ru: "Халяль", en: "Halal", ro: "Halal" },
];

/* Demo simulation datasets for immediate testing */
function getDemoReservations(): Reservation[] {
  const now = new Date();
  const todayEve = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 30);
  if (todayEve.getTime() < now.getTime()) {
    todayEve.setDate(todayEve.getDate() + 1);
  }
  const pastDate = new Date(now.getTime() - 3 * 86400 * 1000);
  const cancelledDate = new Date(now.getTime() - 10 * 86400 * 1000);

  return [
    {
      id: "res-demo-active-1",
      user_id: "user-guest-demo",
      venue_id: "venue-1",
      venue_name: { ru: "Beermaster Pub", en: "Beermaster Pub", ro: "Beermaster Pub" },
      table_id: "t4",
      table_number: 4,
      table_numbers: [4],
      guests: 4,
      status: "CONFIRMED",
      reserved_for: todayEve.toISOString(),
      created_at: new Date(now.getTime() - 24 * 3600 * 1000).toISOString(),
      notes: "Столик у панорамного окна, детский стульчик",
    },
    {
      id: "res-demo-hist-1",
      user_id: "user-guest-demo",
      venue_id: "venue-2",
      venue_name: { ru: "Oliva Restaurant", en: "Oliva Restaurant", ro: "Oliva Restaurant" },
      table_id: "t2",
      table_number: 2,
      table_numbers: [2],
      guests: 2,
      status: "CHECKED_IN",
      reserved_for: pastDate.toISOString(),
      created_at: new Date(now.getTime() - 4 * 86400 * 1000).toISOString(),
      arrival_confirmed_at: pastDate.toISOString(),
      notes: "Романтический ужин на террасе",
    },
    {
      id: "res-demo-hist-2",
      user_id: "user-guest-demo",
      venue_id: "venue-3",
      venue_name: { ru: "Django Bar & Grill", en: "Django Bar & Grill", ro: "Django Bar & Grill" },
      table_id: "t8",
      table_number: 8,
      table_numbers: [8],
      guests: 6,
      status: "CANCELLED",
      reserved_for: cancelledDate.toISOString(),
      created_at: new Date(now.getTime() - 12 * 86400 * 1000).toISOString(),
      notes: "Отменено по просьбе гостя",
    },
  ];
}

function getDemoInquiries(): EventInquiry[] {
  const inqDate = new Date(Date.now() + 5 * 86400 * 1000);
  inqDate.setHours(19, 0, 0, 0);
  return [
    {
      id: "inq-demo-1",
      user_id: "user-guest-demo",
      venue_id: "venue-1",
      venue_name: { ru: "Beermaster Pub", en: "Beermaster Pub", ro: "Beermaster Pub" },
      event_type: "birthday",
      guest_count: 14,
      contact_name: "Александр Смирнов",
      contact_phone: "+373 68 123 456",
      preferred_date: inqDate.toISOString(),
      contact_method: "chat",
      notes: "Празднование дня рождения, вынос авторского торта со свечами, отдельная зона",
      admin_phone: "+373 231 2-44-11",
      status: "PENDING",
      created_at: new Date().toISOString(),
    },
  ];
}

const DEMO_FAVORITES = [
  { venueId: "venue-1", name: "Beermaster Pub" },
  { venueId: "venue-2", name: "Oliva Restaurant" },
  { venueId: "venue-3", name: "Django Bar & Grill" },
];

const FALLBACK_VENUES: Venue[] = [
  {
    id: "venue-1",
    name: { ru: "Beermaster Pub", en: "Beermaster Pub", ro: "Beermaster Pub" },
    city_id: "city-balti",
    address: { ru: "Бельцы, ул. Индепенденцей, 18", en: "Bălți, 18 Independenței St", ro: "Bălți, str. Independenței, 18" },
    cuisine: ["Европейская", "Крафтовое пиво", "Гриль"],
    price_level: 2,
    rating: 4.9,
    photos: ["/venues/beermaster.jpg"],
    description: { ru: "Популярный крафтовый гастропаб в центре Бельц", en: "Popular craft gastropub in Bălți", ro: "Gastropub artizanal popular în Bălți" },
  } as unknown as Venue,
  {
    id: "venue-2",
    name: { ru: "Oliva Restaurant", en: "Oliva Restaurant", ro: "Oliva Restaurant" },
    city_id: "city-balti",
    address: { ru: "Бельцы, ул. Штефан чел Маре, 54", en: "Bălți, 54 Ștefan cel Mare St", ro: "Bălți, str. Ștefan cel Mare, 54" },
    cuisine: ["Итальянская", "Средиземноморская", "Паста"],
    price_level: 2,
    rating: 4.8,
    photos: ["/venues/oliva.jpg"],
    description: { ru: "Уютный ресторан средиземноморской кухни", en: "Cozy Mediterranean restaurant", ro: "Restaurant primitor cu bucătărie mediteraneană" },
  } as unknown as Venue,
  {
    id: "venue-3",
    name: { ru: "Django Bar & Grill", en: "Django Bar & Grill", ro: "Django Bar & Grill" },
    city_id: "city-balti",
    address: { ru: "Бельцы, ул. Дечебал, 12", en: "Bălți, 12 Decebal St", ro: "Bălți, str. Дечебал, 12" },
    cuisine: ["Стейк-хаус", "Бургеры", "Американская"],
    price_level: 3,
    rating: 4.7,
    photos: ["/venues/django.jpg"],
    description: { ru: "Сочные стейки и бургеры на гриле", en: "Steaks and artisan grilled burgers", ro: "Fripturi suculente și burgeri la grătar" },
  } as unknown as Venue,
];

const DEMO_DIET_TAGS = ["Вегетарианство", "Без лактозы"];
const DEMO_ALLERGIES = "Аллергия на арахис и кешью. Просьба исключить кинзу из салатных заправок.";
const DEMO_DRAFT: ProfileDraft = {
  first_name: "Александр",
  last_name: "Смирнов",
  display_name: "Alex Smirnov",
  phone: "+373 68 123 456",
};

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SaladIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 21h10a5 5 0 0 0 5-5c0-2-2-4-5-4H7a5 5 0 0 0-5 5 5 5 0 0 0 5 4Z" />
      <path d="M12 3a9 9 0 0 0-5 7h10a9 9 0 0 0-5-7Z" />
    </svg>
  );
}

function HeartIcon({ filled = false }: { filled?: boolean } = {}) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function FlashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function MessageSquareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <line x1="13" y1="5" x2="13" y2="19" strokeDasharray="3 3" />
    </svg>
  );
}

function draftFromUser(user: User): ProfileDraft {
  return {
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    display_name: user.display_name ?? "",
    phone: user.phone ?? "",
  };
}

function isResActive(res: Reservation) {
  if (res.status === "CANCELLED") return false;
  if (res.status === "CONFIRMED" || res.status === "PENDING") {
    return true;
  }
  if (res.status === "CHECKED_IN") {
    const date = new Date(res.reserved_for);
    const now = new Date();
    return (
      date.toDateString() === now.toDateString() ||
      date.getTime() > now.getTime() - 4 * 60 * 60 * 1000
    );
  }
  return false;
}

export function GuestProfile({
  user,
  onRequestSignIn,
  onQuickDemoSignIn,
  onUserUpdated,
  onLogout,
  onToast,
  embedded = false,
}: GuestProfileProps) {
  const { locale, setLocale, t } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const copy = getSiteCopy(locale).account;
  const toast = onToast ?? (() => {});

  const isDemoGuest =
    user?.email === "guest@seatiko.local" || user?.id === "user-guest-demo";

  /* Simulation toggle: defaults to true for demo guest so all data is instantly viewable */
  const [demoPopulated, setDemoPopulated] = useState<boolean>(true);

  const [activeTab, setActiveTab] = useState<ProfileTab>("bookings");
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    user ? draftFromUser(user) : { first_name: "", last_name: "", display_name: "", phone: "" },
  );
  const [prefs, setPrefs] = useState<GuestLocalPrefs>(emptyGuestLocalPrefs);
  const [allergiesDraft, setAllergiesDraft] = useState("");
  const [dietTags, setDietTags] = useState<string[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [venues, setVenues] = useState<Venue[]>(FALLBACK_VENUES);
  const [bookingsLoadedFor, setBookingsLoadedFor] = useState<string | null>(null);
  const [busySave, setBusySave] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingRes, setCancellingRes] = useState<Reservation | null>(null);
  const [busyCancelAction, setBusyCancelAction] = useState(false);
  const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [bookingSubTab, setBookingSubTab] = useState<"active" | "history">("active");
  const [ticketModalRes, setTicketModalRes] = useState<Reservation | null>(null);

  // Avatar State (Placeholder with LocalStorage persistence)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (typeof window === "undefined" || !user) return null;
    try {
      return localStorage.getItem(`seatiko_guest_avatar_${user.id}`);
    } catch {
      return null;
    }
  });
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [focusResId] = useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("reservation"),
  );

  // Email & Password Change Modal States
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailConfirmInput, setEmailConfirmInput] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [oldPasswordInput, setOldPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Custom Event Inquiries
  const [eventInquiries, setEventInquiries] = useState<EventInquiry[]>([]);

  // Edit Reservation Modal State
  const [editingRes, setEditingRes] = useState<Reservation | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editGuests, setEditGuests] = useState(2);
  const [editNotes, setEditNotes] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Favorites session state (unfavorited cards remain visible until tab switch or page refresh)
  const [displayedFavorites, setDisplayedFavorites] = useState<FavoriteVenue[]>([]);
  const prefsFavoritesRef = useRef<FavoriteVenue[]>(prefs.favorites);

  useEffect(() => {
    prefsFavoritesRef.current = prefs.favorites;
  }, [prefs.favorites]);

  useEffect(() => {
    if (activeTab === "favorites") {
      setDisplayedFavorites(prefsFavoritesRef.current);
    }
  }, [activeTab]);

  const userId = user?.id;
  const loadingBookings = Boolean(userId) && bookingsLoadedFor !== userId;

  // Load user data, preferences, venues, and reservations
  useEffect(() => {
    if (!userId || !user) {
      queueMicrotask(() => {
        setDraft({ first_name: "", last_name: "", display_name: "", phone: "" });
        setPrefs(emptyGuestLocalPrefs());
        setAllergiesDraft("");
        setDietTags([]);
        setReservations([]);
        setEventInquiries([]);
      });
      return;
    }

    const nextDraft = draftFromUser(user);
    const loaded = loadGuestLocalPrefs(userId);
    const serverDiets = user.diet_preferences ?? [];
    const allergiesValue = loaded.allergies || serverDiets.join(", ");
    const effectiveFavorites =
      loaded.favorites.length > 0
        ? loaded.favorites
        : (user.favorite_venues?.map((id) => ({ venueId: id, name: id })) ?? []);

    queueMicrotask(() => {
      // If demo guest, hydrate draft with realistic demo info if blank
      if (isDemoGuest && (!nextDraft.first_name || !nextDraft.phone)) {
        setDraft(DEMO_DRAFT);
      } else {
        setDraft(nextDraft);
      }

      if (isDemoGuest && effectiveFavorites.length === 0) {
        setPrefs({ allergies: DEMO_ALLERGIES, favorites: DEMO_FAVORITES });
        prefsFavoritesRef.current = DEMO_FAVORITES;
        setDisplayedFavorites(DEMO_FAVORITES);
        setAllergiesDraft(DEMO_ALLERGIES);
        setDietTags(DEMO_DIET_TAGS);
      } else {
        setPrefs({ allergies: allergiesValue, favorites: effectiveFavorites });
        prefsFavoritesRef.current = effectiveFavorites;
        setDisplayedFavorites(effectiveFavorites);
        setAllergiesDraft(allergiesValue);
        setDietTags(
          serverDiets.length > 0
            ? serverDiets
            : allergiesValue
              ? allergiesValue.split(",").map((s) => s.trim()).filter(Boolean)
              : [],
        );
      }
    });

    let alive = true;
    Promise.all([
      fetchReservations().catch(() => [] as Reservation[]),
      fetchVenues("city-balti").catch(() => FALLBACK_VENUES),
      listEventInquiries().catch(() => [] as EventInquiry[]),
    ])
      .then(([resList, vList, inqList]) => {
        if (!alive) return;
        const finalVenues = vList.length > 0 ? vList : FALLBACK_VENUES;
        setVenues(finalVenues);

        // If demo guest and backend returned empty, populate simulation
        if (isDemoGuest && resList.length === 0) {
          setReservations(getDemoReservations());
        } else {
          setReservations(resList);
        }

        if (isDemoGuest && inqList.length === 0) {
          setEventInquiries(getDemoInquiries());
        } else {
          setEventInquiries(inqList);
        }

        const focused = focusResId ? resList.find((r) => r.id === focusResId) : undefined;
        if (focused && !isResActive(focused)) setBookingSubTab("history");
      })
      .finally(() => {
        if (alive) setBookingsLoadedFor(userId);
      });

    return () => {
      alive = false;
    };
  }, [userId, user, focusResId, isDemoGuest]);

  // Venue map for quick lookup
  const venueMap = useMemo(() => {
    const map = new Map<string, Venue>();
    FALLBACK_VENUES.forEach((v) => map.set(v.id, v));
    venues.forEach((v) => map.set(v.id, v));
    return map;
  }, [venues]);

  // Toggle demo simulation mode (between populated showcase and clean empty profile)
  const toggleDemoMode = () => {
    if (demoPopulated) {
      // Switch to empty state
      setDemoPopulated(false);
      setReservations([]);
      setEventInquiries([]);
      setPrefs({ allergies: "", favorites: [] });
      prefsFavoritesRef.current = [];
      setDisplayedFavorites([]);
      setDietTags([]);
      setAllergiesDraft("");
      setDraft({ first_name: "", last_name: "", display_name: "", phone: "" });
      toast(copy.demoToggleEmpty);
    } else {
      // Restore populated state
      setDemoPopulated(true);
      setReservations(getDemoReservations());
      setEventInquiries(getDemoInquiries());
      setPrefs({ allergies: DEMO_ALLERGIES, favorites: DEMO_FAVORITES });
      prefsFavoritesRef.current = DEMO_FAVORITES;
      setDisplayedFavorites(DEMO_FAVORITES);
      setDietTags(DEMO_DIET_TAGS);
      setAllergiesDraft(DEMO_ALLERGIES);
      setDraft(DEMO_DRAFT);
      toast(copy.demoToggleFull);
    }
  };

  // Save Identity Profile
  async function saveIdentity() {
    if (!user) return;
    setBusySave(true);
    try {
      if (!isDemoGuest) {
        const next = await updateMe({
          first_name: draft.first_name,
          last_name: draft.last_name,
          display_name: draft.display_name,
          phone: draft.phone,
        });
        onUserUpdated?.(next);
      } else {
        onUserUpdated?.({
          ...user,
          first_name: draft.first_name,
          last_name: draft.last_name,
          display_name: draft.display_name,
          phone: draft.phone,
        });
      }
      toast(copy.profileSaved || t("profile.saved"));
    } catch {
      toast(t("profile.save_failed"));
    } finally {
      setBusySave(false);
    }
  }

  // Toggle Diet Tag
  function toggleDietTag(tag: string) {
    setDietTags((prev) => {
      const exists = prev.includes(tag);
      const next = exists ? prev.filter((t) => t !== tag) : [...prev, tag];
      setAllergiesDraft(next.join(", "));
      return next;
    });
  }

  // Save Allergies & Diet
  async function saveAllergies() {
    if (!user) return;
    setBusySave(true);
    const combined = Array.from(
      new Set([
        ...dietTags,
        ...allergiesDraft
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ]),
    );
    const nextPrefs = { ...prefs, allergies: combined.join(", ") };
    saveGuestLocalPrefs(user.id, nextPrefs);
    setPrefs(nextPrefs);
    try {
      if (!isDemoGuest) {
        const updated = await updateMe({ diet_preferences: combined });
        onUserUpdated?.(updated);
      }
      toast(copy.dietSaved || t("profile.saved"));
    } catch {
      toast(copy.dietSaved || t("profile.saved"));
    } finally {
      setBusySave(false);
    }
  }

  // Remove Favorite
  async function removeFavorite(venueId: string) {
    if (!user) return;
    const next = removeFavoriteVenue(prefs, venueId);
    saveGuestLocalPrefs(user.id, next);
    setPrefs(next);
    prefsFavoritesRef.current = next.favorites;
    try {
      if (!isDemoGuest) {
        const updated = await updateMe({
          favorite_venues: next.favorites.map((f) => f.venueId),
        });
        onUserUpdated?.(updated);
      }
    } catch {
      /* local state is already saved */
    }
  }

  // Restore Favorite
  async function restoreFavorite(fav: FavoriteVenue) {
    if (!user) return;
    const next = addFavoriteVenue(prefs, fav);
    saveGuestLocalPrefs(user.id, next);
    setPrefs(next);
    prefsFavoritesRef.current = next.favorites;
    try {
      if (!isDemoGuest) {
        const updated = await updateMe({
          favorite_venues: next.favorites.map((f) => f.venueId),
        });
        onUserUpdated?.(updated);
      }
    } catch {
      /* local state is already saved */
    }
  }

  // Toggle Favorite with undo preservation during current tab session
  async function toggleFavorite(fav: FavoriteVenue) {
    const isFav = prefs.favorites.some((f) => f.venueId === fav.venueId);
    if (isFav) {
      await removeFavorite(fav.venueId);
      toast(copy.favRemovedToast || "Удалено из избранного. Нажмите на сердечко, чтобы восстановить.");
    } else {
      await restoreFavorite(fav);
      toast(copy.favRestoredToast || "Заведение возвращено в избранное");
    }
  }

  // Avatar Management Handlers
  function handleAvatarFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast("Файл слишком большой. Максимальный размер 5 МБ.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setAvatarUrl(dataUrl);
        try {
          if (user) localStorage.setItem(`seatiko_guest_avatar_${user.id}`, dataUrl);
        } catch {
          // ignore storage error
        }
        toast(copy.avatarUpdated || "Аватар профиля успешно обновлён");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleSelectPresetAvatar(preset: string) {
    setAvatarUrl(preset);
    try {
      if (user) localStorage.setItem(`seatiko_guest_avatar_${user.id}`, preset);
    } catch {
      // ignore
    }
    toast(copy.avatarUpdated || "Аватар профиля успешно обновлён");
  }

  function handleRemoveAvatar() {
    setAvatarUrl(null);
    try {
      if (user) localStorage.removeItem(`seatiko_guest_avatar_${user.id}`);
    } catch {
      // ignore
    }
    toast(copy.avatarRemoved || "Фото профиля удалено");
  }

  // Confirm Arrival
  async function handleConfirmArrival(resId: string) {
    setConfirmingId(resId);
    try {
      if (resId.startsWith("res-demo-")) {
        setReservations((prev) =>
          prev.map((r) =>
            r.id === resId
              ? { ...r, status: "CHECKED_IN", arrival_confirmed_at: new Date().toISOString() }
              : r,
          ),
        );
      } else {
        const updatedRes = await confirmArrival(resId);
        setReservations((prev) =>
          prev.map((r) => (r.id === resId ? { ...r, ...updatedRes } : r)),
        );
      }
      toast(copy.arrivalConfirmed || "Прибытие подтверждено! Официант оповещён.");
    } catch {
      toast("Не удалось подтвердить прибытие. Обратитесь к администратору.");
    } finally {
      setConfirmingId(null);
    }
  }

  // Cancel Reservation in Modal
  async function handleConfirmCancelModal(resId: string) {
    setBusyCancelAction(true);
    try {
      if (resId.startsWith("res-demo-")) {
        setReservations((prev) =>
          prev.map((r) => (r.id === resId ? { ...r, status: "CANCELLED" } : r)),
        );
      } else {
        await cancelReservation(resId);
        setReservations((prev) =>
          prev.map((r) => (r.id === resId ? { ...r, status: "CANCELLED" } : r)),
        );
      }
      setCancellingRes(null);
      toast("Бронирование стола успешно отменено.");
    } catch {
      toast("Не удалось отменить бронирование. Попробуйте позже.");
    } finally {
      setBusyCancelAction(false);
    }
  }

  // Delete/Purge Reservation Completely from History
  async function handleDeleteReservation(resId: string) {
    setDeletingId(resId);
    try {
      if (!resId.startsWith("res-demo-")) {
        await deleteReservation(resId);
      }
      setReservations((prev) => prev.filter((r) => r.id !== resId));
      toast("Запись удалена из истории.");
    } catch {
      toast("Не удалось удалить бронирование.");
    } finally {
      setDeletingId(null);
    }
  }

  // Clear History
  async function handleClearHistory() {
    setClearingHistory(true);
    try {
      if (!isDemoGuest) {
        const res = await clearHistoryReservations();
        setReservations((prev) => prev.filter(isResActive));
        toast(
          copy.clearHistorySuccess ||
            `История очищена (${res.cleared} записей удалено).`,
        );
      } else {
        setReservations((prev) => prev.filter(isResActive));
        toast(copy.clearHistorySuccess || "История бронирований успешно очищена.");
      }
    } catch {
      toast("Не удалось очистить историю.");
    } finally {
      setClearingHistory(false);
      setShowClearHistoryModal(false);
    }
  }

  const activeReservations = useMemo(
    () => reservations.filter(isResActive),
    [reservations],
  );

  const historyReservations = useMemo(
    () => reservations.filter((r) => !isResActive(r)),
    [reservations],
  );

  // Change Locale
  async function changeLocale(next: Locale) {
    setLocale(next);
    if (!user) return;
    try {
      if (!isDemoGuest) {
        const updated = await updateMe({ locale: next });
        onUserUpdated?.(updated);
      }
    } catch {
      /* best-effort locale sync */
    }
  }

  // Close modals on Escape key
  useEffect(() => {
    if (!isEmailModalOpen && !isPasswordModalOpen && !editingRes && !ticketModalRes && !cancellingRes) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsEmailModalOpen(false);
        setIsPasswordModalOpen(false);
        setEditingRes(null);
        setTicketModalRes(null);
        setCancellingRes(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEmailModalOpen, isPasswordModalOpen, editingRes, ticketModalRes, cancellingRes]);

  // Open Edit Booking Modal
  function openEditBookingModal(res: Reservation) {
    setEditingRes(res);
    setEditTime(new Date(res.reserved_for).toISOString().slice(0, 16));
    setEditGuests(res.guests || 2);
    setEditNotes(res.notes || "");
    setEditError(null);
  }

  // Save Edit Booking
  async function handleSaveEditBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRes) return;
    setEditBusy(true);
    setEditError(null);
    try {
      if (editingRes.id.startsWith("res-demo-")) {
        setReservations((prev) =>
          prev.map((r) =>
            r.id === editingRes.id
              ? {
                  ...r,
                  guests: editGuests,
                  reserved_for: new Date(editTime).toISOString(),
                  notes: editNotes.trim(),
                }
              : r,
          ),
        );
      } else {
        const updated = await updateReservation(editingRes.id, {
          guests: editGuests,
          reserved_for: new Date(editTime).toISOString(),
          notes: editNotes.trim(),
        });
        setReservations((prev) =>
          prev.map((r) => (r.id === editingRes.id ? { ...r, ...updated } : r)),
        );
      }
      setEditingRes(null);
      toast(copy.saveChanges || "Бронирование столика успешно обновлено!");
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === "table_not_free") {
        setEditError("Стол занят на это время. Выберите другое время.");
      } else {
        setEditError("Не удалось обновить бронь. Попробуйте еще раз.");
      }
    } finally {
      setEditBusy(false);
    }
  }

  // Open Email Modal
  function openEmailModal() {
    setEmailInput("");
    setEmailConfirmInput("");
    setEmailError(null);
    setIsEmailModalOpen(true);
  }

  // Open Password Modal
  function openPasswordModal() {
    setOldPasswordInput("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");
    setPasswordError(null);
    setShowOldPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setIsPasswordModalOpen(true);
  }

  // Submit Email Change
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    const cleaned = emailInput.trim();
    const cleanedConfirm = emailConfirmInput.trim();

    if (!cleaned) {
      setEmailError("Введите новый адрес электронной почты");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleaned)) {
      setEmailError("Пожалуйста, введите корректный адрес email");
      return;
    }
    if (user && cleaned.toLowerCase() === user.email.toLowerCase()) {
      setEmailError("Новый email совпадает с текущим адресом");
      return;
    }
    if (cleaned.toLowerCase() !== cleanedConfirm.toLowerCase()) {
      setEmailError("Введенные адреса электронной почты не совпадают");
      return;
    }

    setEmailBusy(true);
    try {
      if (!isDemoGuest) {
        const updatedUser = await updateEmail(cleaned);
        onUserUpdated?.(updatedUser);
      } else if (user) {
        onUserUpdated?.({ ...user, email: cleaned });
      }
      setIsEmailModalOpen(false);
      setEmailInput("");
      setEmailConfirmInput("");
      toast("Адрес электронной почты успешно изменен!");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "email_already_registered" || err.code === "email_taken") {
          setEmailError("Этот email уже зарегистрирован другим пользователем");
        } else {
          setEmailError(`Ошибка: ${err.code}`);
        }
      } else {
        setEmailError("Не удалось обновить email. Проверьте соединение.");
      }
    } finally {
      setEmailBusy(false);
    }
  }

  // Submit Password Change
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);

    if (!oldPasswordInput) {
      setPasswordError("Введите ваш текущий пароль");
      return;
    }
    if (!newPasswordInput) {
      setPasswordError("Введите новый пароль");
      return;
    }
    if (newPasswordInput.length < 6) {
      setPasswordError("Новый пароль должен содержать не менее 6 символов");
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordError("Новые пароли не совпадают");
      return;
    }

    setPasswordBusy(true);
    try {
      if (!isDemoGuest) {
        await updatePassword({
          old_password: oldPasswordInput,
          new_password: newPasswordInput,
        });
      }
      setIsPasswordModalOpen(false);
      setOldPasswordInput("");
      setNewPasswordInput("");
      setConfirmPasswordInput("");
      toast("Пароль успешно изменен!");
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === "invalid_old_password") {
        setPasswordError("Неверно указан текущий пароль");
      } else {
        setPasswordError("Не удалось изменить пароль.");
      }
    } finally {
      setPasswordBusy(false);
    }
  }

  // Initials for avatar
  const initials = (() => {
    if (!user) return "G";
    const f = draft.first_name.trim().charAt(0);
    const l = draft.last_name.trim().charAt(0);
    if (f || l) return `${f}${l}`.toUpperCase();
    if (draft.display_name.trim()) return draft.display_name.trim().charAt(0).toUpperCase();
    return user.email.charAt(0).toUpperCase();
  })();

  const fullName = (() => {
    const combined = `${draft.first_name} ${draft.last_name}`.trim();
    if (combined) return combined;
    if (draft.display_name.trim()) return draft.display_name.trim();
    return user?.email ?? copy.roleGuest;
  })();

  const rootClass = embedded
    ? "guest-profile guest-profile-embedded"
    : "guest-profile guest-profile-page";

  // Unauthenticated Welcome Card
  if (!user) {
    return (
      <div className={rootClass}>
        <div className="guest-auth-welcome-card">
          <div className="guest-welcome-avatar">
            <UserIcon />
          </div>
          <h2>{copy.welcomeTitle || t("profile.account_title")}</h2>
          <p className="guest-welcome-lead">{copy.welcomeLead}</p>
          <div className="guest-welcome-actions">
            <button
              type="button"
              className="btn btn-gold guest-welcome-btn-primary"
              onClick={onRequestSignIn}
            >
              <span>{copy.signInButton || t("profile.sign_in")}</span>
              <span aria-hidden="true">→</span>
            </button>
            {onQuickDemoSignIn && (
              <button
                type="button"
                className="btn-demo-chip guest-welcome-demo-btn"
                onClick={onQuickDemoSignIn}
                title="Быстрый вход в демонстрационный аккаунт"
              >
                <FlashIcon />
                <span>{copy.quickDemoButton}</span>
              </button>
            )}
            <Link href="/book" className="guest-welcome-browse-link">
              {copy.browseWithoutAuth}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {/* Role Redirect Banner if owner or admin accesses /account */}
      {user.role === "restaurant" && (
        <div className="guest-owner-role-banner guest-role-banner-owner" role="note">
          <div className="guest-role-banner-info">
            <span className="guest-role-banner-tag">🏢 {copy.roleRestaurant}</span>
            <h4>{copy.venueOwnerNotice}</h4>
            <p>{copy.venueOwnerHint}</p>
          </div>
          <Link href="/cabinet" className="btn btn-gold btn-sm guest-role-banner-btn">
            {copy.goToCabinet} →
          </Link>
        </div>
      )}

      {user.role === "staff" && (
        <div className="guest-owner-role-banner guest-role-banner-staff" role="note">
          <div className="guest-role-banner-info">
            <span className="guest-role-banner-tag">🛎️ {copy.roleStaff}</span>
            <h4>{copy.staffNotice}</h4>
            <p>{copy.staffHint}</p>
          </div>
          <Link href="/staff" className="btn btn-gold btn-sm guest-role-banner-btn">
            {copy.goToStaff} →
          </Link>
        </div>
      )}

      {user.role === "admin" && (
        <div className="guest-owner-role-banner guest-role-banner-admin" role="note">
          <div className="guest-role-banner-info">
            <span className="guest-role-banner-tag">🛡️ {copy.roleAdmin}</span>
            <h4>{copy.adminNotice}</h4>
            <p>{copy.adminHint}</p>
          </div>
          <Link href="/admin" className="btn btn-gold btn-sm guest-role-banner-btn">
            {copy.goToAdmin} →
          </Link>
        </div>
      )}

      {/* Hero Guest Identity Banner */}
      <section className="guest-hero-card">
        <div className="guest-hero-top">
          <div className="guest-avatar-wrap">
            <button
              type="button"
              className="guest-avatar-circle guest-avatar-interactive"
              onClick={() => setShowAvatarModal(true)}
              title={copy.changeAvatar || "Сменить фото"}
              aria-label={copy.changeAvatar || "Сменить фото"}
            >
              {avatarUrl ? (
                avatarUrl.startsWith("preset:") ? (
                  <span className="guest-avatar-preset">
                    {avatarUrl === "preset:crown"
                      ? "👑"
                      : avatarUrl === "preset:wine"
                        ? "🍷"
                        : avatarUrl === "preset:champagne"
                          ? "🥂"
                          : avatarUrl === "preset:dining"
                            ? "🍽️"
                            : avatarUrl === "preset:star"
                              ? "🌟"
                              : "🎩"}
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Avatar" className="guest-avatar-img" />
                )
              ) : (
                initials
              )}
              <div className="guest-avatar-hover-overlay">
                <CameraIcon />
              </div>
            </button>
            <button
              type="button"
              className="guest-avatar-edit-badge"
              onClick={() => setShowAvatarModal(true)}
              title={copy.changeAvatar || "Сменить фото"}
              aria-label={copy.changeAvatar || "Сменить фото"}
            >
              <CameraIcon />
            </button>
            <div className="guest-status-dot" title="Активный аккаунт" />
          </div>
          <div className="guest-hero-info">
            <div className="guest-hero-badge-row">
              <span className="guest-role-badge">
                {user.role === "restaurant"
                  ? copy.roleRestaurant
                  : user.role === "admin"
                    ? copy.roleAdmin
                    : copy.roleGuest}
              </span>
              <span className="guest-city-badge">{copy.cityBalti}</span>

              {/* Demo Mode Toggle Chip */}
              {isDemoGuest && (
                <button
                  type="button"
                  className={`guest-demo-mode-chip ${demoPopulated ? "is-active" : "is-empty"}`}
                  onClick={toggleDemoMode}
                  title={copy.demoToggleHint}
                >
                  <span className="guest-demo-chip-dot" />
                  <span>{demoPopulated ? copy.demoToggleFull : copy.demoToggleEmpty}</span>
                </button>
              )}
            </div>
            <h1 className="guest-hero-name">{fullName}</h1>
            <p className="guest-hero-contact">{user.email}</p>
          </div>
        </div>

        {/* Quick Stats Strip */}
        <div className="guest-stats-grid">
          <button
            type="button"
            className={`guest-stat-box ${activeTab === "bookings" ? "active" : ""}`}
            onClick={() => setActiveTab("bookings")}
          >
            <span className="guest-stat-val">{reservations.length}</span>
            <span className="guest-stat-label">
              <CalendarIcon /> {copy.statBookings}
            </span>
          </button>
          <button
            type="button"
            className={`guest-stat-box ${activeTab === "favorites" ? "active" : ""}`}
            onClick={() => setActiveTab("favorites")}
          >
            <span className="guest-stat-val">{prefs.favorites.length}</span>
            <span className="guest-stat-label">
              <HeartIcon /> {copy.statFavorites}
            </span>
          </button>
          <button
            type="button"
            className={`guest-stat-box ${activeTab === "diet" ? "active" : ""}`}
            onClick={() => setActiveTab("diet")}
          >
            <span className="guest-stat-val">{dietTags.length}</span>
            <span className="guest-stat-label">
              <SaladIcon /> {copy.statDiet}
            </span>
          </button>
        </div>
      </section>

      {/* Main Tab Switcher */}
      <nav className="guest-nav-tabs" aria-label="Разделы профиля">
        <button
          type="button"
          className={`guest-nav-tab ${activeTab === "bookings" ? "active" : ""}`}
          onClick={() => setActiveTab("bookings")}
        >
          <CalendarIcon />
          <span>{copy.tabBookings}</span>
          {reservations.length > 0 && (
            <span className="guest-tab-count">{reservations.length}</span>
          )}
        </button>
        <button
          type="button"
          className={`guest-nav-tab ${activeTab === "personal" ? "active" : ""}`}
          onClick={() => setActiveTab("personal")}
        >
          <UserIcon />
          <span>{copy.tabPersonal}</span>
        </button>
        <button
          type="button"
          className={`guest-nav-tab ${activeTab === "diet" ? "active" : ""}`}
          onClick={() => setActiveTab("diet")}
        >
          <SaladIcon />
          <span>{copy.tabDiet}</span>
        </button>
        <button
          type="button"
          className={`guest-nav-tab ${activeTab === "favorites" ? "active" : ""}`}
          onClick={() => setActiveTab("favorites")}
        >
          <HeartIcon />
          <span>{copy.tabFavorites}</span>
          {prefs.favorites.length > 0 && (
            <span className="guest-tab-count">{prefs.favorites.length}</span>
          )}
        </button>
        <button
          type="button"
          className={`guest-nav-tab ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          <SettingsIcon />
          <span>{copy.tabSettings}</span>
        </button>
      </nav>

      {/* Tab Panels */}
      <div className="guest-tab-content">
        {/* TAB 1: BOOKINGS */}
        {activeTab === "bookings" && (
          <div className="guest-panel guest-bookings-panel">
            <div className="guest-panel-header">
              <div>
                <h2>{copy.tabBookings}</h2>
                <p>Все ваши подтвержденные столы и история бронирований</p>
              </div>
              <Link href="/book" className="btn btn-gold guest-new-booking-btn">
                <span>+ {copy.bookTableCta}</span>
              </Link>
            </div>

            {/* Sub-tabs: Активные брони vs История броней */}
            <div className="guest-booking-subtabs-row">
              <div className="guest-booking-subtabs" role="tablist" aria-label="Фильтр бронирований">
                <button
                  type="button"
                  role="tab"
                  aria-selected={bookingSubTab === "active"}
                  className={`guest-booking-subtab ${bookingSubTab === "active" ? "active" : ""}`}
                  onClick={() => setBookingSubTab("active")}
                >
                  <span>{copy.subtabActive}</span>
                  <span className="guest-subtab-badge">{activeReservations.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={bookingSubTab === "history"}
                  className={`guest-booking-subtab ${bookingSubTab === "history" ? "active" : ""}`}
                  onClick={() => setBookingSubTab("history")}
                >
                  <span>{copy.subtabHistory}</span>
                  <span className="guest-subtab-badge">{historyReservations.length}</span>
                </button>
              </div>
            </div>

            {/* Event Inquiries Section if any */}
            {eventInquiries.length > 0 && (
              <div className="guest-events-section">
                <div className="guest-events-header">
                  <div className="guest-events-header-left">
                    <span className="guest-events-badge">🎂 {copy.subtabInquiries}</span>
                    <h3>{copy.eventInquiryTitle || "Заявки на банкеты и праздники"} ({eventInquiries.length})</h3>
                  </div>
                  <p>{copy.eventInquirySubtitle || "Индивидуальные мероприятия и торжества, согласовываемые с администрацией"}</p>
                </div>
                <div className="guest-events-grid">
                  {eventInquiries.map((inq) => {
                    const venue = venueMap.get(inq.venue_id);
                    const vName =
                      (typeof inq.venue_name === "object"
                        ? inq.venue_name[locale] || inq.venue_name.ru
                        : inq.venue_name) ||
                      (venue
                        ? typeof venue.name === "object"
                          ? venue.name[locale] || venue.name.ru
                          : venue.name
                        : "Ресторан");
                    const eventTitle =
                      inq.event_type === "birthday"
                        ? "День рождения"
                        : inq.event_type === "banquet"
                          ? "Банкет / Торжество"
                          : inq.event_type === "corporate"
                            ? "Корпоратив"
                            : inq.event_type === "romantic"
                              ? "Романтический ужин"
                              : "Праздничное мероприятие";
                    const eventIcon =
                      inq.event_type === "birthday"
                        ? "🎂"
                        : inq.event_type === "banquet"
                          ? "🥂"
                          : inq.event_type === "corporate"
                            ? "👔"
                            : "🎈";

                    const dateObj = new Date(inq.preferred_date);
                    const dateFormatted = !isNaN(dateObj.getTime())
                      ? dateObj.toLocaleString(
                          locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU",
                          {
                            day: "numeric",
                            month: "long",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )
                      : inq.preferred_date;

                    return (
                      <article key={inq.id} className="guest-event-card">
                        <div className="guest-event-card-aura" />

                        {/* Event Header */}
                        <div className="guest-event-header">
                          <div className="guest-event-header-main">
                            <div className="guest-event-icon-badge">
                              <span className="guest-event-icon-symbol">{eventIcon}</span>
                            </div>
                            <div className="guest-event-heading">
                              <div className="guest-event-badge-row">
                                <span className="guest-event-type-pill">{eventTitle}</span>
                                <span className="guest-event-id-tag">№ {inq.id.slice(-6).toUpperCase()}</span>
                              </div>
                              <Link
                                href={`/venues/${inq.venue_id}`}
                                className="guest-event-venue-name-link"
                                title={copy.eventVenueBtn || "Страница заведения →"}
                              >
                                <h4 className="guest-event-venue-name">{vName}</h4>
                              </Link>
                              <span className="guest-event-venue-meta">
                                <MapPinIcon /> {venue?.address ? (typeof venue.address === "object" ? venue.address[locale] || venue.address.ru : venue.address) : "г. Бельцы"}
                              </span>
                            </div>
                          </div>

                          <div className="guest-event-status-block">
                            <span className="guest-status-pill pending">
                              {copy.eventStatusPending || "На согласовании"}
                            </span>
                            <span className="guest-status-subtext">
                              {copy.eventStatusPendingSub || "Менеджер уточняет банкет"}
                            </span>
                          </div>
                        </div>

                        {/* Bento-style Key Metrics */}
                        <div className="guest-event-metrics-grid">
                          <div className="guest-event-metric-tile">
                            <div className="guest-event-metric-icon">
                              <ClockIcon />
                            </div>
                            <div className="guest-event-metric-content">
                              <span className="guest-event-metric-label">
                                {copy.eventDateLabel || "Дата и время"}
                              </span>
                              <strong className="guest-event-metric-val">
                                {dateFormatted}
                              </strong>
                            </div>
                          </div>

                          <div className="guest-event-metric-tile">
                            <div className="guest-event-metric-icon">
                              <UserIcon />
                            </div>
                            <div className="guest-event-metric-content">
                              <span className="guest-event-metric-label">
                                {copy.eventGuestsLabel || "Количество персон"}
                              </span>
                              <strong className="guest-event-metric-val">
                                {inq.guest_count} {inq.guest_count === 1 ? "гость" : inq.guest_count < 5 ? "гостя" : "гостей"}
                              </strong>
                            </div>
                          </div>

                          <div className="guest-event-metric-tile">
                            <div className="guest-event-metric-icon">
                              <MessageSquareIcon />
                            </div>
                            <div className="guest-event-metric-content">
                              <span className="guest-event-metric-label">
                                {copy.eventContactLabel || "Канал связи"}
                              </span>
                              <strong className="guest-event-metric-val">
                                {inq.contact_method === "chat" ? "Telegram / WhatsApp" : "Звонок администратора"}
                              </strong>
                            </div>
                          </div>
                        </div>

                        {/* Wishes & Special Requests */}
                        {inq.notes && (
                          <div className="guest-event-wishes-card">
                            <div className="guest-event-wishes-icon">
                              <SparklesIcon />
                            </div>
                            <div className="guest-event-wishes-body">
                              <span className="guest-event-wishes-label">
                                {copy.eventWishesLabel || "Пожелания к банкету и подаче"}
                              </span>
                              <p className="guest-event-wishes-text">«{inq.notes}»</p>
                            </div>
                          </div>
                        )}

                        {/* Footer Strip */}
                        <div className="guest-event-footer">
                          <div className="guest-event-manager-info">
                            <span className="guest-event-manager-caption">
                              {copy.eventManagerCaption || "Банкетная служба ресторана"}:
                            </span>
                            <a
                              href={`tel:${inq.admin_phone || "+37323124411"}`}
                              className="guest-event-manager-phone"
                              title="Позвонить напрямую в банкетную службу"
                            >
                              <PhoneIcon />
                              <span>{inq.admin_phone || "+373 231 2-44-11"}</span>
                            </a>
                          </div>

                          <div className="guest-event-actions">
                            <Link
                              href={`/venues/${inq.venue_id}`}
                              className="btn btn-outline guest-event-venue-btn"
                            >
                              <span>{copy.eventVenueBtn || "Страница заведения →"}</span>
                            </Link>
                            <a
                              href="https://t.me/seatiko_admin"
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-gold guest-event-chat-btn"
                            >
                              <MessageSquareIcon />
                              <span>{copy.eventChatBtn || "Чат в Telegram"}</span>
                            </a>
                            <a
                              href={`tel:${inq.admin_phone || "+37323124411"}`}
                              className="btn btn-outline guest-event-call-btn"
                            >
                              <PhoneIcon />
                              <span>{copy.eventCallBtn || "Позвонить"}</span>
                            </a>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {loadingBookings ? (
              <div className="guest-bookings-loading">
                <div className="account-spinner" />
                <p>Загрузка бронирований…</p>
              </div>
            ) : bookingSubTab === "active" ? (
              activeReservations.length === 0 ? (
                <div className="guest-empty-state">
                  <div className="guest-empty-icon">
                    <CalendarIcon />
                  </div>
                  <h3>{copy.noActiveBookings}</h3>
                  <p>{copy.noActiveBookingsHint}</p>
                  <div className="guest-empty-actions">
                    <Link href="/book" className="btn btn-gold">
                      {copy.bookTableCta} →
                    </Link>
                    <Link href="/venues" className="btn btn-outline">
                      {copy.browseVenuesCta}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="guest-active-bookings-section">
                  <div className="guest-active-bookings-header">
                    <div className="guest-active-bookings-header-left">
                      <span className="guest-active-bookings-badge">🍽️ {copy.subtabActive || "Предстоящие"}</span>
                      <h3>
                        {copy.activeBookingsSectionTitle || "Ваши актуальные брони"} ({activeReservations.length})
                      </h3>
                    </div>
                    <p>
                      {copy.activeBookingsSectionSubtitle || "Подтверждённые столики, готовые к вашему визиту"}
                    </p>
                  </div>

                  <div className="guest-bookings-list">
                  {activeReservations.map((res) => {
                    const venue = venueMap.get(res.venue_id);
                    const venueName =
                      (typeof res.venue_name === "object"
                        ? res.venue_name[locale] || res.venue_name.ru || res.venue_name.en
                        : res.venue_name) ||
                      (venue
                        ? typeof venue.name === "object"
                          ? venue.name[locale] || venue.name.ru
                          : venue.name
                        : "Ресторан");

                    const dateObj = new Date(res.reserved_for);
                    const isCheckedIn =
                      res.status === "CHECKED_IN" || !!res.arrival_confirmed_at;

                    const dateFormatted = !isNaN(dateObj.getTime())
                      ? dateObj.toLocaleString(
                          locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU",
                          {
                            day: "numeric",
                            month: "long",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )
                      : res.reserved_for;

                    const tableTag =
                      res.table_numbers && res.table_numbers.length > 1
                        ? `Столы №${res.table_numbers.join(", №")}`
                        : `Стол №${res.table_number ?? 1}`;

                    return (
                      <article
                        key={res.id}
                        id={`reservation-${res.id}`}
                        className={`guest-booking-card${res.id === focusResId ? " is-focused" : ""}`}
                      >
                        <div className="guest-booking-top">
                          <div className="guest-booking-venue">
                            <span className="guest-booking-tag">
                              <MapPinIcon /> {tableTag}
                            </span>
                            <h3>{venueName}</h3>
                          </div>
                          <div className="guest-booking-top-meta">
                            <div className="guest-status-wrapper">
                              <span
                                className={`guest-status-pill ${isCheckedIn ? "checked-in" : res.status === "CONFIRMED" ? "confirmed" : "pending"}`}
                              >
                                {isCheckedIn
                                  ? "Вы в ресторане 🍽️"
                                  : res.status === "CONFIRMED"
                                    ? "Стол закреплён ✓"
                                    : "Ожидает подтверждения ⏳"}
                              </span>
                              <span className="guest-status-subtext">
                                {isCheckedIn
                                  ? "Посадка зафиксирована, официант видит стол"
                                  : res.status === "CONFIRMED"
                                    ? "Ресторан ждёт вас к назначенному времени"
                                    : "Идет согласование стола"}
                              </span>
                            </div>
                            {!isCheckedIn && (
                              <button
                                type="button"
                                className="guest-booking-cancel-top-btn"
                                onClick={() => setCancellingRes(res)}
                                title="Отменить бронирование этого стола"
                              >
                                <XCircleIcon />
                                <span>{copy.cancelBooking}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="guest-booking-details">
                          <div className="guest-booking-detail-item">
                            <ClockIcon />
                            <span>{dateFormatted}</span>
                          </div>
                          <div className="guest-booking-detail-item">
                            <UserIcon />
                            <span>
                              {res.guests}{" "}
                              {res.guests === 1
                                ? "гость"
                                : res.guests < 5
                                  ? "гостя"
                                  : "гостей"}
                            </span>
                          </div>
                          {res.notes && (
                            <div className="guest-booking-detail-item guest-booking-notes">
                              <span>Пожелание: {res.notes}</span>
                            </div>
                          )}
                        </div>

                        <div className="guest-booking-actions">
                          {!isCheckedIn && (
                            <button
                              type="button"
                              className="btn btn-gold guest-confirm-btn"
                              disabled={confirmingId === res.id}
                              onClick={() => void handleConfirmArrival(res.id)}
                              title="Нажмите, когда прибудете в ресторан и займете стол"
                            >
                              <CheckIcon />
                              <span>
                                {confirmingId === res.id
                                  ? "Фиксация посадки…"
                                  : copy.confirmArrival}
                              </span>
                            </button>
                          )}

                          <button
                            type="button"
                            className="btn btn-outline guest-ticket-btn"
                            onClick={() => setTicketModalRes(res)}
                            title="Открыть цифровой билет с подтверждением"
                          >
                            <TicketIcon />
                            <span>{copy.shareTicket}</span>
                          </button>

                          {!isCheckedIn && (
                            <button
                              type="button"
                              className="btn btn-outline guest-edit-res-btn"
                              onClick={() => openEditBookingModal(res)}
                              title="Изменить дату, время или количество гостей"
                            >
                              <PencilIcon />
                              <span>{copy.editBooking}</span>
                            </button>
                          )}

                          <Link
                            href={`/venues/${res.venue_id}`}
                            className="btn btn-outline guest-venue-link"
                          >
                            <span>Меню и заведение →</span>
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                  </div>
                </div>
              )
            ) : (
              /* HISTORY SUB-TAB */
              historyReservations.length === 0 ? (
                <div className="guest-empty-state">
                  <div className="guest-empty-icon">
                    <ClockIcon />
                  </div>
                  <h3>{copy.noHistoryBookings}</h3>
                  <p>{copy.noHistoryBookingsHint}</p>
                </div>
              ) : (
                <div className="guest-history-section">
                  <div className="guest-history-toolbar">
                    <div className="guest-history-toolbar-info">
                      <div className="guest-history-toolbar-title-row">
                        <div className="guest-history-icon-circle">
                          <ClockIcon />
                        </div>
                        <h3>{copy.historyListTitle || "Завершённые визиты и архив"}</h3>
                        <span className="guest-history-count-badge">
                          {historyReservations.length}
                        </span>
                      </div>
                      <p className="guest-history-toolbar-caption">
                        {copy.historyListCaption ||
                          "Архив ваших посещений ресторанов для быстрого повторного бронирования любимого стола"}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="guest-clear-history-toolbar-btn"
                      disabled={clearingHistory}
                      onClick={() => setShowClearHistoryModal(true)}
                      title="Очистить историю всех завершённых и отменённых визитов"
                    >
                      <TrashIcon />
                      <span>{clearingHistory ? (copy.clearingHistory || "Очистка…") : (copy.clearHistory || "Очистить историю")}</span>
                    </button>
                  </div>

                  <div className="guest-bookings-list">
                    {historyReservations.map((res) => {
                      const venue = venueMap.get(res.venue_id);
                      const venueName =
                        (typeof res.venue_name === "object"
                          ? res.venue_name[locale] || res.venue_name.ru || res.venue_name.en
                          : res.venue_name) ||
                        (venue
                          ? typeof venue.name === "object"
                            ? venue.name[locale] || venue.name.ru
                            : venue.name
                          : "Ресторан");

                      const dateObj = new Date(res.reserved_for);
                      const isCancelled = res.status === "CANCELLED";

                      const dateFormatted = !isNaN(dateObj.getTime())
                        ? dateObj.toLocaleString(
                            locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU",
                            {
                              day: "numeric",
                              month: "long",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )
                        : res.reserved_for;

                      const tableTag =
                        res.table_numbers && res.table_numbers.length > 1
                          ? `Столы №${res.table_numbers.join(", №")}`
                          : `Стол №${res.table_number ?? 1}`;

                      return (
                        <article
                          key={res.id}
                          className={`guest-booking-card guest-history-card ${isCancelled ? "is-cancelled" : ""}`}
                        >
                          <div className="guest-booking-top">
                            <div className="guest-booking-venue">
                              <span className="guest-booking-tag">
                                <MapPinIcon /> {tableTag}
                              </span>
                              <h3>{venueName}</h3>
                            </div>
                            <div className="guest-booking-top-meta">
                              <div className="guest-status-wrapper">
                                <span
                                  className={`guest-status-pill ${isCancelled ? "cancelled" : "completed"}`}
                                >
                                  {isCancelled ? "Отменено ✕" : "Визит завершён ✓"}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="guest-booking-delete-top-btn"
                                disabled={deletingId === res.id}
                                onClick={() => void handleDeleteReservation(res.id)}
                                title="Удалить эту запись из истории"
                              >
                                <TrashIcon />
                                <span>{deletingId === res.id ? "…" : copy.deleteBooking}</span>
                              </button>
                            </div>
                          </div>

                          <div className="guest-booking-details">
                            <div className="guest-booking-detail-item">
                              <ClockIcon />
                              <span>{dateFormatted}</span>
                            </div>
                            <div className="guest-booking-detail-item">
                              <UserIcon />
                              <span>
                                {res.guests}{" "}
                                {res.guests === 1
                                  ? "гость"
                                  : res.guests < 5
                                    ? "гостя"
                                    : "гостей"}
                              </span>
                            </div>
                            {res.notes && (
                              <div className="guest-booking-detail-item guest-booking-notes">
                                <span>Пожелание: {res.notes}</span>
                              </div>
                            )}
                          </div>

                          <div className="guest-booking-actions">
                            <Link
                              href={venueBookingHref(res.venue_id)}
                              className="btn btn-gold guest-rebook-btn"
                            >
                              <span>{copy.rebookCta}</span>
                              <span aria-hidden="true">→</span>
                            </Link>
                            <Link
                              href={`/venues/${res.venue_id}`}
                              className="btn btn-outline guest-venue-link"
                            >
                              <span>Меню и заведение</span>
                            </Link>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="guest-history-footer-bar">
                    <span className="guest-history-footer-count">
                      {(copy.historyFooterCount || "Всего завершённых записей: {count}").replace(
                        "{count}",
                        String(historyReservations.length),
                      )}
                    </span>
                    <button
                      type="button"
                      className="guest-history-footer-clear-btn"
                      onClick={() => setShowClearHistoryModal(true)}
                    >
                      <TrashIcon />
                      <span>{copy.clearHistory || "Очистить историю"}</span>
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* TAB 2: PERSONAL IDENTITY */}
        {activeTab === "personal" && (
          <div className="guest-panel guest-personal-panel">
            <div className="guest-panel-header">
              <div>
                <h2>{copy.tabPersonal}</h2>
                <p>Ваши контактные данные для заведений и бронирований</p>
              </div>
            </div>

            <form
              className="guest-form"
              onSubmit={(e) => {
                e.preventDefault();
                void saveIdentity();
              }}
            >
              {/* Profile Avatar Management Strip */}
              <div className="guest-personal-avatar-strip">
                <div className="guest-personal-avatar-preview">
                  {avatarUrl ? (
                    avatarUrl.startsWith("preset:") ? (
                      <span className="guest-avatar-preset">
                        {avatarUrl === "preset:crown"
                          ? "👑"
                          : avatarUrl === "preset:wine"
                            ? "🍷"
                            : avatarUrl === "preset:champagne"
                              ? "🥂"
                              : avatarUrl === "preset:dining"
                                ? "🍽️"
                                : avatarUrl === "preset:star"
                                  ? "🌟"
                                  : "🎩"}
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="Avatar" className="guest-avatar-img" />
                    )
                  ) : (
                    initials
                  )}
                </div>
                <div className="guest-personal-avatar-info">
                  <h4>{copy.avatarTitle || "Фото профиля"}</h4>
                  <p>{copy.avatarHint || "Поддерживаются форматы JPG, PNG или WebP до 5 МБ."}</p>
                  <div className="guest-personal-avatar-actions">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm guest-avatar-change-btn"
                      onClick={() => setShowAvatarModal(true)}
                    >
                      <CameraIcon />
                      <span>{copy.changeAvatar || "Сменить фото"}</span>
                    </button>
                    {avatarUrl && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm guest-avatar-remove-btn"
                        onClick={handleRemoveAvatar}
                      >
                        <TrashIcon />
                        <span>{copy.avatarRemove || "Удалить фото"}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="guest-form-row">
                <div className="field">
                  <label htmlFor="prof-first">{copy.firstName}</label>
                  <input
                    id="prof-first"
                    type="text"
                    value={draft.first_name}
                    placeholder="Например, Александр"
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, first_name: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="prof-last">{copy.lastName}</label>
                  <input
                    id="prof-last"
                    type="text"
                    value={draft.last_name}
                    placeholder="Например, Смирнов"
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, last_name: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="guest-form-row">
                <div className="field">
                  <label htmlFor="prof-display">{copy.displayName}</label>
                  <input
                    id="prof-display"
                    type="text"
                    value={draft.display_name}
                    placeholder="Как обращаться к вам"
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, display_name: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="prof-phone">{copy.phone}</label>
                  <input
                    id="prof-phone"
                    type="tel"
                    value={draft.phone}
                    placeholder="+373 68 123 456"
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, phone: e.target.value }))
                    }
                  />
                  <span className="guest-field-hint">{copy.phoneHint}</span>
                </div>
              </div>

              <div className="field">
                <label htmlFor="prof-email">{t("profile.email")}</label>
                <div className="guest-email-input-group">
                  <input
                    id="prof-email"
                    type="email"
                    value={user.email}
                    readOnly
                    className="guest-readonly-input"
                  />
                  <button
                    type="button"
                    className="btn btn-outline guest-field-action-btn"
                    onClick={openEmailModal}
                    title="Сменить адрес электронной почты"
                  >
                    <PencilIcon />
                    <span>{copy.changeEmail}</span>
                  </button>
                </div>
                <span className="guest-readonly-hint">
                  🔒 Адрес используется для авторизации и подтверждения бронирований
                </span>
              </div>

              <button
                type="submit"
                className="btn btn-gold guest-submit-btn"
                disabled={busySave}
              >
                <span>{busySave ? "Сохранение…" : copy.saveProfile}</span>
              </button>
            </form>

            {/* SECURITY & CREDENTIALS SECTION */}
            <div className="guest-security-section">
              <div className="guest-security-header">
                <div>
                  <h3>Учетная запись и безопасность</h3>
                  <p>Управление доступом, смена электронной почты и пароля</p>
                </div>
              </div>

              <div className="guest-security-cards">
                {/* Email Security Card */}
                <div className="guest-security-card">
                  <div className="guest-security-icon-wrap">
                    <MailIcon />
                  </div>
                  <div className="guest-security-info">
                    <div className="guest-security-title-wrap">
                      <span className="guest-security-label">Email учетной записи</span>
                      <span className="guest-security-badge-verified">Подтвержден ✓</span>
                    </div>
                    <div className="guest-security-value">{user.email}</div>
                    <p className="guest-security-desc">
                      Используется для входа и получения уведомлений о статусе бронирования
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline guest-security-action-btn"
                    onClick={openEmailModal}
                  >
                    <PencilIcon />
                    <span>{copy.changeEmail}</span>
                  </button>
                </div>

                {/* Password Security Card */}
                <div className="guest-security-card">
                  <div className="guest-security-icon-wrap">
                    <LockIcon />
                  </div>
                  <div className="guest-security-info">
                    <div className="guest-security-title-wrap">
                      <span className="guest-security-label">Пароль для входа</span>
                      <span className="guest-security-badge-protected">Защищен 🔒</span>
                    </div>
                    <div className="guest-security-value guest-password-mask">••••••••••••</div>
                    <p className="guest-security-desc">
                      Рекомендуем использовать надежный пароль не менее 6 символов
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline guest-security-action-btn"
                    onClick={openPasswordModal}
                  >
                    <LockIcon />
                    <span>{copy.changePassword}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DIET & ALLERGIES */}
        {activeTab === "diet" && (
          <div className="guest-panel guest-diet-panel">
            <div className="guest-panel-header">
              <div>
                <h2>{copy.dietTitle}</h2>
                <p>{copy.dietSubtitle}</p>
              </div>
            </div>

            <div className="guest-diet-chips-wrap">
              <span className="guest-diet-chips-title">Популярные особенности питания:</span>
              <div className="guest-diet-chips">
                {COMMON_DIET_TAGS.map((item) => {
                  const label = item[locale as "ru" | "en" | "ro"] || item.ru;
                  const active = dietTags.includes(item.ru) || dietTags.includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`guest-diet-chip ${active ? "active" : ""}`}
                      onClick={() => toggleDietTag(item.ru)}
                    >
                      <span>{active ? "✓ " : "+ "}</span>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field guest-diet-textarea-wrap">
              <label htmlFor="prof-diet-text">{copy.dietAllergiesLabel}</label>
              <textarea
                id="prof-diet-text"
                rows={3}
                className="guest-textarea"
                placeholder={copy.dietAllergiesPlaceholder}
                value={allergiesDraft}
                onChange={(e) => setAllergiesDraft(e.target.value)}
              />
              <p className="guest-field-hint">
                Синхронизируется с вашим профилем и передается на кухню при подтверждении брони.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-gold guest-submit-btn"
              disabled={busySave}
              onClick={() => void saveAllergies()}
            >
              <span>{busySave ? "Сохранение…" : copy.saveDiet}</span>
            </button>
          </div>
        )}

        {/* TAB 4: FAVORITES */}
        {activeTab === "favorites" && (
          <div className="guest-panel guest-favorites-panel">
            <div className="guest-panel-header">
              <div>
                <h2>{copy.tabFavorites}</h2>
                <p>Ваши сохраненные заведения для быстрого перехода и бронирования</p>
              </div>
            </div>

            {displayedFavorites.length === 0 ? (
              <div className="guest-empty-state">
                <div className="guest-empty-icon">
                  <HeartIcon />
                </div>
                <h3>{copy.noFavorites}</h3>
                <p>{copy.noFavoritesHint}</p>
                <Link href="/venues" className="btn btn-gold">
                  {copy.browseVenuesCta} →
                </Link>
              </div>
            ) : (
              <div className="guest-favorites-grid">
                {displayedFavorites.map((fav) => {
                  const venue = venueMap.get(fav.venueId);
                  const isFav = prefs.favorites.some((f) => f.venueId === fav.venueId);
                  const venueName =
                    venue && typeof venue.name === "object"
                      ? venue.name[locale] || venue.name.ru
                      : fav.name;

                  const addressText =
                    venue?.address && typeof venue.address === "object"
                      ? venue.address[locale] || venue.address.ru
                      : copy.cityBalti;

                  const cuisineText = Array.isArray(venue?.cuisine)
                    ? venue.cuisine.join(", ")
                    : typeof venue?.cuisine === "string"
                      ? venue.cuisine
                      : "Ресторан";

                  return (
                    <div
                      key={fav.venueId}
                      className={`guest-favorite-card ${!isFav ? "is-unfavorited" : ""}`}
                    >
                      <div className="guest-favorite-top">
                        <div className="guest-favorite-title-row">
                          <div className="guest-favorite-title-group">
                            <h4>{venueName}</h4>
                            {!isFav && (
                              <button
                                type="button"
                                className="guest-favorite-removed-pill"
                                onClick={() => void toggleFavorite(fav)}
                                title={copy.favRestoreTitle || "Вернуть в избранное"}
                              >
                                <span>↺ {copy.favRemovedBadge || "Удалено · Нажмите чтобы вернуть"}</span>
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            className={`guest-fav-heart-btn ${!isFav ? "is-inactive" : ""}`}
                            onClick={() => void toggleFavorite(fav)}
                            title={isFav ? (copy.favRemoveTitle || "Удалить из избранного") : (copy.favRestoreTitle || "Вернуть в избранное")}
                            aria-label={isFav ? (copy.favRemoveTitle || "Удалить из избранного") : (copy.favRestoreTitle || "Вернуть в избранное")}
                          >
                            <HeartIcon filled={isFav} />
                          </button>
                        </div>

                        <div className="guest-favorite-badges">
                          {venue?.rating && (
                            <span className="guest-favorite-rating-pill">
                              ★ {venue.rating}
                            </span>
                          )}
                          {venue?.price_level && (
                            <span className="guest-favorite-price-pill">
                              {"€".repeat(venue.price_level)}
                            </span>
                          )}
                          <span className="guest-favorite-cuisine-tag">
                            {cuisineText}
                          </span>
                        </div>

                        <div className="guest-favorite-address">
                          <MapPinIcon />
                          <span>{addressText}</span>
                        </div>

                        {venue?.description && (
                          <p className="guest-favorite-desc">
                            {typeof venue.description === "object"
                              ? venue.description[locale] || venue.description.ru
                              : venue.description}
                          </p>
                        )}
                      </div>

                      <div className="guest-favorite-actions">
                        <Link
                          href={venueBookingHref(fav.venueId)}
                          className="btn btn-gold guest-fav-book-btn"
                        >
                          <span>{copy.bookTableCta}</span>
                          <span aria-hidden="true">→</span>
                        </Link>
                        <Link
                          href={`/venues/${fav.venueId}`}
                          className="btn btn-outline guest-fav-menu-btn"
                        >
                          <span>{locale === "ro" ? "Meniu" : locale === "en" ? "Menu" : "Меню"}</span>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: SETTINGS & PREFERENCES */}
        {activeTab === "settings" && (
          <div className="guest-panel guest-settings-panel">
            <div className="guest-panel-header">
              <div>
                <h2>{copy.tabSettings}</h2>
                <p>Языковые параметры, тема оформления и безопасность</p>
              </div>
            </div>

            <div className="guest-settings-list">
              {/* Language Switch */}
              <div className="guest-settings-row">
                <div className="guest-setting-meta">
                  <strong>{copy.languageLabel}</strong>
                  <span>Выберите язык интерфейса платформы</span>
                </div>
                <div className="guest-lang-switch">
                  {(["ru", "en", "ro"] as Locale[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      className={`guest-lang-btn ${locale === l ? "active" : ""}`}
                      onClick={() => void changeLocale(l)}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme Toggle */}
              <div className="guest-settings-row">
                <div className="guest-setting-meta">
                  <strong>{copy.themeLabel}</strong>
                  <span>
                    Текущая тема: {theme === "dark" ? "Тёмная" : "Светлая"}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-outline guest-theme-btn"
                  onClick={toggleTheme}
                >
                  {theme === "dark" ? "☀️ Светлая тема" : "🌙 Тёмная тема"}
                </button>
              </div>

              {/* Age 18+ */}
              <div className="guest-settings-row">
                <div className="guest-setting-meta">
                  <strong>{t("profile.age18")}</strong>
                  <span>Необходимо для заказа алкогольных напитков</span>
                </div>
                <span className="guest-age-status-badge">
                  {t("profile.age18_unverified")}
                </span>
              </div>

              {/* Logout Row */}
              <div className="guest-settings-row guest-logout-row">
                <div className="guest-setting-meta">
                  <strong>{copy.logoutButton}</strong>
                  <span>Завершить текущую сессию на этом устройстве</span>
                </div>
                <button
                  type="button"
                  className="btn btn-outline guest-logout-btn"
                  onClick={onLogout}
                >
                  <LogOutIcon />
                  <span>{copy.logoutButton}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DIGITAL TICKET MODAL */}
        {ticketModalRes && (
          <div
            className="guest-modal-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setTicketModalRes(null);
            }}
          >
            <div
              className="guest-modal-dialog guest-ticket-modal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-ticket-title"
            >
              <div className="guest-modal-header">
                <div className="guest-modal-header-info">
                  <div className="guest-modal-icon-badge">
                    <TicketIcon />
                  </div>
                  <div>
                    <h3 id="modal-ticket-title">Электронный билет брони</h3>
                    <p>Покажите этот экран при входе в ресторан</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="guest-modal-close"
                  onClick={() => setTicketModalRes(null)}
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </div>

              <div className="guest-ticket-card-content">
                <div className="guest-ticket-top-banner">
                  <div className="guest-ticket-venue-badge">
                    <span>
                      {(typeof ticketModalRes.venue_name === "object"
                        ? ticketModalRes.venue_name[locale] || ticketModalRes.venue_name.ru
                        : ticketModalRes.venue_name) || "Ресторан"}
                    </span>
                  </div>
                  <span className="guest-ticket-code">
                    #STK-{ticketModalRes.id.slice(-4).toUpperCase()}
                  </span>
                </div>

                <div className="guest-ticket-details-grid">
                  <div className="guest-ticket-detail-item">
                    <span className="guest-ticket-label">Стол</span>
                    <strong>
                      {ticketModalRes.table_numbers && ticketModalRes.table_numbers.length > 1
                        ? `№${ticketModalRes.table_numbers.join(", №")}`
                        : `№${ticketModalRes.table_number || 1}`}
                    </strong>
                  </div>
                  <div className="guest-ticket-detail-item">
                    <span className="guest-ticket-label">Гостей</span>
                    <strong>{ticketModalRes.guests} чел.</strong>
                  </div>
                  <div className="guest-ticket-detail-item">
                    <span className="guest-ticket-label">Время</span>
                    <strong>
                      {new Date(ticketModalRes.reserved_for).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </strong>
                  </div>
                  <div className="guest-ticket-detail-item">
                    <span className="guest-ticket-label">Дата</span>
                    <strong>
                      {new Date(ticketModalRes.reserved_for).toLocaleDateString(
                        locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU",
                        { day: "numeric", month: "short" },
                      )}
                    </strong>
                  </div>
                </div>

                <div className="guest-ticket-qr-preview">
                  <div className="guest-ticket-barcode-box">
                    <div className="guest-ticket-barcode-lines" />
                    <span>SEATIKO SECURE BOOKING PASS</span>
                  </div>
                  <span className="guest-ticket-scan-hint">
                    Бронь гарантирована платформой Seatiko
                  </span>
                </div>
              </div>

              <div className="guest-modal-footer">
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => setTicketModalRes(null)}
                >
                  Готово
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CHANGE EMAIL MODAL */}
        {isEmailModalOpen && (
          <div
            className="guest-modal-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsEmailModalOpen(false);
            }}
          >
            <div
              className="guest-modal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-email-title"
            >
              <div className="guest-modal-header">
                <div className="guest-modal-header-info">
                  <div className="guest-modal-icon-badge">
                    <MailIcon />
                  </div>
                  <div>
                    <h3 id="modal-email-title">{copy.changeEmail}</h3>
                    <p>Укажите новый адрес для входа и бронирований</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="guest-modal-close"
                  onClick={() => setIsEmailModalOpen(false)}
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleEmailSubmit}>
                <div className="guest-modal-body">
                  {emailError && (
                    <div className="guest-modal-error" role="alert">
                      <XCircleIcon />
                      <span>{emailError}</span>
                    </div>
                  )}

                  <div className="guest-modal-info-row">
                    <span className="guest-modal-info-label">{copy.currentEmail}:</span>
                    <span className="guest-modal-info-val">{user?.email}</span>
                  </div>

                  <div className="guest-modal-field">
                    <label htmlFor="modal-new-email">
                      {copy.newEmail} <span className="req">*</span>
                    </label>
                    <input
                      id="modal-new-email"
                      type="email"
                      autoFocus
                      required
                      placeholder="novyy.email@example.com"
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value);
                        if (emailError) setEmailError(null);
                      }}
                    />
                  </div>

                  <div className="guest-modal-field">
                    <label htmlFor="modal-confirm-email">
                      {copy.confirmEmail} <span className="req">*</span>
                    </label>
                    <input
                      id="modal-confirm-email"
                      type="email"
                      required
                      placeholder="novyy.email@example.com"
                      value={emailConfirmInput}
                      onChange={(e) => {
                        setEmailConfirmInput(e.target.value);
                        if (emailError) setEmailError(null);
                      }}
                    />
                    <span className="guest-modal-hint">
                      Убедитесь, что у вас есть доступ к этому почтовому ящику.
                    </span>
                  </div>
                </div>

                <div className="guest-modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setIsEmailModalOpen(false)}
                    disabled={emailBusy}
                  >
                    {copy.cancelAction}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-gold"
                    disabled={emailBusy || !emailInput.trim() || !emailConfirmInput.trim()}
                  >
                    {emailBusy ? "Сохранение…" : copy.saveChanges}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* CHANGE PASSWORD MODAL */}
        {isPasswordModalOpen && (
          <div
            className="guest-modal-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsPasswordModalOpen(false);
            }}
          >
            <div
              className="guest-modal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-password-title"
            >
              <div className="guest-modal-header">
                <div className="guest-modal-header-info">
                  <div className="guest-modal-icon-badge">
                    <LockIcon />
                  </div>
                  <div>
                    <h3 id="modal-password-title">{copy.changePassword}</h3>
                    <p>Обновите пароль для входа в учетную запись</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="guest-modal-close"
                  onClick={() => setIsPasswordModalOpen(false)}
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handlePasswordSubmit}>
                <div className="guest-modal-body">
                  {passwordError && (
                    <div className="guest-modal-error" role="alert">
                      <XCircleIcon />
                      <span>{passwordError}</span>
                    </div>
                  )}

                  <div className="guest-modal-field">
                    <label htmlFor="modal-old-pass">
                      {copy.oldPassword} <span className="req">*</span>
                    </label>
                    <div className="guest-password-input-wrap">
                      <input
                        id="modal-old-pass"
                        type={showOldPassword ? "text" : "password"}
                        autoFocus
                        required
                        placeholder="Введите текущий пароль"
                        value={oldPasswordInput}
                        onChange={(e) => {
                          setOldPasswordInput(e.target.value);
                          if (passwordError) setPasswordError(null);
                        }}
                      />
                      <button
                        type="button"
                        className="guest-pass-toggle-btn"
                        onClick={() => setShowOldPassword((v) => !v)}
                        aria-label={showOldPassword ? "Скрыть пароль" : "Показать пароль"}
                        tabIndex={-1}
                      >
                        {showOldPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>

                  <div className="guest-modal-field">
                    <label htmlFor="modal-new-pass">
                      {copy.newPassword} <span className="req">*</span>
                    </label>
                    <div className="guest-password-input-wrap">
                      <input
                        id="modal-new-pass"
                        type={showNewPassword ? "text" : "password"}
                        required
                        placeholder="Не менее 6 символов"
                        value={newPasswordInput}
                        onChange={(e) => {
                          setNewPasswordInput(e.target.value);
                          if (passwordError) setPasswordError(null);
                        }}
                      />
                      <button
                        type="button"
                        className="guest-pass-toggle-btn"
                        onClick={() => setShowNewPassword((v) => !v)}
                        aria-label={showNewPassword ? "Скрыть пароль" : "Показать пароль"}
                        tabIndex={-1}
                      >
                        {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                    <span className="guest-modal-hint">
                      Минимум 6 символов. Используйте буквы и цифры.
                    </span>
                  </div>

                  <div className="guest-modal-field">
                    <label htmlFor="modal-confirm-pass">
                      {copy.confirmPassword} <span className="req">*</span>
                    </label>
                    <div className="guest-password-input-wrap">
                      <input
                        id="modal-confirm-pass"
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        placeholder="Повторите новый пароль"
                        value={confirmPasswordInput}
                        onChange={(e) => {
                          setConfirmPasswordInput(e.target.value);
                          if (passwordError) setPasswordError(null);
                        }}
                      />
                      <button
                        type="button"
                        className="guest-pass-toggle-btn"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="guest-modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setIsPasswordModalOpen(false)}
                    disabled={passwordBusy}
                  >
                    {copy.cancelAction}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-gold"
                    disabled={
                      passwordBusy ||
                      !oldPasswordInput ||
                      !newPasswordInput ||
                      !confirmPasswordInput
                    }
                  >
                    {passwordBusy ? "Обновление…" : copy.saveChanges}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* EDIT RESERVATION MODAL */}
        {editingRes && (
          <div
            className="guest-modal-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setEditingRes(null);
            }}
          >
            <div
              className="guest-modal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-edit-booking-title"
            >
              <div className="guest-modal-header">
                <div className="guest-modal-header-info">
                  <div className="guest-modal-icon-badge">
                    <CalendarIcon />
                  </div>
                  <div>
                    <h3 id="modal-edit-booking-title">{copy.editModalTitle}</h3>
                    <p>
                      {(typeof editingRes.venue_name === "object"
                        ? editingRes.venue_name[locale] || editingRes.venue_name.ru
                        : editingRes.venue_name) || "Ресторан"}{" "}
                      ·{" "}
                      {editingRes.table_numbers && editingRes.table_numbers.length > 1
                        ? `Столы №${editingRes.table_numbers.join(", №")}`
                        : `Стол №${editingRes.table_number || 1}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="guest-modal-close"
                  onClick={() => setEditingRes(null)}
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveEditBooking}>
                <div className="guest-modal-body">
                  {editError && (
                    <div className="guest-modal-error" role="alert">
                      <XCircleIcon />
                      <span>{editError}</span>
                    </div>
                  )}

                  <div className="guest-modal-field">
                    <label htmlFor="modal-edit-time">
                      {copy.editTime} <span className="req">*</span>
                    </label>
                    <input
                      id="modal-edit-time"
                      type="datetime-local"
                      required
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                    />
                  </div>

                  <div className="guest-modal-field">
                    <label htmlFor="modal-edit-guests">
                      {copy.editGuests} <span className="req">*</span>
                    </label>
                    <input
                      id="modal-edit-guests"
                      type="number"
                      min={1}
                      max={20}
                      required
                      value={editGuests}
                      onChange={(e) => setEditGuests(Number(e.target.value) || 1)}
                    />
                  </div>

                  <div className="guest-modal-field">
                    <label htmlFor="modal-edit-notes">{copy.editNotes}</label>
                    <input
                      id="modal-edit-notes"
                      type="text"
                      placeholder="Например: тихий угол, детский стул..."
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div className="guest-modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setEditingRes(null)}
                    disabled={editBusy}
                  >
                    {copy.cancelAction}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-gold"
                    disabled={editBusy || !editTime}
                  >
                    {editBusy ? "Сохранение…" : copy.saveChanges}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* CANCEL RESERVATION CONFIRMATION MODAL */}
        {cancellingRes && (
          <div
            className="guest-modal-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setCancellingRes(null);
            }}
          >
            <div
              className="guest-modal-dialog guest-cancel-modal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-cancel-title"
            >
              <div className="guest-modal-header">
                <div className="guest-modal-header-info">
                  <div className="guest-modal-icon-badge">
                    <XCircleIcon />
                  </div>
                  <div>
                    <h3 id="modal-cancel-title">Отмена бронирования</h3>
                    <p>
                      {(typeof cancellingRes.venue_name === "object"
                        ? cancellingRes.venue_name[locale] || cancellingRes.venue_name.ru
                        : cancellingRes.venue_name) || "Ресторан"}{" "}
                      ·{" "}
                      {cancellingRes.table_numbers && cancellingRes.table_numbers.length > 1
                        ? `Столы №${cancellingRes.table_numbers.join(", №")}`
                        : `Стол №${cancellingRes.table_number || 1}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="guest-modal-close"
                  onClick={() => setCancellingRes(null)}
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </div>

              <div className="guest-modal-body">
                <p className="guest-cancel-modal-desc">
                  Вы уверены, что хотите отменить бронирование стола на{" "}
                  <strong>
                    {new Date(cancellingRes.reserved_for).toLocaleString(
                      locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU",
                      { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" },
                    )}
                  </strong>
                  ? Стол освободится для других гостей, а запись переместится в историю.
                </p>
              </div>

              <div className="guest-modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCancellingRes(null)}
                >
                  Оставить бронь
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busyCancelAction}
                  onClick={() => void handleConfirmCancelModal(cancellingRes.id)}
                >
                  {busyCancelAction ? "Отмена брони…" : "Да, отменить бронь"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CLEAR HISTORY CONFIRMATION MODAL */}
        {showClearHistoryModal && (
          <div
            className="guest-modal-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowClearHistoryModal(false);
            }}
          >
            <div
              className="guest-modal-dialog guest-cancel-modal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-clear-history-title"
            >
              <div className="guest-modal-header">
                <div className="guest-modal-header-info">
                  <div className="guest-modal-icon-badge guest-modal-icon-danger">
                    <TrashIcon />
                  </div>
                  <div>
                    <h3 id="modal-clear-history-title">
                      {copy.clearHistoryModalTitle || "Очистить историю визитов?"}
                    </h3>
                    <p>
                      {historyReservations.length}{" "}
                      {historyReservations.length === 1
                        ? "запись"
                        : historyReservations.length < 5
                          ? "записи"
                          : "записей"}{" "}
                      в архиве
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="guest-modal-close"
                  onClick={() => setShowClearHistoryModal(false)}
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </div>

              <div className="guest-modal-body">
                <p className="guest-cancel-modal-desc">
                  {copy.clearHistoryModalDesc ||
                    "Все завершённые и отменённые бронирования будут безвозвратно удалены из вашего списка. Предстоящие активные брони останутся нетронутыми."}
                </p>
              </div>

              <div className="guest-modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowClearHistoryModal(false)}
                >
                  {copy.clearHistoryCancel || "Оставить историю"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={clearingHistory}
                  onClick={() => void handleClearHistory()}
                >
                  {clearingHistory
                    ? copy.clearingHistory || "Очистка…"
                    : copy.clearHistoryConfirm || "Да, очистить историю"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AVATAR UPLOAD & SELECT MODAL (Placeholder with LocalStorage) */}
        {showAvatarModal && (
          <div
            className="guest-modal-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowAvatarModal(false);
            }}
          >
            <div
              className="guest-modal-dialog guest-avatar-modal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-avatar-title"
            >
              <div className="guest-modal-header">
                <div className="guest-modal-header-info">
                  <div className="guest-modal-icon-badge">
                    <CameraIcon />
                  </div>
                  <div>
                    <h3 id="modal-avatar-title">{copy.avatarTitle || "Фото профиля"}</h3>
                    <p>{copy.avatarSubtitle || "Загрузите своё изображение или выберите стильный аватар"}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="guest-modal-close"
                  onClick={() => setShowAvatarModal(false)}
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </div>

              <div className="guest-modal-body">
                {/* Large Preview */}
                <div className="guest-avatar-modal-preview-box">
                  <div className="guest-avatar-circle guest-avatar-modal-large">
                    {avatarUrl ? (
                      avatarUrl.startsWith("preset:") ? (
                        <span className="guest-avatar-preset">
                          {avatarUrl === "preset:crown"
                            ? "👑"
                            : avatarUrl === "preset:wine"
                              ? "🍷"
                              : avatarUrl === "preset:champagne"
                                ? "🥂"
                                : avatarUrl === "preset:dining"
                                  ? "🍽️"
                                  : avatarUrl === "preset:star"
                                    ? "🌟"
                                    : "🎩"}
                        </span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="Avatar" className="guest-avatar-img" />
                      )
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="guest-avatar-modal-preview-meta">
                    <p className="guest-avatar-modal-name">
                      {user.first_name ? `${user.first_name} ${user.last_name || ""}` : user.email}
                    </p>
                    <span className="guest-avatar-modal-role">{copy.roleGuest} · Seatiko</span>
                  </div>
                </div>

                {/* Upload Action */}
                <div className="guest-avatar-modal-upload-area">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={handleAvatarFileUpload}
                  />
                  <button
                    type="button"
                    className="btn btn-gold guest-avatar-upload-file-btn"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <CameraIcon />
                    <span>{copy.avatarUploadFile || "Загрузить фото с устройства"}</span>
                  </button>
                  <p className="guest-avatar-modal-specs">
                    {copy.avatarHint || "Поддерживаются форматы JPG, PNG или WebP до 5 МБ."}
                  </p>
                </div>

                {/* Presets Grid */}
                <div className="guest-avatar-presets-section">
                  <span className="guest-avatar-presets-title">
                    {copy.avatarPresets || "Быстрые стилизованные аватары"}
                  </span>
                  <div className="guest-avatar-presets-grid">
                    {[
                      { key: "preset:crown", emoji: "👑", label: "Премиум" },
                      { key: "preset:wine", emoji: "🍷", label: "Сомелье" },
                      { key: "preset:champagne", emoji: "🥂", label: "Праздник" },
                      { key: "preset:dining", emoji: "🍽️", label: "Гурман" },
                      { key: "preset:star", emoji: "🌟", label: "VIP" },
                      { key: "preset:hat", emoji: "🎩", label: "Джентльмен" },
                    ].map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        className={`guest-avatar-preset-btn ${avatarUrl === p.key ? "active" : ""}`}
                        onClick={() => handleSelectPresetAvatar(p.key)}
                        title={p.label}
                      >
                        <span className="guest-preset-emoji">{p.emoji}</span>
                        <span className="guest-preset-label">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Remove Photo if set */}
                {avatarUrl && (
                  <div className="guest-avatar-modal-remove-wrap">
                    <button
                      type="button"
                      className="guest-avatar-modal-remove-btn"
                      onClick={handleRemoveAvatar}
                    >
                      <TrashIcon />
                      <span>{copy.avatarRemove || "Удалить фото и вернуть инициалы"}</span>
                    </button>
                  </div>
                )}

                {/* Backend Task Tracking Notice */}
                <div className="guest-avatar-task-notice">
                  <div className="guest-avatar-task-tag">🔧 Backend Task #18</div>
                  <p>
                    {copy.avatarBackendNotice ||
                      "Внимание: в демо-режиме фото сохраняется локально в браузере. Полноценная облачная загрузка и хранение на сервере поставлены в бэкенд (Task #18)."}
                  </p>
                </div>
              </div>

              <div className="guest-modal-footer">
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => setShowAvatarModal(false)}
                >
                  {copy.avatarDone || "Готово"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
