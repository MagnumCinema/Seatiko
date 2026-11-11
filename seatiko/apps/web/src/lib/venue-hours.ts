import type { LocaleCode } from "@/lib/api";

export const VENUE_HOURS: Record<string, Record<LocaleCode, string>> = {
  "venue-1": {
    ru: "Пн–Вс 10:00–22:00",
    en: "Mon–Sun 10:00–22:00",
    ro: "Lun–Dum 10:00–22:00",
  },
  "venue-2": {
    ru: "Пн–Вс 08:30–22:00",
    en: "Mon–Sun 08:30–22:00",
    ro: "Lun–Dum 08:30–22:00",
  },
  "venue-3": {
    ru: "Пн–Вс 11:00–23:00",
    en: "Mon–Sun 11:00–23:00",
    ro: "Lun–Dum 11:00–23:00",
  },
  "venue-4": {
    ru: "Пн–Вс 10:00–23:00",
    en: "Mon–Sun 10:00–23:00",
    ro: "Lun–Dum 10:00–23:00",
  },
  "venue-5": {
    ru: "Пн–Вс 12:00–00:00",
    en: "Mon–Sun 12:00–00:00",
    ro: "Lun–Dum 12:00–00:00",
  },
  "venue-6": {
    ru: "Пн–Вс 11:00–23:00",
    en: "Mon–Sun 11:00–23:00",
    ro: "Lun–Dum 11:00–23:00",
  },
  "venue-7": {
    ru: "Пн–Вс 11:00–22:00",
    en: "Mon–Sun 11:00–22:00",
    ro: "Lun–Dum 11:00–22:00",
  },
  "venue-8": {
    ru: "Пн–Вс 12:00–01:00",
    en: "Mon–Sun 12:00–01:00",
    ro: "Lun–Dum 12:00–01:00",
  },
  "venue-9": {
    ru: "Пн–Вс 14:00–23:00",
    en: "Mon–Sun 14:00–23:00",
    ro: "Lun–Dum 14:00–23:00",
  },
  "venue-10": {
    ru: "Пн–Вс 09:00–22:00",
    en: "Mon–Sun 09:00–22:00",
    ro: "Lun–Dum 09:00–22:00",
  },
};

export function getVenueHours(venueId: string, locale: LocaleCode): string {
  if (venueId && VENUE_HOURS[venueId]) {
    return VENUE_HOURS[venueId][locale];
  }
  if (locale === "ru") return "Пн–Вс 10:00–23:00";
  if (locale === "ro") return "Lun–Dum 10:00–23:00";
  return "Mon–Sun 10:00–23:00";
}

