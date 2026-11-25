/**
 * Demo sign-in buttons (guest@seatiko.local …) only for development against a demo
 * database. The real site has no demo accounts: NEXT_PUBLIC_DEMO_LOGIN is off by default.
 */
export const DEMO_LOGIN = process.env.NEXT_PUBLIC_DEMO_LOGIN === "true";
