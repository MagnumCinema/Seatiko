/**
 * Booking confirmation data required for calendar integration and sharing.
 */
export type BookingShareInput = {
  reservationId: string;
  venueName: string;
  address?: string;
  lat?: number;
  lng?: number;
  start: Date;
  durationMin: number;
  tables: number[];
  guests: number;
  notes?: string;
  url?: string;
  /** Localized word for "table" in the event title (default "table"). */
  tableLabel?: string;
  /** Localized "Guests" label in the event details (default "Guests"). */
  guestsLabel?: string;
};

/**
 * Formats a Date into UTC basic format: YYYYMMDDTHHMMSSZ.
 */
function formatUtcBasic(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const y = date.getUTCFullYear().toString().padStart(4, "0");
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

/**
 * Escapes special characters for RFC 5545 TEXT values.
 */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds a line longer than 75 octets into physical lines prefixed by a space per RFC 5545.
 */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) {
    return line;
  }

  const parts: string[] = [];
  let currentChunk = "";
  let currentBytes = 0;
  let maxBytes = 75;

  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    if (currentBytes + chBytes > maxBytes) {
      parts.push(currentChunk);
      currentChunk = ch;
      currentBytes = chBytes;
      maxBytes = 74;
    } else {
      currentChunk += ch;
      currentBytes += chBytes;
    }
  }

  if (currentChunk.length > 0) {
    parts.push(currentChunk);
  }

  return parts.join("\r\n ");
}

/**
 * Event title: venue and table number(s).
 */
function eventTitle(input: BookingShareInput): string {
  return `${input.venueName} · ${input.tableLabel ?? "table"} №${input.tables.join(" + ")}`;
}

/**
 * Builds the plain-text description with guest count, notes, and booking link.
 */
function buildDescription(input: BookingShareInput): string {
  const parts: string[] = [`${input.guestsLabel ?? "Guests"}: ${input.guests}`];
  if (input.notes && input.notes.trim().length > 0) {
    parts.push(input.notes.trim());
  }
  if (input.url && input.url.trim().length > 0) {
    parts.push(input.url.trim());
  }
  return parts.join("\n");
}

/**
 * Generates an RFC 5545 compliant iCalendar string for a booking confirmation.
 */
export function buildIcs(input: BookingShareInput, now?: Date): string {
  const dtstamp = formatUtcBasic(now ?? new Date());
  const dtstart = formatUtcBasic(input.start);
  const dtend = formatUtcBasic(new Date(input.start.getTime() + input.durationMin * 60 * 1000));
  const summary = eventTitle(input);
  const description = buildDescription(input);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Seatiko//Booking//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.reservationId}@seatiko`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeIcsText(summary)}`,
  ];

  if (input.address && input.address.trim().length > 0) {
    lines.push(`LOCATION:${escapeIcsText(input.address.trim())}`);
  }

  if (
    typeof input.lat === "number" &&
    Number.isFinite(input.lat) &&
    typeof input.lng === "number" &&
    Number.isFinite(input.lng) &&
    !(input.lat === 0 && input.lng === 0)
  ) {
    lines.push(`GEO:${input.lat};${input.lng}`);
  }

  lines.push(`DESCRIPTION:${escapeIcsText(description)}`);

  if (input.url && input.url.trim().length > 0) {
    lines.push(`URL:${input.url.trim()}`);
  }

  lines.push(
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  );

  return lines.map(foldIcsLine).join("\r\n");
}

/**
 * Generates a standardized .ics file name formatted with the booking start time in local time.
 */
export function icsFileName(input: BookingShareInput): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const d = input.start;
  const y = d.getFullYear().toString().padStart(4, "0");
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `seatiko-booking-${y}${m}${day}-${h}${min}.ics`;
}

/**
 * Builds a Google Calendar event creation URL for the booking.
 */
export function googleCalendarUrl(input: BookingShareInput): string {
  const startUtc = formatUtcBasic(input.start);
  const endUtc = formatUtcBasic(new Date(input.start.getTime() + input.durationMin * 60 * 1000));
  const summary = eventTitle(input);
  const details = buildDescription(input);

  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", summary);
  params.set("dates", `${startUtc}/${endUtc}`);
  params.set("details", details);
  if (input.address && input.address.trim().length > 0) {
    params.set("location", input.address.trim());
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Builds a Google Maps directions URL prioritizing valid coordinates over address and venue name.
 */
export function mapsRouteUrl(
  input: Pick<BookingShareInput, "lat" | "lng" | "address" | "venueName">,
): string {
  let destination = "";
  const hasCoords =
    typeof input.lat === "number" &&
    Number.isFinite(input.lat) &&
    typeof input.lng === "number" &&
    Number.isFinite(input.lng) &&
    !(input.lat === 0 && input.lng === 0);

  if (hasCoords) {
    destination = `${input.lat},${input.lng}`;
  } else if (input.address && input.address.trim().length > 0) {
    destination = input.address.trim();
  } else {
    destination = input.venueName.trim();
  }

  const params = new URLSearchParams();
  params.set("api", "1");
  params.set("destination", destination);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Formats a multi-line plain text booking confirmation summary for sharing.
 */
export function shareText(
  input: BookingShareInput,
  labels: { table: string; guests: string },
  formatWhen: (d: Date) => string,
): string {
  const lines: string[] = [
    input.venueName,
    formatWhen(input.start),
    `${labels.table} №${input.tables.join(" + ")} · ${labels.guests}: ${input.guests}`,
  ];

  if (input.address && input.address.trim().length > 0) {
    lines.push(input.address.trim());
  }

  if (input.url && input.url.trim().length > 0) {
    lines.push(input.url.trim());
  }

  return lines.join("\n");
}
