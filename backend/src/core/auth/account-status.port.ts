/**
 * What the auth guards need to know about the stored account. The account module
 * provides it (stage 4); until then a module may register a stub for tests.
 */
export abstract class AccountStatusPort {
  /** Role of an active account, or 'deleted' / undefined. */
  abstract lookup(userId: string): Promise<{ role: string; deleted: boolean } | undefined>;
}
