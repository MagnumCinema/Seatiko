"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, type Locale } from "@/components/locale-provider";
import {
  ApiError,
  callWaiter,
  closeSession,
  createOrder,
  createReservation,
  discoverAi,
  fetchCities,
  fetchCollections,
  fetchMe,
  fetchMenu,
  fetchOrders,
  fetchReservations,
  fetchTables,
  fetchVenue,
  fetchVenues,
  formatTime,
  getToken,
  login,
  logout as apiLogout,
  openSessionFromQr,
  payOrder,
  pickLocale,
  priceLevelLabel,
  register,
  updateMe,
  watchTable,
  type City,
  type HolidayCollection,
  type MenuItem,
  type Order,
  type Reservation,
  type Session,
  type Table,
  type User,
  type Venue,
} from "@/lib/api";

export type Screen =
  | "onboarding"
  | "city-select"
  | "map"
  | "discover"
  | "venue"
  | "floor"
  | "reservation"
  | "scanner"
  | "order-choice"
  | "session"
  | "waiter-initial"
  | "waiter-session"
  | "menu"
  | "payment"
  | "orders"
  | "profile";

const TAB_SCREENS: Screen[] = ["map", "discover", "orders", "profile", "scanner"];
const ONBOARD_KEY = "fa_onboarded";
const CITY_KEY = "fa_city";

type CartLine = { item: MenuItem; qty: number };

const QR_ICON = (
  <svg className="h-[26px] w-[26px]" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="currentColor"
      d="M4 4h6v6H4V4zm2 2v2h2V6H6zm8-2h6v6h-6V4zm2 2v2h2V6h-2zM4 14h6v6H4v-6zm2 2v2h2v-2H6zm8 0h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v2h-2v-2zm4-8h2v6h-2v-2h-2v-2h2V10z"
    />
  </svg>
);

function tableStatusClass(status: string) {
  switch (status) {
    case "FREE":
      return "free";
    case "OCCUPIED":
      return "occupied";
    case "RESERVED":
      return "reserved";
    default:
      return "cleaning";
  }
}

function TableFloorPlan({
  tables,
  selectedId,
  compact = false,
  onTableClick,
}: {
  tables: Table[];
  selectedId?: string;
  compact?: boolean;
  onTableClick: (table: Table) => void;
}) {
  return (
    <div className={`fa-floor-room ${compact ? "compact" : ""}`}>
      <div className="fa-floor-windows" aria-hidden>
        <i /><i /><i />
      </div>
      <div className="fa-floor-bar" aria-hidden>
        <span>BAR</span><i /><i /><i />
      </div>
      <div className="fa-floor-service" aria-hidden>Кухня</div>
      <div className="fa-floor-entrance" aria-hidden>Вход ↑</div>
      {tables.map((table) => {
        const left = Math.max(12, Math.min(88, table.x * 100));
        const top = Math.max(18, Math.min(82, table.y * 100));
        return (
          <button
            key={table.id}
            type="button"
            title={`Стол №${table.number} · ${table.seats} мест`}
            aria-label={`Стол №${table.number}, ${table.seats} мест`}
            className={`fa-table ${tableStatusClass(table.status)} ${
              table.seats >= 6 ? "large" : table.seats <= 2 ? "round" : ""
            } ${selectedId === table.id ? "selected" : ""}`}
            style={{ left: `${left}%`, top: `${top}%` }}
            onClick={() => onTableClick(table)}
          >
            <i className="seat top" aria-hidden />
            <i className="seat right" aria-hidden />
            <span>{table.number}</span>
            <small>{table.seats} мест</small>
            <i className="seat bottom" aria-hidden />
            <i className="seat left" aria-hidden />
          </button>
        );
      })}
      {tables.length === 0 && (
        <div className="fa-floor-empty">План зала пока не настроен</div>
      )}
    </div>
  );
}

function venueMapPosition(item: Venue, all: Venue[]) {
  if (all.length < 2) return { left: "50%", top: "42%" };
  const lats = all.map((entry) => entry.lat);
  const lngs = all.map((entry) => entry.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.004);
  const lngSpan = Math.max(maxLng - minLng, 0.006);
  return {
    left: `${14 + ((item.lng - minLng) / lngSpan) * 72}%`,
    top: `${16 + (1 - (item.lat - minLat) / latSpan) * 60}%`,
  };
}

