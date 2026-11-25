// Twenty CRM REST / metadata client, ported from internal/crm/client.go and schema.go.
import { randomUUID } from 'node:crypto';

export type TwentyRecord = Record<string, unknown>;
type MetadataField = { id: string; name: string; type: string; options?: Array<Record<string, unknown>> };
export type MetadataObject = { id: string; nameSingular: string; fields: MetadataField[] };
/** target: the related object; targetLabel / targetIcon: how the reverse field shows on it. */
type RequiredField = { name: string; label: string; type: string; options?: string[]; target?: string; targetLabel?: string; targetIcon?: string };
type CustomObject = { nameSingular: string; namePlural: string; labelSingular: string; labelPlural: string; description: string; icon: string };

/** Objects Seatiko adds to Twenty (created when missing). */
const CUSTOM_OBJECTS: CustomObject[] = [
  { nameSingular: 'reservation', namePlural: 'reservations', labelSingular: 'Reservation', labelPlural: 'Reservations', description: 'Reservations synchronized from Seatiko', icon: 'IconCalendarEvent' },
  { nameSingular: 'staffShift', namePlural: 'staffShifts', labelSingular: 'Смена', labelPlural: 'Смены', description: 'Staff shifts from the Seatiko schedule', icon: 'IconClockHour4' },
  { nameSingular: 'eventRequest', namePlural: 'eventRequests', labelSingular: 'Банкет', labelPlural: 'Банкеты', description: 'Banquet and event requests from Seatiko guests', icon: 'IconConfetti' },
];

const f = (name: string, label: string, type: string): RequiredField => ({ name, label, type });

