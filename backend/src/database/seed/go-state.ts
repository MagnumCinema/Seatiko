import type { LocalizedString } from '../schema/columns.js';

/** Shape of the Go API snapshot (seatiko-state.json), only the fields we import. */
export type GoState = {
  cities?: Record<string, any>;
  venues?: Record<string, any>;
  tables?: Record<string, any>;
  users?: Record<string, any>;
  reservations?: Record<string, any>;
  watches?: Record<string, any>;
  sessions?: Record<string, any>;
  menu_items?: Record<string, any>;
  orders?: Record<string, any>;
  waiter_calls?: Record<string, any>;
  collections?: Record<string, any>;
  applications?: Record<string, any>;
  activities?: Record<string, any[]>;
  staff_members?: Record<string, any>;
  work_shifts?: Record<string, any>;
  profile_changes?: Record<string, any>;
  waitlist?: Record<string, any>;
  event_inquiries?: Record<string, any>;
  adult_permission_log?: any[];
  notifications?: any[];
  demo_menu_version?: number;
};

export const EMPTY_TEXT: LocalizedString = { ru: '', en: '', ro: '' };
export const values = <T>(m: Record<string, T> | undefined): T[] => Object.values(m ?? {});
