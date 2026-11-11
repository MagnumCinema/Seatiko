"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale, type Locale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
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
  emptyGuestLocalPrefs,
  loadGuestLocalPrefs,
  removeFavoriteVenue,
  saveGuestLocalPrefs,
  type GuestLocalPrefs,
} from "@/lib/guest-local-prefs";
import { venueBookingHref } from "@/lib/booking-link";

type GuestProfileProps = {
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

const COMMON_DIET_TAGS = [
  "Вегетарианство",
  "Веганство",
  "Без лактозы",
  "Без глютена",
  "Аллергия на орехи",
  "Морепродукты",
  "Не острое",
  "Халяль",
];

function CalendarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SaladIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 21h10a5 5 0 0 0 5-5c0-2-2-4-5-4H7a5 5 0 0 0-5 5 5 5 0 0 0 5 4Z" />
      <path d="M12 3a9 9 0 0 0-5 7h10a9 9 0 0 0-5-7Z" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function FlashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
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
    const isToday =
      date.toDateString() === now.toDateString() ||
      date.getTime() > now.getTime() - 4 * 60 * 60 * 1000;
    return isToday;
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
  const toast = onToast ?? (() => { });

  const [activeTab, setActiveTab] = useState<ProfileTab>("bookings");
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    user
      ? draftFromUser(user)
      : { first_name: "", last_name: "", display_name: "", phone: "" },
  );
  const [prefs, setPrefs] = useState<GuestLocalPrefs>(emptyGuestLocalPrefs);
  const [allergiesDraft, setAllergiesDraft] = useState("");
  const [dietTags, setDietTags] = useState<string[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [bookingsLoadedFor, setBookingsLoadedFor] = useState<string | null>(null);
  const [busySave, setBusySave] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [bookingSubTab, setBookingSubTab] = useState<"active" | "history">("active");
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
      setDraft(nextDraft);
      setPrefs({ allergies: allergiesValue, favorites: effectiveFavorites });
      setAllergiesDraft(allergiesValue);
      setDietTags(serverDiets.length > 0 ? serverDiets : allergiesValue ? allergiesValue.split(",").map(s => s.trim()).filter(Boolean) : []);
    });

    // Fetch live venues and reservations
    let alive = true;
    Promise.all([
      fetchReservations().catch(() => [] as Reservation[]),
      fetchVenues("city-balti").catch(() => [] as Venue[]),
      listEventInquiries().catch(() => [] as EventInquiry[]),
    ]).then(([resList, vList, inqList]) => {
      if (!alive) return;
      setReservations(resList);
      const focused = focusResId ? resList.find((r) => r.id === focusResId) : undefined;
      if (focused && !isResActive(focused)) setBookingSubTab("history");
      setVenues(vList);
      setEventInquiries(inqList);
    }).finally(() => {
      if (alive) setBookingsLoadedFor(userId);
    });

    return () => {
      alive = false;
    };
  }, [userId, user, focusResId]);

  useEffect(() => {
    if (!focusResId || loadingBookings) return;
    const card = document.getElementById(`reservation-${focusResId}`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusResId, loadingBookings, bookingSubTab]);

  // Venue map for quick lookup
  const venueMap = useMemo(() => {
    const map = new Map<string, Venue>();
    venues.forEach((v) => map.set(v.id, v));
    return map;
  }, [venues]);

  // Save Identity Profile
  async function saveIdentity() {
    if (!user) return;
    setBusySave(true);
    try {
      const next = await updateMe({
        first_name: draft.first_name,
        last_name: draft.last_name,
        display_name: draft.display_name,
        phone: draft.phone,
      });
      onUserUpdated?.(next);
      toast(t("profile.saved"));
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
      new Set(
        [
          ...dietTags,
          ...allergiesDraft
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ],
      ),
    );
    const nextPrefs = { ...prefs, allergies: combined.join(", ") };
    saveGuestLocalPrefs(user.id, nextPrefs);
    setPrefs(nextPrefs);
    try {
      const updated = await updateMe({ diet_preferences: combined });
      onUserUpdated?.(updated);
      toast(t("profile.saved"));
    } catch {
      toast(t("profile.saved"));
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
    try {
      const updated = await updateMe({
        favorite_venues: next.favorites.map((f) => f.venueId),
      });
      onUserUpdated?.(updated);
    } catch {
      /* local state is already saved */
    }
  }

  // Confirm Arrival
  async function handleConfirmArrival(resId: string) {
    setConfirmingId(resId);
    try {
      const updatedRes = await confirmArrival(resId);
      setReservations((prev) =>
        prev.map((r) => (r.id === resId ? { ...r, ...updatedRes } : r)),
      );
      toast("Прибытие в заведение подтверждено! Официант оповещён.");
    } catch {
      toast("Не удалось подтвердить прибытие. Обратитесь к администратору.");
    } finally {
      setConfirmingId(null);
    }
  }

  // Cancel Reservation
  async function handleCancelReservation(resId: string) {
    setCancellingId(resId);
    try {
      await cancelReservation(resId);
      setReservations((prev) =>
        prev.map((r) => (r.id === resId ? { ...r, status: "CANCELLED" } : r)),
      );
      setConfirmCancelId(null);
      toast("Бронирование стола успешно отменено.");
    } catch {
      toast("Не удалось отменить бронирование. Попробуйте позже.");
    } finally {
      setCancellingId(null);
    }
  }

  // Delete/Purge Reservation Completely
  async function handleDeleteReservation(resId: string) {
    setDeletingId(resId);
    try {
      await deleteReservation(resId);
      setReservations((prev) => prev.filter((r) => r.id !== resId));
      setConfirmDeleteId(null);
      setConfirmCancelId(null);
      toast("Бронирование удалено из списка.");
    } catch {
      toast("Не удалось удалить бронирование.");
    } finally {
      setDeletingId(null);
    }
  }

  // Clear History (Cancelled / Past Bookings)
  async function handleClearHistory() {
    setClearingHistory(true);
    try {
      const res = await clearHistoryReservations();
      setReservations((prev) => prev.filter(isResActive));
      toast(`История очищена (${res.cleared} записей удалено).`);
    } catch {
      toast("Не удалось очистить историю.");
    } finally {
      setClearingHistory(false);
    }
  }

  // Active vs History partition

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
      const updated = await updateMe({ locale: next });
      onUserUpdated?.(updated);
    } catch {
      /* best-effort locale sync */
    }
  }

  // Close modals on Escape key
  useEffect(() => {
    if (!isEmailModalOpen && !isPasswordModalOpen && !editingRes) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsEmailModalOpen(false);
        setIsPasswordModalOpen(false);
        setEditingRes(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEmailModalOpen, isPasswordModalOpen, editingRes]);

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
      const updated = await updateReservation(editingRes.id, {
        guests: editGuests,
        reserved_for: new Date(editTime).toISOString(),
        notes: editNotes.trim(),
      });
      setReservations((prev) =>
        prev.map((r) => (r.id === editingRes.id ? { ...r, ...updated } : r)),
      );
      setEditingRes(null);
      toast("Бронирование столика успешно обновлено!");
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
      setEmailError("Пожалуйста, введите корректный адрес email (например, user@example.com)");
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
      const updatedUser = await updateEmail(cleaned);
      onUserUpdated?.(updatedUser);
      setIsEmailModalOpen(false);
      setEmailInput("");
      setEmailConfirmInput("");
      toast("Адрес электронной почты успешно изменен!");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "email_already_registered" || err.code === "email_taken") {
          setEmailError("Этот email уже зарегистрирован другим пользователем");
        } else if (err.code === "invalid_email") {
          setEmailError("Некорректный формат адреса электронной почты");
        } else {
          setEmailError(`Ошибка: ${err.code}`);
        }
      } else {
        setEmailError("Не удалось обновить email. Проверьте соединение с сервером.");
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
    if (oldPasswordInput === newPasswordInput) {
      setPasswordError("Новый пароль должен отличаться от старого");
      return;
    }

    setPasswordBusy(true);
    try {
      await updatePassword({
        old_password: oldPasswordInput,
        new_password: newPasswordInput,
      });
      setIsPasswordModalOpen(false);
      setOldPasswordInput("");
      setNewPasswordInput("");
      setConfirmPasswordInput("");
      toast("Пароль успешно изменен!");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_old_password") {
          setPasswordError("Неверно указан текущий пароль");
        } else if (err.code === "password_too_short") {
          setPasswordError("Новый пароль слишком короткий (минимум 6 символов)");
        } else {
          setPasswordError(`Ошибка: ${err.code}`);
        }
      } else {
        setPasswordError("Не удалось изменить пароль. Проверьте соединение с сервером.");
      }
    } finally {
      setPasswordBusy(false);
    }
  }

  // Initials for avatar
  const initials = useMemo(() => {
    if (!user) return "G";
    const f = draft.first_name.trim().charAt(0);
    const l = draft.last_name.trim().charAt(0);
    if (f || l) return `${f}${l}`.toUpperCase();
    if (draft.display_name.trim()) return draft.display_name.trim().charAt(0).toUpperCase();
    return user.email.charAt(0).toUpperCase();
  }, [user, draft]);

  const fullName = useMemo(() => {
    const combined = `${draft.first_name} ${draft.last_name}`.trim();
    if (combined) return combined;
    if (draft.display_name.trim()) return draft.display_name.trim();
    return user?.email ?? "Гость";
  }, [draft, user]);

  const rootClass = embedded
    ? "guest-profile guest-profile-embedded"
    : "guest-profile guest-profile-page";

  // Unauthenticated Guest Welcome Card
  if (!user) {
    return (
      <div className={rootClass}>
        <div className="guest-auth-welcome-card">
          <div className="guest-welcome-avatar">
            <UserIcon />
          </div>
          <h2>{t("profile.account_title")}</h2>
          <p className="guest-welcome-lead">
            Войдите в личный кабинет, чтобы просматривать активные бронирования столов, сохранять любимые заведения Бельц и настраивать кулинарные предпочтения.
          </p>
          <div className="guest-welcome-actions">
            <button
              type="button"
              className="btn btn-gold guest-welcome-btn-primary"
              onClick={onRequestSignIn}
            >
              <span>{t("profile.sign_in")}</span>
              <span aria-hidden="true">→</span>
            </button>
            {onQuickDemoSignIn && (
              <button
                type="button"
                className="btn-demo-chip guest-welcome-demo-btn"
                onClick={onQuickDemoSignIn}
                title="Мгновенный вход в демо-аккаунт гостя"
              >
                <FlashIcon />
                <span>Быстрый демо-вход гостя</span>
              </button>
            )}
            <Link href="/book" className="guest-welcome-browse-link">
              Быстрая бронь столов без авторизации →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {/* Hero Guest Identity Banner */}
      <section className="guest-hero-card">
        <div className="guest-hero-top">
          <div className="guest-avatar-wrap">
            <div className="guest-avatar-circle">{initials}</div>
            <div className="guest-status-dot" title="Активный аккаунт" />
          </div>
          <div className="guest-hero-info">
            <div className="guest-hero-badge-row">
              <span className="guest-role-badge">Гость Seatiko</span>
              <span className="guest-city-badge">Бельцы, Молдова</span>
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
              <CalendarIcon /> Бронирований
            </span>
          </button>
          <button
            type="button"
            className={`guest-stat-box ${activeTab === "favorites" ? "active" : ""}`}
            onClick={() => setActiveTab("favorites")}
          >
            <span className="guest-stat-val">{prefs.favorites.length}</span>
            <span className="guest-stat-label">
              <HeartIcon /> В избранном
            </span>
          </button>
          <button
            type="button"
            className={`guest-stat-box ${activeTab === "diet" ? "active" : ""}`}
            onClick={() => setActiveTab("diet")}
          >
            <span className="guest-stat-val">{dietTags.length}</span>
            <span className="guest-stat-label">
              <SaladIcon /> Особенностей кухни
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
          <span>Бронирования</span>
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
          <span>Данные</span>
        </button>
        <button
          type="button"
          className={`guest-nav-tab ${activeTab === "diet" ? "active" : ""}`}
          onClick={() => setActiveTab("diet")}
        >
          <SaladIcon />
          <span>Диета & Аллергии</span>
        </button>
        <button
          type="button"
          className={`guest-nav-tab ${activeTab === "favorites" ? "active" : ""}`}
          onClick={() => setActiveTab("favorites")}
        >
          <HeartIcon />
          <span>Избранное</span>
        </button>
        <button
          type="button"
          className={`guest-nav-tab ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          <SettingsIcon />
          <span>Настройки</span>
        </button>
      </nav>

      {/* Tab Panels */}
      <div className="guest-tab-content">
        {/* TAB 1: BOOKINGS */}
        {activeTab === "bookings" && (
          <div className="guest-panel guest-bookings-panel">
            <div className="guest-panel-header">
              <div>
                <h2>Мои бронирования</h2>
                <p>Все ваши подтвержденные столы и история бронирований</p>
              </div>
              <Link href="/book" className="btn btn-gold guest-new-booking-btn">
                <span>+ Забронировать стол</span>
              </Link>
            </div>

            {/* Sub-tabs: Активные брони vs История броней */}
            <div className="guest-booking-subtabs-row">
              <div
                className="guest-booking-subtabs"
                role="tablist"
                aria-label="Фильтр бронирований"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={bookingSubTab === "active"}
                  className={`guest-booking-subtab ${bookingSubTab === "active" ? "active" : ""}`}
                  onClick={() => {
                    setBookingSubTab("active");
                    setConfirmCancelId(null);
                    setConfirmDeleteId(null);
                  }}
                >
                  <span>Активные брони</span>
                  <span className="guest-subtab-badge">
                    {activeReservations.length}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={bookingSubTab === "history"}
                  className={`guest-booking-subtab ${bookingSubTab === "history" ? "active" : ""}`}
                  onClick={() => {
                    setBookingSubTab("history");
                    setConfirmCancelId(null);
                    setConfirmDeleteId(null);
                  }}
                >
                  <span>История броней</span>
                  <span className="guest-subtab-badge">
                    {historyReservations.length}
                  </span>
                </button>
              </div>

              {bookingSubTab === "history" && historyReservations.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm guest-clear-history-btn"
                  disabled={clearingHistory}
                  onClick={() => void handleClearHistory()}
                  title="Удалить все завершенные и отмененные записи из истории"
                >
                  <TrashIcon />
                  <span>{clearingHistory ? "Очистка…" : "Очистить историю"}</span>
                </button>
              )}
            </div>

            {/* Event Inquiries Section if any */}
            {eventInquiries.length > 0 && (
              <div className="guest-events-section">
                <div className="guest-events-header">
                  <div className="guest-events-header-left">
                    <span className="guest-events-badge">🎂 Мероприятия</span>
                    <h3>Заявки на праздники и банкеты ({eventInquiries.length})</h3>
                  </div>
                  <p>Согласовываются индивидуально с администратором заведения</p>
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
                        ? "День рождения 🎂"
                        : inq.event_type === "banquet"
                          ? "Банкет / Торжество 🥂"
                          : inq.event_type === "corporate"
                            ? "Корпоратив 👔"
                            : inq.event_type === "romantic"
                              ? "Романтический ужин 🕯️"
                              : "Праздничное мероприятие 🎈";
                    return (
                      <article key={inq.id} className="guest-event-card">
                        <div className="guest-event-top">
                          <div>
                            <span className="guest-event-type-pill">
                              {eventTitle}
                            </span>
                            <h4>{vName}</h4>
                          </div>
                          <span className="guest-status-pill pending">
                            На согласовании
                          </span>
                        </div>
                        <div className="guest-event-details">
                          <div className="guest-booking-detail-item">
                            <ClockIcon />
                            <span>
                              {new Date(inq.preferred_date).toLocaleString(
                                locale === "ro" ? "ro-RO" : "ru-RU",
                                {
                                  day: "numeric",
                                  month: "long",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </span>
                          </div>
                          <div className="guest-booking-detail-item">
                            <UserIcon />
                            <span>{inq.guest_count} гостей</span>
                          </div>
                          <div className="guest-booking-detail-item">
                            <span>
                              {inq.contact_method === "chat"
                                ? "💬 Чат Telegram/WhatsApp"
                                : "📞 Обратный звонок"}
                            </span>
                          </div>
                        </div>
                        {inq.notes && (
                          <p className="guest-event-notes">
                            <strong>Пожелания:</strong> {inq.notes}
                          </p>
                        )}
                        <div className="guest-event-actions">
                          <a
                            href="https://t.me/seatiko_admin"
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-gold btn-sm"
                          >
                            💬 Чат с администратором
                          </a>
                          <a
                            href={`tel:${inq.admin_phone || "+37323124411"}`}
                            className="btn btn-outline btn-sm"
                          >
                            📞 Позвонить ({inq.admin_phone || "+373 231 2-44-11"})
                          </a>
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
                  <h3>У вас нет активных бронирований</h3>
                  <p>
                    Все предстоящие подтвержденные брони будут отображаться здесь. Забронируйте столик за пару секунд.
                  </p>
                  <div className="guest-empty-actions">
                    <Link href="/book" className="btn btn-gold">
                      Быстрая бронь стола →
                    </Link>
                    <Link href="/venues" className="btn btn-outline">
                      Каталог ресторанов
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="guest-bookings-list">
                  {activeReservations.map((res) => {
                    const venue = venueMap.get(res.venue_id);
                    const venueName =
                      (typeof res.venue_name === "object"
                        ? res.venue_name[locale] || res.venue_name.ru || res.venue_name.en
                        : res.venue_name) ||
                      (venue ? (typeof venue.name === "object" ? venue.name[locale] || venue.name.ru : venue.name) : "Ресторан");

                    const dateObj = new Date(res.reserved_for);
                    const isCheckedIn =
                      res.status === "CHECKED_IN" || !!res.arrival_confirmed_at;

                    const dateFormatted = !isNaN(dateObj.getTime())
                      ? dateObj.toLocaleString(locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU", {
                        day: "numeric",
                        month: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
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
                                  : "Я на месте (за столом)"}
                              </span>
                            </button>
                          )}

                          {!isCheckedIn && (
                            <button
                              type="button"
                              className="btn btn-outline guest-edit-res-btn"
                              onClick={() => openEditBookingModal(res)}
                              title="Изменить дату, время или количество гостей"
                            >
                              <PencilIcon />
                              <span>Изменить бронь</span>
                            </button>
                          )}

                          {confirmCancelId === res.id ? (
                            <div className="guest-cancel-confirm-box">
                              <span className="guest-cancel-prompt">
                                Отменить или удалить бронь?
                              </span>
                              <button
                                type="button"
                                className="btn btn-danger-pill btn-sm"
                                disabled={cancellingId === res.id}
                                onClick={() => void handleCancelReservation(res.id)}
                              >
                                {cancellingId === res.id
                                  ? "Отмена…"
                                  : "Отменить"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger-pill btn-sm guest-purge-btn"
                                disabled={deletingId === res.id}
                                onClick={() => void handleDeleteReservation(res.id)}
                                title="Удалить бронь совсем"
                              >
                                {deletingId === res.id ? "…" : "Удалить совсем"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => setConfirmCancelId(null)}
                              >
                                Назад
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-outline guest-cancel-btn"
                              disabled={cancellingId === res.id}
                              onClick={() => setConfirmCancelId(res.id)}
                              title="Отменить бронирование этого стола"
                            >
                              <XCircleIcon />
                              <span>Отменить бронь</span>
                            </button>
                          )}

                          <Link
                            href={`/venues/${res.venue_id}`}
                            className="btn btn-outline guest-venue-link"
                          >
                            Меню и заведение →
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )
            ) : (
              /* HISTORY SUB-TAB */
              historyReservations.length === 0 ? (
                <div className="guest-empty-state">
                  <div className="guest-empty-icon">
                    <ClockIcon />
                  </div>
                  <h3>История бронирований пуста</h3>
                  <p>
                    Здесь будут сохраняться завершенные и отмененные бронирования столов.
                  </p>
                </div>
              ) : (
                <div className="guest-bookings-list">
                  {historyReservations.map((res) => {
                    const venue = venueMap.get(res.venue_id);
                    const venueName =
                      (typeof res.venue_name === "object"
                        ? res.venue_name[locale] || res.venue_name.ru || res.venue_name.en
                        : res.venue_name) ||
                      (venue ? (typeof venue.name === "object" ? venue.name[locale] || venue.name.ru : venue.name) : "Ресторан");

                    const dateObj = new Date(res.reserved_for);
                    const isCancelled = res.status === "CANCELLED";

                    const dateFormatted = !isNaN(dateObj.getTime())
                      ? dateObj.toLocaleString(locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU", {
                        day: "numeric",
                        month: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                      : res.reserved_for;

                    const tableTag =
                      res.table_numbers && res.table_numbers.length > 1
                        ? `Столы №${res.table_numbers.join(", №")}`
                        : `Стол №${res.table_number ?? 1}`;

                    return (
                      <article
                        key={res.id}
                        id={`reservation-${res.id}`}
                        className={`guest-booking-card guest-history-card${res.id === focusResId ? " is-focused" : ""}`}
                      >
                        <div className="guest-booking-top">
                          <div className="guest-booking-venue">
                            <span className="guest-booking-tag">
                              <MapPinIcon /> {tableTag}
                            </span>
                            <h3>{venueName}</h3>
                          </div>
                          <div className="guest-status-wrapper">
                            <span
                              className={`guest-status-pill ${isCancelled ? "cancelled" : "completed"}`}
                            >
                              {isCancelled ? "Отменено ✕" : "Завершено ✓"}
                            </span>
                            <span className="guest-status-subtext">
                              {isCancelled
                                ? "Бронирование стола было отменено"
                                : "Визит в ресторан успешно состоялся"}
                            </span>
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
                        </div>

                        <div className="guest-booking-actions">
                          <Link
                            href={venueBookingHref(res.venue_id, { guests: res.guests, durationMin: res.duration_min })}
                            className="btn btn-gold guest-rebook-btn"
                          >
                            <span>Забронировать стол снова</span>
                            <span aria-hidden="true">→</span>
                          </Link>
                          <Link
                            href={`/venues/${res.venue_id}`}
                            className="btn btn-outline guest-venue-link"
                          >
                            Меню и заведение
                          </Link>

                          {confirmDeleteId === res.id ? (
                            <div className="guest-cancel-confirm-box">
                              <span className="guest-cancel-prompt">
                                Удалить из истории?
                              </span>
                              <button
                                type="button"
                                className="btn btn-danger-pill btn-sm"
                                disabled={deletingId === res.id}
                                onClick={() => void handleDeleteReservation(res.id)}
                              >
                                {deletingId === res.id ? "Удаление…" : "Да, удалить"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Отмена
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-outline guest-delete-card-btn"
                              disabled={deletingId === res.id}
                              onClick={() => setConfirmDeleteId(res.id)}
                              title="Удалить эту запись из истории"
                            >
                              <TrashIcon />
                              <span>Удалить</span>
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
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
                <h2>{t("profile.title")}</h2>
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
              <div className="guest-form-row">
                <div className="field">
                  <label htmlFor="prof-first">{t("profile.first_name")}</label>
                  <input
                    id="prof-first"
                    type="text"
                    value={draft.first_name}
                    placeholder="Например, Andrei"
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, first_name: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="prof-last">{t("profile.last_name")}</label>
                  <input
                    id="prof-last"
                    type="text"
                    value={draft.last_name}
                    placeholder="Например, Popescu"
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, last_name: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="guest-form-row">
                <div className="field">
                  <label htmlFor="prof-display">
                    {t("profile.display_name")}
                  </label>
                  <input
                    id="prof-display"
                    type="text"
                    value={draft.display_name}
                    placeholder="Как обращаться официанту"
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, display_name: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="prof-phone">Номер телефона</label>
                  <input
                    id="prof-phone"
                    type="tel"
                    value={draft.phone}
                    placeholder="+373 (79) 000-000"
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, phone: e.target.value }))
                    }
                  />
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
                    <span>Сменить email</span>
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
                <span>{busySave ? "Сохранение…" : t("common.save")}</span>
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
                    <span>Сменить email</span>
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
                    <span>Сменить пароль</span>
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
                <h2>{t("profile.allergies")}</h2>
                <p>
                  Рестораны и официанты увидят эти предпочтения при заказе по QR-коду
                </p>
              </div>
            </div>

            <div className="guest-diet-chips-wrap">
              <span className="guest-diet-chips-title">
                Популярные особенности питания:
              </span>
              <div className="guest-diet-chips">
                {COMMON_DIET_TAGS.map((tag) => {
                  const active = dietTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`guest-diet-chip ${active ? "active" : ""}`}
                      onClick={() => toggleDietTag(tag)}
                    >
                      <span>{active ? "✓ " : "+ "}</span>
                      <span>{tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field guest-diet-textarea-wrap">
              <label htmlFor="prof-diet-text">
                Дополнительные пожелания и непереносимости:
              </label>
              <textarea
                id="prof-diet-text"
                rows={3}
                className="guest-textarea"
                placeholder="Например: Не люблю кинзу, предупреждать если блюдо содержит арахис или мед..."
                value={allergiesDraft}
                onChange={(e) => setAllergiesDraft(e.target.value)}
              />
              <p className="guest-field-hint">
                Синхронизируется с вашим профилем и учитывается при формировании меню.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-gold guest-submit-btn"
              disabled={busySave}
              onClick={() => void saveAllergies()}
            >
              <span>{busySave ? "Сохранение…" : t("profile.allergies_save")}</span>
            </button>
          </div>
        )}

        {/* TAB 4: FAVORITES */}
        {activeTab === "favorites" && (
          <div className="guest-panel guest-favorites-panel">
            <div className="guest-panel-header">
              <div>
                <h2>{t("profile.favorites")}</h2>
                <p>Ваши сохраненные заведения для быстрого перехода и бронирования</p>
              </div>
            </div>

            {prefs.favorites.length === 0 ? (
              <div className="guest-empty-state">
                <div className="guest-empty-icon">
                  <HeartIcon />
                </div>
                <h3>{t("profile.favorites_empty")}</h3>
                <p>
                  Нажимайте «В избранное» на страницах заведений или на карте, чтобы быстро находить любимые места.
                </p>
                <Link href="/venues" className="btn btn-gold">
                  Открыть каталог ресторанов →
                </Link>
              </div>
            ) : (
              <div className="guest-favorites-grid">
                {prefs.favorites.map((fav) => {
                  const venue = venueMap.get(fav.venueId);
                  const venueName =
                    venue && typeof venue.name === "object"
                      ? venue.name[locale] || venue.name.ru
                      : fav.name;

                  return (
                    <div key={fav.venueId} className="guest-favorite-card">
                      <div className="guest-favorite-info">
                        <h4>{venueName}</h4>
                        <span className="guest-favorite-venue-id">
                          {venue?.address && typeof venue.address === "object"
                            ? venue.address[locale] || venue.address.ru
                            : "Бельцы"}
                        </span>
                      </div>
                      <div className="guest-favorite-actions">
                        <Link
                          href={venueBookingHref(fav.venueId)}
                          className="btn btn-gold btn-sm"
                        >
                          Забронировать стол
                        </Link>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm guest-fav-remove-btn"
                          onClick={() => void removeFavorite(fav.venueId)}
                          title="Удалить из избранного"
                        >
                          {t("profile.favorites_remove")}
                        </button>
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
                <h2>Настройки аккаунта</h2>
                <p>Языковые параметры, тема оформления и безопасность</p>
              </div>
            </div>

            <div className="guest-settings-list">
              {/* Language Switch */}
              <div className="guest-settings-row">
                <div className="guest-setting-meta">
                  <strong>{t("profile.language")}</strong>
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
                  <strong>Оформление интерфейса</strong>
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
                  <strong>Выход из профиля</strong>
                  <span>Завершить текущую сессию на этом устройстве</span>
                </div>
                <button
                  type="button"
                  className="btn btn-outline guest-logout-btn"
                  onClick={onLogout}
                >
                  <LogOutIcon />
                  <span>{t("profile.logout")}</span>
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
                    <h3 id="modal-email-title">Смена адреса эл. почты</h3>
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
                    <span className="guest-modal-info-label">Текущий адрес:</span>
                    <span className="guest-modal-info-val">{user?.email}</span>
                  </div>

                  <div className="guest-modal-field">
                    <label htmlFor="modal-new-email">
                      Новый email <span className="req">*</span>
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
                      Подтвердите новый email <span className="req">*</span>
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
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="btn btn-gold"
                    disabled={
                      emailBusy ||
                      !emailInput.trim() ||
                      !emailConfirmInput.trim()
                    }
                  >
                    {emailBusy ? "Сохранение…" : "Сохранить email"}
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
                    <h3 id="modal-password-title">Смена пароля</h3>
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
                      Текущий пароль <span className="req">*</span>
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
                      Новый пароль <span className="req">*</span>
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
                      Повторите новый пароль <span className="req">*</span>
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
                    Отмена
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
                    {passwordBusy ? "Обновление…" : "Изменить пароль"}
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
                    <h3 id="modal-edit-booking-title">Изменение брони стола</h3>
                    <p>
                      {(typeof editingRes.venue_name === "object"
                        ? editingRes.venue_name[locale] || editingRes.venue_name.ru
                        : editingRes.venue_name) || "Ресторан"}{" "}
                      ·{" "}
                      {editingRes.table_numbers &&
                      editingRes.table_numbers.length > 1
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
                      Новая дата и время визита <span className="req">*</span>
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
                      Количество гостей <span className="req">*</span>
                    </label>
                    <input
                      id="modal-edit-guests"
                      type="number"
                      min={1}
                      max={20}
                      required
                      value={editGuests}
                      onChange={(e) =>
                        setEditGuests(Number(e.target.value) || 1)
                      }
                    />
                  </div>

                  <div className="guest-modal-field">
                    <label htmlFor="modal-edit-notes">
                      Пожелания к бронированию (необязательно)
                    </label>
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
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="btn btn-gold"
                    disabled={editBusy || !editTime}
                  >
                    {editBusy ? "Сохранение…" : "Сохранить изменения"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