/** Custom fields Seatiko keeps on Twenty objects (EnsureSeatikoSchema). */
const REQUIRED_SCHEMA: Array<{ object: string; fields: RequiredField[] }> = [
  {
    object: 'person',
    fields: [
      f('seatikoUserId', 'Seatiko User ID', 'TEXT'),
      f('seatikoRole', 'Seatiko Role', 'TEXT'),
      f('seatikoLocale', 'Seatiko Locale', 'TEXT'),
      f('seatikoUpdatedAt', 'Seatiko Updated At', 'DATE_TIME'),
      // Staff time from the schedule (declined shifts excluded, as on the site).
      f('shiftsThisWeek', 'Смен на этой неделе', 'NUMBER'),
      f('hoursThisWeek', 'Часов на этой неделе', 'NUMBER'),
      f('hoursThisMonth', 'Часов в этом месяце', 'NUMBER'),
    ],
  },
  {
    object: 'company',
    fields: [
      f('seatikoId', 'Seatiko ID', 'TEXT'),
      f('restaurantDescription', 'Restaurant Description', 'TEXT'),
      f('cityId', 'Seatiko City ID', 'TEXT'),
      f('cityName', 'Город', 'TEXT'),
      f('submittedAt', 'Заявка отправлена', 'DATE_TIME'),
      f('priceLevel', 'Price Level', 'NUMBER'),
      f('photoUrls', 'Photo URLs', 'TEXT'),
      f('venueId', 'Seatiko Venue ID', 'TEXT'),
      f('rejectReason', 'Reject Reason', 'TEXT'),
      f('seatikoUpdatedAt', 'Seatiko Updated At', 'DATE_TIME'),
      f('cuisine', 'Cuisine', 'TEXT'),
      f('openingHours', 'Opening Hours', 'TEXT'),
      f('averageCheckMdl', 'Average Check MDL', 'NUMBER'),
      f('restaurantPhones', 'Restaurant Phones', 'PHONES'),
      f('restaurantEmails', 'Restaurant Emails', 'EMAILS'),
      f('latitude', 'Latitude', 'NUMBER'),
      f('longitude', 'Longitude', 'NUMBER'),
      { name: 'restaurantStatus', label: 'Restaurant Status', type: 'SELECT', options: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED'] },
      // Restaurant figures from Seatiko (read-only in the CRM; the sync repairs edits).
      f('staffCount', 'Сотрудников', 'NUMBER'),
      f('staffHoursThisWeek', 'Часов персонала на неделе', 'NUMBER'),
      f('tablesCount', 'Столов', 'NUMBER'),
      f('seatsCount', 'Мест', 'NUMBER'),
      f('menuItemsCount', 'Блюд в меню', 'NUMBER'),
      f('reservations30d', 'Броней за 30 дней', 'NUMBER'),
      f('orders30d', 'Заказов за 30 дней', 'NUMBER'),
      f('revenue30dMdl', 'Выручка за 30 дней, MDL', 'NUMBER'),
    ],
  },
  { object: 'task', fields: [f('seatikoTaskKey', 'Seatiko Task Key', 'TEXT'), f('seatikoApplicationId', 'Seatiko Application ID', 'TEXT'), f('seatikoAutoResolved', 'Seatiko Auto Resolved', 'BOOLEAN')] },
  {
    object: 'reservation',
    fields: [
      f('seatikoReservationId', 'Seatiko Reservation ID', 'TEXT'),
      f('seatikoUserId', 'Seatiko User ID', 'TEXT'),
      f('seatikoVenueId', 'Seatiko Venue ID', 'TEXT'),
      f('seatikoTableId', 'Seatiko Table ID', 'TEXT'),
      f('seatikoUpdatedAt', 'Seatiko Updated At', 'DATE_TIME'),
      f('reservedFor', 'Reserved For', 'DATE_TIME'),
      f('guests', 'Guests', 'NUMBER'),
      f('tableNumber', 'Table Number', 'NUMBER'),
      f('guestEmail', 'Guest Email', 'EMAILS'),
      { name: 'bookingStatus', label: 'Booking Status', type: 'SELECT', options: ['CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'] },
      { name: 'source', label: 'Booking Source', type: 'SELECT', options: ['WEB', 'ANDROID', 'IOS', 'PHONE', 'WALK_IN'] },
      { name: 'restaurant', label: 'Restaurant', type: 'RELATION', target: 'company' },
      { name: 'guest', label: 'Guest', type: 'RELATION', target: 'person' },
    ],
  },
  {
    object: 'staffShift',
    fields: [
      f('seatikoShiftId', 'Seatiko Shift ID', 'TEXT'),
      f('seatikoUpdatedAt', 'Seatiko Updated At', 'DATE_TIME'),
      f('shiftDate', 'Дата', 'DATE'),
      f('startTime', 'Начало', 'TEXT'),
      f('endTime', 'Конец', 'TEXT'),
      f('hours', 'Часов', 'NUMBER'),
      f('note', 'Заметка', 'TEXT'),
      f('reason', 'Причина (отказ / замена)', 'TEXT'),
      { name: 'staffRole', label: 'Роль', type: 'SELECT', options: ['WAITER', 'COOK'] },
      { name: 'shiftStatus', label: 'Статус смены', type: 'SELECT', options: ['PENDING', 'CONFIRMED', 'DECLINED', 'SWAP_REQUESTED'] },
      { name: 'employee', label: 'Сотрудник', type: 'RELATION', target: 'person', targetLabel: 'Staff Shifts', targetIcon: 'IconClockHour4' },
      { name: 'restaurant', label: 'Ресторан', type: 'RELATION', target: 'company', targetLabel: 'Staff Shifts', targetIcon: 'IconClockHour4' },
    ],
  },
  {
    object: 'eventRequest',
    fields: [
      f('seatikoInquiryId', 'Seatiko Inquiry ID', 'TEXT'),
      f('seatikoUpdatedAt', 'Seatiko Updated At', 'DATE_TIME'),
      f('eventType', 'Повод', 'TEXT'),
      f('guests', 'Гостей', 'NUMBER'),
      f('preferredDate', 'Желаемая дата', 'DATE_TIME'),
      f('contactMethod', 'Способ связи', 'TEXT'),
      f('contactName', 'Контакт', 'TEXT'),
      f('contactPhone', 'Телефон', 'TEXT'),
      f('notes', 'Пожелания', 'TEXT'),
      { name: 'requestStatus', label: 'Статус заявки', type: 'SELECT', options: ['PENDING', 'CONTACTED', 'CONFIRMED'] },
      { name: 'guest', label: 'Гость', type: 'RELATION', target: 'person', targetLabel: 'Event Requests', targetIcon: 'IconConfetti' },
      { name: 'restaurant', label: 'Ресторан', type: 'RELATION', target: 'company', targetLabel: 'Event Requests', targetIcon: 'IconConfetti' },
    ],
  },
];

export const recordId = (r: TwentyRecord | undefined) => (typeof r?.id === 'string' ? r.id : '');
export const stringField = (r: TwentyRecord | undefined, name: string) => (typeof r?.[name] === 'string' ? (r[name] as string) : '');
export const compositeString = (r: TwentyRecord | undefined, field: string, key: string) => {
  const v = r?.[field] as Record<string, unknown> | undefined;
  return typeof v?.[key] === 'string' ? (v[key] as string) : '';
};

/** Same instant at millisecond precision (Twenty stores milliseconds). */
const sameInstant = (a: string, b: string) => {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) && x === Math.floor(y);
};

