const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export type LocalizedString = { ru: string; en: string; ro: string };

export type Venue = {
  id: string;
  city_id: string;
  name: LocalizedString;
  description: LocalizedString;
  cuisine: string[];
  rating: number;
  price_level: number;
  address: LocalizedString;
  lat: number;
  lng: number;
  average_check: number;
  open_now: boolean;
  free_tables: number;
  image_url: string;
};

export function pickLocale(
  s: LocalizedString,
  locale: "ru" | "en" | "ro",
): string {
  return s[locale] || s.en || s.ru;
}

export async function fetchVenues(cityId = "city-balti"): Promise<Venue[]> {
  const res = await fetch(`${API_URL}/api/v1/venues?city_id=${cityId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("failed_to_load_venues");
  const data = await res.json();
  return data.venues as Venue[];
}