export function AppShell() {
  const { locale, setLocale, t } = useLocale();

  const [screen, setScreen] = useState<Screen>("onboarding");
  const [obStep, setObStep] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [pendingScreen, setPendingScreen] = useState<Screen | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const [cities, setCities] = useState<City[]>([]);
  const [cityId, setCityId] = useState("city-balti");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [mapQuery, setMapQuery] = useState("");
  const [activeMapVenueId, setActiveMapVenueId] = useState<string | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tableSheet, setTableSheet] = useState<Table | null>(null);

  const [collections, setCollections] = useState<HolidayCollection[]>([]);
  const [aiQuery, setAiQuery] = useState("");
  const [aiFilters, setAiFilters] = useState<string[]>([]);
  const [aiResults, setAiResults] = useState<Venue[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

  const [resGuests, setResGuests] = useState(2);
  const [resTime, setResTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 30, 0, 0);
    return d.toISOString().slice(0, 16);
  });

  const [qrToken, setQrToken] = useState("venue-1:t1");
  const [session, setSession] = useState<Session | null>(null);
  const [sessionVenue, setSessionVenue] = useState<Venue | null>(null);
  const [sessionTable, setSessionTable] = useState<Table | null>(null);
  const [sessionOrders, setSessionOrders] = useState<Order[]>([]);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [waiterReason, setWaiterReason] = useState("order");

  const [orders, setOrders] = useState<Order[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [payStatus, setPayStatus] = useState<"idle" | "paid" | "pending_venue">(
    "idle",
  );
  const [payTotal, setPayTotal] = useState(0);

  const [profileDraft, setProfileDraft] = useState({
    first_name: "",
    last_name: "",
    display_name: "",
  });
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const cityName = useMemo(() => {
    const c = cities.find((x) => x.id === cityId);
    return c ? pickLocale(c.name, locale) : t("map.title");
  }, [cities, cityId, locale, t]);

  const isAuthed = Boolean(user || getToken());

  const visibleVenues = useMemo(() => {
    const query = mapQuery.trim().toLowerCase();
    if (!query) return venues;
    return venues.filter((item) =>
      [
        pickLocale(item.name, locale),
        pickLocale(item.address, locale),
        ...item.cuisine,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [locale, mapQuery, venues]);

  const activeMapVenue =
    visibleVenues.find((item) => item.id === activeMapVenueId) ??
    visibleVenues[0];

  const go = useCallback(
    (next: Screen, requireAuth = false) => {
      if (requireAuth && !getToken()) {
        setPendingScreen(next);
        setAuthOpen(true);
        return;
      }
      setError(null);
      setScreen(next);
    },
    [],
  );

  useEffect(() => {
    const onboarded = localStorage.getItem(ONBOARD_KEY);
    const savedCity = localStorage.getItem(CITY_KEY);
    queueMicrotask(() => {
      if (savedCity) setCityId(savedCity);
      if (onboarded) setScreen("map");
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCities()
      .then((list) => {
        if (!cancelled) setCities(list);
      })
      .catch(() => {
        if (!cancelled) {
          setCities([
            {
              id: "city-balti",
              slug: "balti",
              name: { ru: "Бельцы", en: "Bălți", ro: "Bălți" },
              available: true,
              country: "MD",
            },
            {
              id: "city-chisinau",
              slug: "chisinau",
              name: { ru: "Кишинёв", en: "Chișinău", ro: "Chișinău" },
              available: false,
              country: "MD",
            },
            {
              id: "city-cahul",
              slug: "cahul",
              name: { ru: "Кагул", en: "Cahul", ro: "Cahul" },
              available: false,
              country: "MD",
            },
            {
              id: "city-ungeni",
              slug: "ungeni",
              name: { ru: "Унгены", en: "Ungheni", ro: "Ungheni" },
              available: false,
              country: "MD",
            },
          ]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!getToken()) {
      return;
    }
    fetchMe()
      .then((u) => {
        setUser(u);
        setProfileDraft({
          first_name: u.first_name || "",
          last_name: u.last_name || "",
          display_name: u.display_name || "",
        });
      })
      .catch(() => {
        apiLogout();
        setUser(null);
      });
  }, [screen]);

  useEffect(() => {
    if (screen !== "map" && screen !== "discover") return;
    let cancelled = false;
    fetchVenues(cityId)
      .then((list) => {
        if (!cancelled) setVenues(list);
      })
      .catch(() => {
        if (!cancelled) setError(t("common.error"));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [screen, cityId, t]);

  useEffect(() => {
    if (screen !== "discover") return;
    fetchCollections()
      .then(setCollections)
      .catch(() => setCollections([]));
  }, [screen]);

  useEffect(() => {
    if (screen !== "orders" || !getToken()) return;
    Promise.all([fetchOrders(), fetchReservations()])
      .then(([o, r]) => {
        setOrders(o);
        setReservations(r);
      })
      .catch(() => {
        setOrders([]);
        setReservations([]);
      });
  }, [screen]);

  async function openVenue(id: string) {
    setBusy(true);
    try {
      const v = await fetchVenue(id);
      setVenue(v);
      setTables([]);
      setSelectedTable(null);
      go("venue");
    } catch {
      showToast(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function openFloor() {
    if (!venue) return;
    setBusy(true);
    try {
      const list = await fetchTables(venue.id);
      setTables(list);
      go("floor");
    } catch {
      showToast(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function openMenu(forSession = false) {
    const venueId = forSession
      ? sessionVenue?.id || session?.venue_id
      : venue?.id;
    if (!venueId) return;
    setBusy(true);
    try {
      const items = await fetchMenu(venueId);
      setMenuItems(items);
      if (!forSession) setCart([]);
      go("menu");
    } catch {
      setMenuItems([]);
      go("menu");
      showToast(t("menu.empty"));
    } finally {
      setBusy(false);
    }
  }

  async function submitAuth() {
    setBusy(true);
    setError(null);
    try {
      const res =
        authMode === "login"
          ? await login({
              email: authForm.email,
              password: authForm.password,
            })
          : await register({
              email: authForm.email,
              password: authForm.password,
              first_name: authForm.first_name,
              last_name: authForm.last_name,
              locale,
            });
      setUser(res.user);
      setProfileDraft({
        first_name: res.user.first_name || "",
        last_name: res.user.last_name || "",
        display_name: res.user.display_name || "",
      });
      setAuthOpen(false);
      if (pendingScreen) {
        const next = pendingScreen;
        setPendingScreen(null);
        setScreen(next);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.code : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function submitReservation() {
    if (!venue || !selectedTable) return;
    setBusy(true);
    try {
      await createReservation({
        venue_id: venue.id,
        table_id: selectedTable.id,
        guests: resGuests,
        reserved_for: new Date(resTime).toISOString(),
      });
      showToast(t("res.success"));
      go("orders");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setPendingScreen("reservation");
        setAuthOpen(true);
      } else {
        showToast(t("common.error"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitQr() {
    setBusy(true);
    try {
      const res = await openSessionFromQr(qrToken.trim());
      setSession(res.session);
      setSessionVenue(res.venue ?? null);
      setSessionTable(res.table ?? null);
      setSessionOrders([]);
      if (!res.venue && res.session.venue_id) {
        try {
          setSessionVenue(await fetchVenue(res.session.venue_id));
        } catch {
          /* ignore */
        }
      }
      go("order-choice");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setPendingScreen("scanner");
        setAuthOpen(true);
      } else {
        // Mock fallback so UX flow is demoable without full API
        const mockSession: Session = {
          id: "sess-demo",
          user_id: user?.id || "guest",
          venue_id: venue?.id || "venue-1",
          table_id: selectedTable?.id || "t1",
          status: "ACTIVE",
          started_at: new Date().toISOString(),
        };
        setSession(mockSession);
        if (venue) setSessionVenue(venue);
        else {
          try {
            setSessionVenue(await fetchVenue("venue-1"));
          } catch {
            setSessionVenue(null);
          }
        }
        setSessionTable(
          selectedTable || {
            id: "t1",
            venue_id: "venue-1",
            number: 7,
            seats: 4,
            status: "OCCUPIED",
            x: 0.5,
            y: 0.5,
          },
        );
        go("order-choice");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitOrder() {
    if (!session || cart.length === 0) return;
    setBusy(true);
    try {
      const order = await createOrder({
        session_id: session.id,
        venue_id: session.venue_id,
        items: cart.map((c) => ({ menu_item_id: c.item.id, qty: c.qty })),
      });
      setSessionOrders((prev) => [...prev, order]);
      setCart([]);
      showToast(t("menu.checkout"));
      go("session");
    } catch {
      const mock: Order = {
        id: `ord-${Date.now()}`,
        session_id: session.id,
        user_id: user?.id || "",
        venue_id: session.venue_id,
        items: cart.map((c) => ({
          menu_item_id: c.item.id,
          name: c.item.name,
          qty: c.qty,
          price: c.item.price,
        })),
        status: "PREPARING",
        total: cart.reduce((s, c) => s + c.item.price * c.qty, 0),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setSessionOrders((prev) => [...prev, mock]);
      setCart([]);
      go("session");
    } finally {
      setBusy(false);
    }
  }

  async function submitWaiter(reason: string) {
    if (!session) return;
    setBusy(true);
    try {
      await callWaiter({ session_id: session.id, reason });
    } catch {
      /* demo ok */
    } finally {
      setBusy(false);
      showToast(t("waiter.coming"));
      go("session");
    }
  }

  async function submitPayment(method: "app" | "venue") {
    const order = sessionOrders[sessionOrders.length - 1];
    const total =
      order?.total ||
      sessionOrders.reduce((s, o) => s + o.total, 0) ||
      payTotal;
    setPayTotal(total);
    setBusy(true);
    try {
      if (order) {
        const res = await payOrder({ order_id: order.id, method });
        setPayStatus(
          res.status === "paid" || method === "app" ? "paid" : "pending_venue",
        );
      } else {
        setPayStatus(method === "app" ? "paid" : "pending_venue");
      }
    } catch {
      setPayStatus(method === "app" ? "paid" : "pending_venue");
    } finally {
      setBusy(false);
    }
  }

  async function releaseTable() {
    if (session) {
      try {
        await closeSession(session.id);
      } catch {
        /* ignore */
      }
    }
    setSession(null);
    setSessionOrders([]);
    go("map");
  }

  async function saveProfile() {
    if (!getToken()) {
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    try {
      const u = await updateMe({ ...profileDraft, locale });
      setUser(u);
      showToast(t("profile.saved"));
    } catch {
      showToast(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  function finishOnboarding() {
    localStorage.setItem(ONBOARD_KEY, "1");
    go("city-select");
  }

  function selectCity(c: City) {
    if (!c.available) return;
    setCityId(c.id);
    localStorage.setItem(CITY_KEY, c.id);
    go("map");
  }

  async function runDiscover(query = aiQuery, filters = aiFilters) {
    setAiBusy(true);
    try {
      const res = await discoverAi({
        query,
        city_id: cityId,
        filters,
      });
      setAiResults(res.venues || []);
    } catch {
      setAiResults(
        venues.filter((v) =>
          filters.length
            ? true
            : pickLocale(v.name, locale)
                .toLowerCase()
                .includes(query.toLowerCase().slice(0, 3)) || !query,
        ).slice(0, 3),
      );
    } finally {
      setAiBusy(false);
    }
  }

  const showTabs = TAB_SCREENS.includes(screen);
  const cartTotal = cart.reduce((s, c) => s + c.item.price * c.qty, 0);

  return (
    <div className="fa-page">
      <div className="fa-phone">
        <div className="fa-status-bar">{t("brand.name")}</div>

        <div className="fa-screen">
          {screen === "onboarding" && (
            <div className="fa-content fa-onboarding">
              <div className="fa-ob-icon">
                {["🗺", "🪑", "🍽", "📷"][obStep]}
              </div>
              <h2>
                {
                  [
                    t("onboarding.1.title"),
                    t("onboarding.2.title"),
                    t("onboarding.3.title"),
                    t("onboarding.4.title"),
                  ][obStep]
                }
              </h2>
              <p>
                {
                  [
                    t("onboarding.1.body"),
                    t("onboarding.2.body"),
                    t("onboarding.3.body"),
                    t("onboarding.4.body"),
                  ][obStep]
                }
              </p>
              <div className="fa-dots">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={i === obStep ? "active" : ""} />
                ))}
              </div>
              <button
                type="button"
                className="fa-btn fa-btn-primary"
                onClick={() =>
                  obStep < 3 ? setObStep((s) => s + 1) : finishOnboarding()
                }
              >
                {obStep < 3 ? t("onboarding.next") : t("onboarding.start")}
              </button>
              <button
                type="button"
                className="fa-btn fa-btn-secondary"
                onClick={finishOnboarding}
              >
                {t("onboarding.skip")}
              </button>
            </div>
          )}

          {screen === "city-select" && (
            <div className="fa-content">
              <button type="button" className="fa-back" onClick={() => go("map")}>
                ← {t("common.back")}
              </button>
              <h3 className="fa-h3">{t("city.select_title")}</h3>
              {cities.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`fa-city-item ${c.id === cityId ? "selected" : ""} ${!c.available ? "soon" : ""}`}
                  onClick={() => selectCity(c)}
                  disabled={!c.available}
                >
                  <div>
                    <h4>{pickLocale(c.name, locale)}</h4>
                    <p>
                      Moldova
                      {c.available ? ` · ${t("city.pilot")}` : ""}
                    </p>
                  </div>
                  <span className={`fa-badge ${c.available ? "active" : ""}`}>
                    {c.id === cityId
                      ? t("city.current")
                      : c.available
                        ? t("city.pilot")
                        : t("city.soon")}
                  </span>
                </button>
              ))}
            </div>
          )}

          {screen === "map" && (
            <div className="fa-content">
              <div className="fa-city-header">
                <h2>{cityName}</h2>
                <button
                  type="button"
                  className="fa-change-city"
                  onClick={() => go("city-select")}
                >
                  {t("map.change_city")}
                </button>
              </div>
              <div className="fa-lang-row">
                {(["ru", "en", "ro"] as Locale[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`fa-lang ${locale === l ? "active" : ""}`}
                    onClick={() => setLocale(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <label className="fa-map-search">
                <span aria-hidden>⌕</span>
                <input
                  value={mapQuery}
                  onChange={(event) => setMapQuery(event.target.value)}
                  placeholder={t("map.search")}
                />
                <button type="button" aria-label="Filters">☷</button>
              </label>
              <div className="fa-map-live">
                <div className="fa-map-river" />
                <div className="fa-map-road one" />
                <div className="fa-map-road two" />
                <div className="fa-map-road three" />
                <span className="fa-map-city-word">BĂLȚI</span>
                {visibleVenues.map((v, i) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`fa-map-pin-live ${v.id === activeMapVenue?.id ? "active" : ""}`}
                    style={venueMapPosition(v, visibleVenues)}
                    onClick={() => setActiveMapVenueId(v.id)}
                    aria-label={pickLocale(v.name, locale)}
                  >
                    <span>{i + 1}</span>
                  </button>
                ))}
                {activeMapVenue && (
                  <button
                    type="button"
                    className="fa-map-venue-popover"
                    onClick={() => openVenue(activeMapVenue.id)}
                  >
                    <span className="fa-map-venue-art">♨</span>
                    <span><strong>{pickLocale(activeMapVenue.name, locale)}</strong><small>{t("map.free_tables", { count: activeMapVenue.free_tables })}</small></span>
                    <b>→</b>
                  </button>
                )}
              </div>
              {busy && <p className="fa-muted">{t("common.loading")}</p>}
              {error && <p className="fa-error">{error}</p>}
              {visibleVenues.map((v, index) => (
                <button
                  key={v.id}
                  type="button"
                  className={`fa-venue-card premium ${v.id === activeMapVenue?.id ? "selected" : ""}`}
                  onClick={() => openVenue(v.id)}
                >
                  <span className={`fa-venue-art art-${(index % 3) + 1}`}>♨</span>
                  <div className="fa-venue-card-body">
                    <div className="fa-venue-card-top">
                      <h3>{pickLocale(v.name, locale)}</h3>
                      <span>★ {v.rating}</span>
                    </div>
                    <p>{v.cuisine?.join(" · ")} · {priceLevelLabel(v.price_level)}</p>
                    <div className="fa-venue-card-foot"><span><i /> {t("map.free_tables", { count: v.free_tables })}</span><small>~{v.average_check} MDL</small></div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {screen === "discover" && (
            <div className="fa-content">
              <h3 className="fa-h3">{t("discover.title")}</h3>
              <input
                className="fa-ai-input"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                placeholder={t("discover.placeholder")}
              />
              <div className="fa-chips">
                {(
                  [
                    ["near", "discover.chip_near"],
                    ["budget", "discover.chip_budget"],
                    ["romantic", "discover.chip_romantic"],
                    ["fast", "discover.chip_fast"],
                  ] as const
                ).map(([id, key]) => (
                  <button
                    key={id}
                    type="button"
                    className={`fa-chip ${aiFilters.includes(id) ? "on" : ""}`}
                    onClick={() => {
                      const next = aiFilters.includes(id)
                        ? aiFilters.filter((f) => f !== id)
                        : [...aiFilters, id];
                      setAiFilters(next);
                      void runDiscover(aiQuery, next);
                    }}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="fa-btn fa-btn-primary"
                disabled={aiBusy}
                onClick={() => void runDiscover()}
              >
                {aiBusy ? t("common.loading") : t("discover.ai_ask")}
              </button>
              <p className="fa-section-label">{t("discover.holiday")}</p>
              <div className="fa-holiday-grid">
                {(collections.length
                  ? collections
                  : [
                      {
                        id: "c1",
                        slug: "mar8",
                        title: {
                          ru: "8 марта",
                          en: "8 March",
                          ro: "8 Martie",
                        },
                        venue_ids: [],
                      },
                      {
                        id: "c2",
                        slug: "ny",
                        title: {
                          ru: "Новый год",
                          en: "New Year",
                          ro: "Anul Nou",
                        },
                        venue_ids: [],
                      },
                    ]
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="fa-holiday"
                    onClick={() => void runDiscover(pickLocale(c.title, locale))}
                  >
                    {pickLocale(c.title, locale)}
                  </button>
                ))}
              </div>
              {(aiResults.length ? aiResults : []).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="fa-venue-card"
                  onClick={() => openVenue(v.id)}
                >
                  <h3>AI → {pickLocale(v.name, locale)}</h3>
                  <p>{pickLocale(v.description, locale)}</p>
                </button>
              ))}
              {!aiResults.length && (
                <p className="fa-muted">{t("discover.empty")}</p>
              )}
            </div>
          )}

          {screen === "venue" && venue && (
            <div className="fa-content">
              <button type="button" className="fa-back" onClick={() => go("map")}>
                ← {t("common.back")}
              </button>
              <div className="fa-hero">
                <h2>{pickLocale(venue.name, locale)}</h2>
              </div>
              <p className="fa-muted">
                ★ {venue.rating} · {venue.cuisine?.join(", ")} ·{" "}
                {priceLevelLabel(venue.price_level)}
              </p>
              <p className="fa-muted">{pickLocale(venue.address, locale)}</p>
              <span className="fa-chip-green">
                {t("map.free_tables", { count: venue.free_tables })}
              </span>
              <div className="fa-cta-row">
                <button
                  type="button"
                  className="fa-btn fa-btn-outline"
                  onClick={() => void openFloor()}
                >
                  {t("venue.floor_map")}
                </button>
                <button
                  type="button"
                  className="fa-btn fa-btn-primary"
                  onClick={() => void openFloor()}
                >
                  {t("venue.book")}
                </button>
              </div>
              <p className="fa-section-label">{t("venue.menu")}</p>
              <button
                type="button"
                className="fa-btn fa-btn-secondary"
                onClick={() => void openMenu(false)}
              >
                {t("session.menu")}
              </button>
              <p className="fa-body">{pickLocale(venue.description, locale)}</p>
              {venue.website && (
                <a
                  className="fa-btn fa-btn-outline fa-venue-website"
                  href={venue.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  ↗ {t("venue.website")}
                </a>
              )}
            </div>
          )}

          {screen === "floor" && venue && (
            <div className="fa-content">
              <button
                type="button"
                className="fa-back"
                onClick={() => go("venue")}
              >
                ← {pickLocale(venue.name, locale)}
              </button>
              <div className="fa-legend">
                <span className="free">{t("floor.leg_free")}</span>
                <span className="res">{t("floor.leg_res")}</span>
                <span className="occ">{t("floor.leg_occ")}</span>
                <span className="yours">{t("floor.leg_yours")}</span>
              </div>
              <TableFloorPlan
                tables={tables}
                selectedId={selectedTable?.id}
                onTableClick={(table) => {
                  setTableSheet(table);
                  if (table.status === "FREE") setSelectedTable(table);
                }}
              />
              <button
                type="button"
                className="fa-btn fa-btn-primary"
                disabled={!selectedTable}
                onClick={() => go("reservation", true)}
              >
                {t("floor.select_table")}
              </button>
            </div>
          )}

          {screen === "reservation" && venue && (
            <div className="fa-content">
              <button
                type="button"
                className="fa-back"
                onClick={() => go(selectedTable ? "floor" : "venue")}
              >
                ← {t("common.back")}
              </button>
              <div className="fa-stepper">
                <span className="done" />
                <span className="done" />
                <span className="active" />
                <span />
                <span />
              </div>
              <h3 className="fa-h3">{t("res.confirm_title")}</h3>
              <div className="fa-reservation-floor-head">
                <div>
                  <strong>{t("floor.select_table")}</strong>
                  <small>Нажмите на свободный стол на плане</small>
                </div>
                <button type="button" onClick={() => go("floor")}>На весь экран ↗</button>
              </div>
              <TableFloorPlan
                tables={tables}
                compact
                selectedId={selectedTable?.id}
                onTableClick={(table) => {
                  if (table.status === "FREE") setSelectedTable(table);
                  else setTableSheet(table);
                }}
              />
              <div className="fa-row">
                <span>{t("res.venue")}</span>
                <span>{pickLocale(venue.name, locale)}</span>
              </div>
              <div className="fa-row">
                <span>{t("res.table")}</span>
                <span>
                  {selectedTable ? `#${selectedTable.number}` : "—"}
                </span>
              </div>
              <label className="fa-field">
                <span>{t("res.time")}</span>
                <input
                  type="datetime-local"
                  value={resTime}
                  onChange={(e) => setResTime(e.target.value)}
                />
              </label>
              <label className="fa-field">
                <span>{t("res.guests")}</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={resGuests}
                  onChange={(e) => setResGuests(Number(e.target.value) || 1)}
                />
              </label>
              <button
                type="button"
                className="fa-btn fa-btn-secondary"
                onClick={() => void openMenu(false)}
              >
                {t("res.preorder")}
              </button>
              <button
                type="button"
                className="fa-btn fa-btn-primary"
                disabled={busy || !selectedTable}
                onClick={() => void submitReservation()}
              >
                {t("res.confirm_book")}
              </button>
              <p className="fa-hint">{t("res.preorder_hint")}</p>
            </div>
          )}

          {screen === "scanner" && (
            <div className="fa-content">
              <h3 className="fa-h3 center">{t("scan.title")}</h3>
              <div className="fa-scanner">
                <div className="fa-scanner-frame" />
              </div>
              <p className="fa-hint">{t("scan.hint")}</p>
              <input
                className="fa-input"
                value={qrToken}
                onChange={(e) => setQrToken(e.target.value)}
                placeholder={t("scan.token_placeholder")}
              />
              <button
                type="button"
                className="fa-btn fa-btn-primary"
                disabled={busy || !qrToken.trim()}
                onClick={() => void submitQr()}
              >
                {t("scan.simulate")}
              </button>
            </div>
          )}

          {screen === "order-choice" && (
            <div className="fa-content">
              <h3 className="fa-h3">
                {t("session.your_table", {
                  n: sessionTable?.number ?? 7,
                  venue: sessionVenue
                    ? pickLocale(sessionVenue.name, locale)
                    : "—",
                })}
              </h3>
              <p className="fa-hint left">{t("order_choice.sub")}</p>
              <button
                type="button"
                className="fa-action"
                onClick={() => go("session")}
              >
                📋 {t("order_choice.app")}
              </button>
              <button
                type="button"
                className="fa-action"
                onClick={() => go("waiter-initial")}
              >
                🛎 {t("order_choice.waiter")}
              </button>
            </div>
          )}

          {screen === "session" && (
            <div className="fa-content">
              <h3 className="fa-h3">
                {t("session.your_table", {
                  n: sessionTable?.number ?? 7,
                  venue: sessionVenue
                    ? pickLocale(sessionVenue.name, locale)
                    : "—",
                })}
              </h3>
              <div className="fa-session-actions">
                <button
                  type="button"
                  className="fa-action"
                  onClick={() => void openMenu(true)}
                >
                  📋 {t("session.menu")}
                </button>
                <button
                  type="button"
                  className="fa-action"
                  onClick={() => go("waiter-session")}
                >
                  🛎 {t("session.waiter")}
                </button>
              </div>
              <p className="fa-section-label">{t("session.active_order")}</p>
              {sessionOrders.length === 0 && (
                <p className="fa-muted">{t("session.empty_orders")}</p>
              )}
              {sessionOrders.flatMap((o) =>
                o.items.map((it, idx) => (
                  <div key={`${o.id}-${idx}`} className="fa-row">
                    <span>
                      <span
                        className={`fa-dot ${o.status === "READY" ? "ready" : "prep"}`}
                      />
                      {pickLocale(it.name, locale)} ×{it.qty}
                    </span>
                    <span className="fa-muted">
                      {o.status === "READY"
                        ? t("session.ready")
                        : t("session.preparing")}
                    </span>
                  </div>
                )),
              )}
              <button
                type="button"
                className="fa-btn fa-btn-primary"
                onClick={() => {
                  setPayStatus("idle");
                  setPayTotal(
                    sessionOrders.reduce((s, o) => s + o.total, 0) || cartTotal,
                  );
                  go("payment");
                }}
              >
                💳 {t("session.bill")}
              </button>
              <button
                type="button"
                className="fa-btn fa-btn-secondary"
                onClick={() => void releaseTable()}
              >
                {t("session.release")}
              </button>
            </div>
          )}

          {screen === "waiter-initial" && (
            <div className="fa-content">
              <button
                type="button"
                className="fa-back"
                onClick={() => go("order-choice")}
              >
                ← {t("common.back")}
              </button>
              <h3 className="fa-h3">{t("waiter.initial_title")}</h3>
              <p className="fa-hint left">{t("waiter.initial_sub")}</p>
              <div className="fa-row">
                <span>
                  {t("session.your_table", {
                    n: sessionTable?.number ?? 7,
                    venue: sessionVenue
                      ? pickLocale(sessionVenue.name, locale)
                      : "—",
                  })}
                </span>
                <span>#{sessionTable?.number ?? 7}</span>
              </div>
              <button
                type="button"
                className="fa-btn fa-btn-primary"
                onClick={() => void submitWaiter("initial")}
              >
                🛎 {t("waiter.initial_call")}
              </button>
              <button
                type="button"
                className="fa-btn fa-btn-secondary"
                onClick={() => go("session")}
              >
                📋 {t("order_choice.app")}
              </button>
            </div>
          )}

          {screen === "waiter-session" && (
            <div className="fa-content">
              <button
                type="button"
                className="fa-back"
                onClick={() => go("session")}
              >
                ← {t("common.back")}
              </button>
              <h3 className="fa-h3">{t("waiter.session_title")}</h3>
              <p className="fa-hint left">{t("waiter.session_sub")}</p>
              {(
                [
                  ["order", "waiter.reason_order"],
                  ["bill", "waiter.reason_bill"],
                  ["question", "waiter.reason_question"],
                  ["other", "waiter.reason_other"],
                ] as const
              ).map(([id, key]) => (
                <button
                  key={id}
                  type="button"
                  className={`fa-btn fa-btn-secondary ${waiterReason === id ? "fa-selected" : ""}`}
                  onClick={() => setWaiterReason(id)}
                >
                  {t(key)}
                </button>
              ))}
              <button
                type="button"
                className="fa-btn fa-btn-primary"
                onClick={() => void submitWaiter(waiterReason)}
              >
                {t("common.send")}
              </button>
              <p className="fa-hint">{t("waiter.coming")}</p>
            </div>
          )}

          {screen === "menu" && (
            <div className="fa-content">
              <button
                type="button"
                className="fa-back"
                onClick={() => go(session ? "session" : venue ? "venue" : "map")}
              >
                ← {t("common.back")}
              </button>
              <h3 className="fa-h3">{t("menu.title")}</h3>
              {menuItems.length === 0 && (
                <p className="fa-muted">{t("menu.empty")}</p>
              )}
              {menuItems.map((item) => (
                <div key={item.id} className="fa-row">
                  <div>
                    <strong>{pickLocale(item.name, locale)}</strong>
                    <p className="fa-muted">
                      {pickLocale(item.category, locale)} · {item.price} MDL
                    </p>
                  </div>
                  <button
                    type="button"
                    className="fa-mini"
                    onClick={() => {
                      setCart((prev) => {
                        const ex = prev.find((c) => c.item.id === item.id);
                        if (ex) {
                          return prev.map((c) =>
                            c.item.id === item.id
                              ? { ...c, qty: c.qty + 1 }
                              : c,
                          );
                        }
                        return [...prev, { item, qty: 1 }];
                      });
                    }}
                  >
                    {t("menu.add")}
                  </button>
                </div>
              ))}
              <div className="fa-cart">
                <p className="fa-section-label">{t("menu.cart")}</p>
                {cart.length === 0 ? (
                  <p className="fa-muted">{t("menu.cart_empty")}</p>
                ) : (
                  <>
                    {cart.map((c) => (
                      <div key={c.item.id} className="fa-row">
                        <span>
                          {pickLocale(c.item.name, locale)} ×{c.qty}
                        </span>
                        <span>{c.item.price * c.qty} MDL</span>
                      </div>
                    ))}
                    <div className="fa-row">
                      <strong>{t("menu.total")}</strong>
                      <strong>{cartTotal} MDL</strong>
                    </div>
                    <button
                      type="button"
                      className="fa-btn fa-btn-primary"
                      disabled={!session || busy}
                      onClick={() => void submitOrder()}
                    >
                      {t("menu.checkout")}
                    </button>
                    {!session && (
                      <p className="fa-hint">{t("scan.hint")}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {screen === "payment" && (
            <div className="fa-content">
              <button
                type="button"
                className="fa-back"
                onClick={() => go("session")}
              >
                ← {t("common.back")}
              </button>
              <h3 className="fa-h3">{t("payment.title")}</h3>
              <div className="fa-row">
                <span>{t("payment.total")}</span>
                <strong>{payTotal || 0} MDL</strong>
              </div>
              {payStatus === "idle" ? (
                <>
                  <button
                    type="button"
                    className="fa-btn fa-btn-primary"
                    onClick={() => void submitPayment("app")}
                  >
                    {t("payment.pay_app")}
                  </button>
                  <button
                    type="button"
                    className="fa-btn fa-btn-secondary"
                    onClick={() => void submitPayment("venue")}
                  >
                    {t("payment.pay_venue")}
                  </button>
                </>
              ) : (
                <>
                  <p className="fa-success">
                    {payStatus === "paid"
                      ? t("payment.status_paid")
                      : t("payment.status_pending")}
                  </p>
                  <button
                    type="button"
                    className="fa-btn fa-btn-primary"
                    onClick={() => go("session")}
                  >
                    {t("payment.done")}
                  </button>
                </>
              )}
            </div>
          )}

          {screen === "orders" && (
            <div className="fa-content">
              <h3 className="fa-h3">{t("orders.title")}</h3>
              {!isAuthed && (
                <button
                  type="button"
                  className="fa-btn fa-btn-primary"
                  onClick={() => setAuthOpen(true)}
                >
                  {t("orders.need_auth")}
                </button>
              )}
              {session && (
                <button
                  type="button"
                  className="fa-venue-card"
                  onClick={() => go("session")}
                >
                  <h3>{t("orders.session")}</h3>
                  <p>
                    #{sessionTable?.number ?? "—"} · {sessionOrders.length}{" "}
                    items
                  </p>
                </button>
              )}
              {reservations.map((r) => (
                <div key={r.id} className="fa-venue-card static">
                  <h3>{t("orders.active_res")}</h3>
                  <p>
                    {r.table_id} · {formatTime(r.reserved_for)} · {r.status}
                  </p>
                </div>
              ))}
              {orders.map((o) => (
                <div key={o.id} className="fa-venue-card static">
                  <h3>
                    {o.status} · {o.total} MDL
                  </h3>
                  <p>{formatTime(o.created_at)}</p>
                </div>
              ))}
              {isAuthed &&
                !session &&
                !reservations.length &&
                !orders.length && (
                  <p className="fa-muted">{t("orders.empty")}</p>
                )}
            </div>
          )}

          {screen === "profile" && (
            <div className="fa-content">
              <h3 className="fa-h3">{t("profile.title")}</h3>
              {!user ? (
                <button
                  type="button"
                  className="fa-btn fa-btn-primary"
                  onClick={() => setAuthOpen(true)}
                >
                  {t("profile.sign_in")}
                </button>
              ) : (
                <>
                  <p className="fa-muted">{user.email}</p>
                  <label className="fa-field">
                    <span>{t("profile.first_name")}</span>
                    <input
                      value={profileDraft.first_name}
                      onChange={(e) =>
                        setProfileDraft((p) => ({
                          ...p,
                          first_name: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="fa-field">
                    <span>{t("profile.last_name")}</span>
                    <input
                      value={profileDraft.last_name}
                      onChange={(e) =>
                        setProfileDraft((p) => ({
                          ...p,
                          last_name: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="fa-field">
                    <span>{t("profile.display_name")}</span>
                    <input
                      value={profileDraft.display_name}
                      onChange={(e) =>
                        setProfileDraft((p) => ({
                          ...p,
                          display_name: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="fa-btn fa-btn-primary"
                    onClick={() => void saveProfile()}
                  >
                    {t("common.save")}
                  </button>
                </>
              )}
              <div className="fa-row">
                <span>{t("profile.language")}</span>
                <div className="fa-lang-row compact">
                  {(["ru", "en", "ro"] as Locale[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      className={`fa-lang ${locale === l ? "active" : ""}`}
                      onClick={() => setLocale(l)}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="fa-row">
                <span>{t("profile.allergies")}</span>
                <span>—</span>
              </div>
              <div className="fa-row">
                <span>{t("profile.payment_methods")}</span>
                <span>→</span>
              </div>
              <div className="fa-row">
                <span>{t("profile.favorites")}</span>
                <span>→</span>
              </div>
              {user && (
                <button
                  type="button"
                  className="fa-btn fa-btn-secondary"
                  onClick={() => {
                    apiLogout();
                    setUser(null);
                    showToast(t("auth.logout"));
                  }}
                >
                  {t("auth.logout")}
                </button>
              )}
            </div>
          )}
        </div>

        {showTabs && (
          <nav className="fa-tab-bar">
            {screen !== "scanner" && (
              <div className="fa-tab-qr-row">
                <span className="fa-tab-qr-label">{t("nav.scan")}</span>
                <button
                  type="button"
                  className="fa-tab-qr-btn"
                  aria-label={t("nav.scan")}
                  onClick={() => go("scanner")}
                >
                  {QR_ICON}
                </button>
              </div>
            )}
            <div
              className={`fa-tab-main ${screen === "scanner" ? "only" : ""}`}
            >
              {(
                [
                  ["map", "⌖", "nav.map"],
                  ["discover", "✦", "nav.discover"],
                  ["orders", "▤", "nav.orders"],
                  ["profile", "◉", "nav.profile"],
                ] as const
              ).map(([id, icon, key]) => (
                <button
                  key={id}
                  type="button"
                  className={`fa-tab ${screen === id ? "active" : ""}`}
                  onClick={() => go(id)}
                >
                  <span className="fa-tab-icon">{icon}</span>
                  <span className="fa-tab-label">{t(key)}</span>
                </button>
              ))}
            </div>
          </nav>
        )}

        {tableSheet && (
          <div className="fa-modal-overlay" role="presentation">
            <div className="fa-modal">
              <h3>{t("table.title", { n: tableSheet.number })}</h3>
              <span
                className={`fa-modal-status ${tableSheet.status.toLowerCase()}`}
              >
                {tableSheet.status === "FREE"
                  ? t("table.status_free")
                  : tableSheet.status === "OCCUPIED"
                    ? t("table.status_occupied")
                    : tableSheet.status === "RESERVED"
                      ? t("table.status_reserved")
                      : tableSheet.status}
              </span>
              <p className="fa-hint left">
                {t("table.seats", { n: tableSheet.seats })}
              </p>
              {tableSheet.status === "OCCUPIED" && (
                <>
                  <p>
                    {t("table.arrived_at", {
                      time: formatTime(tableSheet.occupied_since),
                    })}
                  </p>
                  <p className="fa-hint left">{t("table.arrived_hint")}</p>
                  <button
                    type="button"
                    className="fa-btn fa-btn-secondary"
                    onClick={() => {
                      if (!venue) return;
                      void watchTable({
                        venue_id: venue.id,
                        table_id: tableSheet.id,
                      })
                        .then(() => showToast(t("table.notify_set")))
                        .catch(() => showToast(t("table.notify_set")));
                    }}
                  >
                    🔔 {t("table.notify_free")}
                  </button>
                </>
              )}
              {tableSheet.status === "RESERVED" && (
                <>
                  <p>
                    {t("table.reserved_for", {
                      time: formatTime(tableSheet.reserved_for),
                    })}
                  </p>
                  <button
                    type="button"
                    className="fa-btn fa-btn-secondary"
                    onClick={() => {
                      showToast(
                        t("table.im_coming_set", {
                          time: formatTime(tableSheet.reserved_for),
                        }),
                      );
                    }}
                  >
                    ✓ {t("table.im_coming")}
                  </button>
                </>
              )}
              {tableSheet.status === "FREE" && (
                <button
                  type="button"
                  className="fa-btn fa-btn-primary"
                  onClick={() => {
                    setSelectedTable(tableSheet);
                    setTableSheet(null);
                    go("reservation", true);
                  }}
                >
                  {t("table.book_this")}
                </button>
              )}
              <button
                type="button"
                className="fa-btn fa-btn-secondary"
                onClick={() => setTableSheet(null)}
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        )}

        {authOpen && (
          <div className="fa-modal-overlay" role="presentation">
            <div className="fa-modal">
              <h3>{t("auth.title")}</h3>
              <p className="fa-hint">{t("auth.body")}</p>
              {authMode === "register" && (
                <>
                  <input
                    className="fa-input"
                    placeholder={t("auth.first_name")}
                    value={authForm.first_name}
                    onChange={(e) =>
                      setAuthForm((f) => ({
                        ...f,
                        first_name: e.target.value,
                      }))
                    }
                  />
                  <input
                    className="fa-input"
                    placeholder={t("auth.last_name")}
                    value={authForm.last_name}
                    onChange={(e) =>
                      setAuthForm((f) => ({
                        ...f,
                        last_name: e.target.value,
                      }))
                    }
                  />
                </>
              )}
              <input
                className="fa-input"
                type="email"
                placeholder={t("auth.email")}
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm((f) => ({ ...f, email: e.target.value }))
                }
              />
              <input
                className="fa-input"
                type="password"
                placeholder={t("auth.password")}
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm((f) => ({ ...f, password: e.target.value }))
                }
              />
              {error && <p className="fa-error">{error}</p>}
              <button
                type="button"
                className="fa-btn fa-btn-primary"
                disabled={busy}
                onClick={() => void submitAuth()}
              >
                {authMode === "login" ? t("auth.login") : t("auth.register")}
              </button>
              <button
                type="button"
                className="fa-btn fa-btn-secondary"
                onClick={() =>
                  setAuthMode((m) => (m === "login" ? "register" : "login"))
                }
              >
                {authMode === "login"
                  ? t("auth.switch_register")
                  : t("auth.switch_login")}
              </button>
              <button
                type="button"
                className="fa-btn fa-btn-secondary"
                onClick={() => {
                  setAuthOpen(false);
                  setPendingScreen(null);
                  setError(null);
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        {toast && <div className="fa-toast">{toast}</div>}
      </div>
    </div>
  );
}