/** One call to Twenty: REST under /rest, metadata GraphQL under /metadata. */
export class TwentyClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.baseUrl.replace(/\/+$/, '') + path, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text.trim();
      try {
        const e = JSON.parse(text) as { error?: string; messages?: string[] };
        message = e.messages?.join('; ') || e.error || message;
      } catch {
        // keep the raw text
      }
      throw new Error(`Twenty ${method} ${path} returned ${res.status}: ${message.slice(0, 300)}`);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private static collection(data: unknown, plural: string): TwentyRecord[] {
    if (Array.isArray(data)) return data as TwentyRecord[];
    const wrapped = (data as Record<string, unknown> | undefined)?.[plural];
    return Array.isArray(wrapped) ? (wrapped as TwentyRecord[]) : [];
  }

  async listAll(plural: string): Promise<TwentyRecord[]> {
    const out: TwentyRecord[] = [];
    let after = '';
    for (;;) {
      const q = new URLSearchParams({ limit: '60', depth: '0', ...(after ? { starting_after: after } : {}) });
      const env = await this.request<{ data: unknown; pageInfo?: { endCursor?: string; hasNextPage?: boolean } }>('GET', `/rest/${plural}?${q}`);
      out.push(...TwentyClient.collection(env.data, plural));
      if (!env.pageInfo?.hasNextPage || !env.pageInfo.endCursor) return out;
      after = env.pageInfo.endCursor;
    }
  }

  async create(plural: string, payload: TwentyRecord): Promise<string> {
    const env = await this.request<{ data: Record<string, TwentyRecord> }>('POST', `/rest/${plural}?depth=0`, payload);
    for (const record of Object.values(env.data ?? {})) if (recordId(record)) return recordId(record);
    throw new Error(`Twenty create ${plural} response has no record id`);
  }

  async update(plural: string, id: string, payload: TwentyRecord): Promise<void> {
    await this.request('PATCH', `/rest/${plural}/${encodeURIComponent(id)}?depth=0`, payload);
  }

  async delete(plural: string, id: string): Promise<void> {
    await this.request('DELETE', `/rest/${plural}/${encodeURIComponent(id)}`);
  }

  /** Update the single match (skipped when seatikoUpdatedAt is unchanged) or create. */
  async upsert(plural: string, records: TwentyRecord[], payload: TwentyRecord, match: (r: TwentyRecord) => boolean): Promise<string> {
    const matches = records.filter(match);
    if (matches.length > 1) throw new Error(`Twenty conflict: ${matches.length} ${plural} records match the same Seatiko identity`);
    if (matches.length === 1) {
      const id = recordId(matches[0]);
      if (!id) throw new Error(`Twenty ${plural} match has no id`);
      if (sameInstant(stringField(matches[0], 'seatikoUpdatedAt'), stringField(payload, 'seatikoUpdatedAt'))) return id;
      await this.update(plural, id, payload);
      return id;
    }
    return this.create(plural, payload);
  }

  async metadataObjects(): Promise<MetadataObject[]> {
    const out: MetadataObject[] = [];
    let cursor = '';
    for (;;) {
      const q = new URLSearchParams({ limit: '60', ...(cursor ? { starting_after: cursor } : {}) });
      const env = await this.request<{ data: unknown; pageInfo?: { endCursor?: string; hasNextPage?: boolean } }>('GET', `/rest/metadata/objects?${q}`);
      out.push(...(TwentyClient.collection(env.data, 'objects') as unknown as MetadataObject[]));
      if (!env.pageInfo?.hasNextPage) return out;
      if (!env.pageInfo.endCursor || env.pageInfo.endCursor === cursor) throw new Error('Twenty metadata pagination returned an invalid cursor');
      cursor = env.pageInfo.endCursor;
    }
  }

  /** GraphQL on /metadata (views, page layouts). */
  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const env = await this.request<{ data: T; errors?: Array<{ message: string }> }>('POST', '/metadata', { query, variables });
    if (env.errors?.length) throw new Error(`Twenty metadata: ${env.errors[0].message}`);
    return env.data;
  }

  /** Creates the Reservation object and every Seatiko field that is missing; adds missing select options. */
  async ensureSchema(): Promise<void> {
    let objects = await this.metadataObjects();
    const byName = () => new Map(objects.map((o) => [o.nameSingular, o]));
    const missing = CUSTOM_OBJECTS.filter((o) => !byName().has(o.nameSingular));
    for (const o of missing) await this.request('POST', '/rest/metadata/objects', o);
    if (missing.length) objects = await this.metadataObjects();
    const map = byName();
    for (const spec of REQUIRED_SCHEMA) {
      const object = map.get(spec.object);
      if (!object) throw new Error(`Twenty schema is missing required object "${spec.object}"`);
      for (const field of spec.fields) await this.ensureField(object, field, field.target ? map.get(field.target) : undefined);
    }
  }

  private async ensureField(object: MetadataObject, field: RequiredField, target?: MetadataObject): Promise<void> {
    const existing = object.fields.find((x) => x.name === field.name);
    const options = [...(existing?.options ?? [])];
    const values = new Set(options.map((o) => o.value));
    for (const value of field.options ?? []) {
      if (!values.has(value)) options.push({ id: randomUUID(), color: 'blue', label: value.replace(/_/g, ' '), value, position: options.length });
    }
    if (existing) {
      if (existing.type !== field.type) throw new Error(`Twenty field ${object.nameSingular}.${field.name}: expected ${field.type}, found ${existing.type}`);
      if (options.length > (existing.options?.length ?? 0)) await this.request('PATCH', `/rest/metadata/fields/${encodeURIComponent(existing.id)}`, { options });
      return;
    }
    const payload: Record<string, unknown> = {
      objectMetadataId: object.id,
      type: field.type,
      name: field.name,
      label: field.label,
      isLabelSyncedWithName: false,
      isNullable: true,
      ...(options.length ? { options } : {}),
    };
    if (field.target) {
      if (!target?.id) throw new Error(`relation target "${field.target}" is missing`);
      const icon = field.targetIcon ?? 'IconCalendarEvent';
      payload.icon = icon;
      payload.relationCreationPayload = { type: 'MANY_TO_ONE', targetObjectMetadataId: target.id, targetFieldLabel: field.targetLabel ?? 'Reservations', targetFieldIcon: icon };
    }
    await this.request('POST', '/rest/metadata/fields', payload);
  }
}
