// Sign in with Google through Google's own account chooser (OpenID Connect, response_type
// id_token): our button opens it in a popup, Google sends the browser back to
// /auth/google/callback with an ID token, and that page hands it to the page that asked
// (BroadcastChannel: Google's Cross-Origin-Opener-Policy cuts window.opener). The API
// verifies the token and its nonce; no client secret is involved.
//
// The Google OAuth client needs "<site origin>/auth/google/callback" as an authorized
// redirect URI (and the origin as an authorized JavaScript origin).

export const GOOGLE_CALLBACK_PATH = "/auth/google/callback";
const CHANNEL = "seatiko-google-auth";
const PENDING_KEY = "seatiko_google_pending";
/** A sign-in not finished within this time is dropped. */
const PENDING_TTL_MS = 10 * 60_000;

export type GooglePending = {
  state: string;
  nonce: string;
  /** popup: the page that opened Google waits; redirect: the callback page signs in itself. */
  mode: "popup" | "redirect";
  role?: "guest" | "restaurant";
  locale?: string;
  /** Where the redirect flow returns. */
  next?: string;
  at: number;
};

export type GoogleResult = { credential: string; nonce: string };

/** Message from the callback page to the page that opened Google. */
type ChannelMessage = { state: string; credential?: string; error?: string };

export class GoogleAuthError extends Error {
  constructor(readonly code: "popup_closed" | "popup_blocked" | "access_denied" | "google_failed") {
    super(code);
  }
}

function random(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function readPending(): GooglePending[] {
  try {
    const list = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as GooglePending[];
    return Array.isArray(list) ? list.filter((p) => Date.now() - p.at < PENDING_TTL_MS) : [];
  } catch {
    return [];
  }
}

function writePending(list: GooglePending[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-5)));
  } catch {
    // Private mode without storage: the popup flow still works through the channel.
  }
}

/** The pending sign-in this callback belongs to, removed so it is used once. */
export function takePending(state: string): GooglePending | undefined {
  const list = readPending();
  const found = list.find((p) => p.state === state);
  writePending(list.filter((p) => p.state !== state));
  return found;
}

function authUrl(clientId: string, state: string, nonce: string, locale?: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}${GOOGLE_CALLBACK_PATH}`,
    response_type: "id_token",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
  });
  if (locale) params.set("hl", locale);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function openPopup(url: string): Window | null {
  const width = 480;
  const height = 640;
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
  return window.open(url, "seatiko-google", `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
}

/**
 * Opens Google's account chooser and resolves with the ID token and its nonce. Call it
 * straight from a click, or the browser blocks the popup. With `redirectIfBlocked`, a
 * blocked popup becomes a full-page redirect (the callback page then signs in itself
 * and returns to the current page), and the promise never settles.
 */
export function signInWithGooglePopup(
  clientId: string,
  options: { locale?: string; role?: "guest" | "restaurant"; redirectIfBlocked?: boolean } = {},
): Promise<GoogleResult> {
  const state = random();
  const nonce = random();
  const url = authUrl(clientId, state, nonce, options.locale);
  const popup = openPopup(url);
  if (!popup) {
    if (options.redirectIfBlocked) {
      writePending([...readPending(), { state, nonce, mode: "redirect", role: options.role, locale: options.locale, next: window.location.pathname + window.location.search, at: Date.now() }]);
      window.location.assign(url);
      return new Promise(() => {});
    }
    return Promise.reject(new GoogleAuthError("popup_blocked"));
  }
  writePending([...readPending(), { state, nonce, mode: "popup", at: Date.now() }]);

  // No popup.closed polling: Google's COOP cuts the link to the popup, after which the
  // browser reports it closed while the user is still choosing an account. A sign-in the
  // user abandons just waits; the button stays usable and the next click starts afresh.
  return new Promise<GoogleResult>((resolve, reject) => {
    const channel = new BroadcastChannel(CHANNEL);
    const timeout = window.setTimeout(() => {
      channel.close();
      reject(new GoogleAuthError("popup_closed"));
    }, PENDING_TTL_MS);
    channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const msg = event.data;
      if (!msg || msg.state !== state) return;
      channel.close();
      window.clearTimeout(timeout);
      if (msg.credential) resolve({ credential: msg.credential, nonce });
      else reject(new GoogleAuthError(msg.error === "access_denied" ? "access_denied" : "google_failed"));
    };
  });
}

/** Callback page: hands Google's answer to the page that opened the popup. */
export function postToOpener(message: ChannelMessage) {
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(message);
  channel.close();
}
