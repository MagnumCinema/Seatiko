/**
 * Seating rules around a booking (APP_LOGIC §5.3):
 * - walk-in guests may use the table until `release` minutes before the booking;
 * - the booked guest may be seated from `sessionStart` minutes before it.
 * When the booked guest may come earlier than walk-ins must leave, their early
 * seating depends on the table being free already.
 */
export type SeatingRules = {
  walkInUntil: Date;
  ownerFrom: Date;
  ownerFromNeedsFreeTable: boolean;
};

export function seatingRules(
  reservedFor: Date,
  sessionStartBeforeMin: number,
  releaseBeforeMin: number,
): SeatingRules {
  const at = reservedFor.getTime();
  return {
    walkInUntil: new Date(at - releaseBeforeMin * 60_000),
    ownerFrom: new Date(at - sessionStartBeforeMin * 60_000),
    ownerFromNeedsFreeTable: sessionStartBeforeMin > releaseBeforeMin,
  };
}
