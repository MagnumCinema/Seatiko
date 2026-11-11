"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import {
  ApiError,
  adminCRMStatus,
  adminListApplications,
  adminListChangeRequests,
  adminListCompanies,
  adminListOrders,
  adminListPeople,
  adminListReservations,
  adminOverview,
  adminPublishApplication,
  adminReconcileCRM,
  adminReviewApplication,
  adminReviewChangeRequest,
  fetchMe,
  formatTime,
  getToken,
  logout,
  mediaUrl,
  pickLocale,
  type AdminCompany,
  type AdminCRMStatus,
  type AdminOrderRow,
  type AdminOverview,
  type AdminPerson,
  type AdminReservationRow,
  type ApplicationStatus,
  type ProfileChangeRequest,
  type User,
  type VenueApplication,
} from "@/lib/api";

type Section =
  | "overview"
  | "moderation"
  | "companies"
  | "people"
  | "reservations"
  | "orders"
  | "changes"
  | "crm";

const NAV_WORKSPACE: { id: Section; label: string; hint: string }[] = [
  { id: "overview", label: "Обзор", hint: "Сводка платформы и CRM" },
  { id: "moderation", label: "Модерация", hint: "Заявки ресторанов" },
  { id: "orders", label: "Оплаты", hint: "Заказы и выручка" },
  { id: "changes", label: "Изменения", hint: "Правки после публикации" },
  { id: "crm", label: "CRM sync", hint: "Связь с Twenty" },
];

const NAV_OBJECTS: { id: Section; label: string; hint: string }[] = [
  { id: "people", label: "People", hint: "Гости, владельцы, staff" },
  { id: "companies", label: "Companies", hint: "Рестораны в CRM" },
  { id: "reservations", label: "Reservations", hint: "Бронирования" },
];

const ALL_NAV = [...NAV_WORKSPACE, ...NAV_OBJECTS];

const FILTERS: Array<{ id: ApplicationStatus | ""; label: string }> = [
  { id: "", label: "Все" },
  { id: "SUBMITTED", label: "Отправлено" },
  { id: "UNDER_REVIEW", label: "На проверке" },
  { id: "APPROVED", label: "Одобрено" },
  { id: "REJECTED", label: "Отклонено" },
  { id: "PUBLISHED", label: "Опубликовано" },
];

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} MDL`;
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [apps, setApps] = useState<VenueApplication[]>([]);
  const [filter, setFilter] = useState<ApplicationStatus | "">("SUBMITTED");
  const [people, setPeople] = useState<AdminPerson[]>([]);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [reservations, setReservations] = useState<AdminReservationRow[]>([]);
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [changes, setChanges] = useState<ProfileChangeRequest[]>([]);
  const [crm, setCrm] = useState<AdminCRMStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [query, setQuery] = useState("");

  const boot = useCallback(async () => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    const me = await fetchMe();
    if (me.role !== "admin") {
      router.replace("/");
      return;
    }
    setUser(me);
  }, [router]);

  const loadSection = useCallback(async () => {
    setError(null);
    try {
      if (section === "overview") {
        const [stats, crmStatus] = await Promise.all([adminOverview(), adminCRMStatus()]);
        setOverview(stats);
        setCrm(crmStatus);
      }
      if (section === "moderation") {
        setApps(await adminListApplications(filter));
      }
      if (section === "companies") {
        setCompanies(await adminListCompanies());
      }
      if (section === "people") {
        setPeople(await adminListPeople());
      }
      if (section === "reservations") {
        setReservations(await adminListReservations());
      }
      if (section === "orders") {
        setOrders(await adminListOrders());
      }
      if (section === "changes") {
        setChanges(await adminListChangeRequests());
      }
      if (section === "crm") {
        setCrm(await adminCRMStatus());
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "Ошибка загрузки");
    }
  }, [section, filter]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void boot().catch(() => router.replace("/login"));
    }, 0);
    return () => window.clearTimeout(t);
  }, [boot, router]);

  useEffect(() => {
    if (!user) return;
    const t = window.setTimeout(() => void loadSection(), 0);
    return () => window.clearTimeout(t);
  }, [user, loadSection]);

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.email, p.display_name, p.first_name, p.last_name, p.role].join(" ").toLowerCase().includes(q),
    );
  }, [people, query]);

  const filteredCompanies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      [pickLocale(c.name, "ru"), c.owner_email, c.email, c.status, c.phone]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [companies, query]);

  const filteredReservations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reservations;
    return reservations.filter((r) =>
      [pickLocale(r.venue_name, "ru"), r.guest_name, r.guest_email, r.status]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [reservations, query]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      [pickLocale(o.venue_name, "ru"), o.guest_name, o.guest_email, o.status, o.id]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [orders, query]);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await action();
      setOk(success);
      await loadSection();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  function go(id: Section) {
    setSection(id);
    setQuery("");
    setOk(null);
    setError(null);
  }

  const current = ALL_NAV.find((n) => n.id === section);

  if (!user) {
    return (
      <div className="admin-console">
        <p className="admin-loading">Загрузка консоли…</p>
      </div>
    );
  }

  return (
    <div className="admin-console">
      <div className="admin-shell">
        <aside className="admin-rail">
          <div className="admin-rail-brand">
            <span className="admin-logo" aria-hidden>
              S
            </span>
            <div>
              <strong>Seatiko</strong>
              <span>Admin</span>
            </div>
          </div>

          <div className="admin-nav-group">
            <p className="admin-nav-label">Платформа</p>
            <nav>
              {NAV_WORKSPACE.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={section === item.id ? "on" : ""}
                  onClick={() => go(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="admin-nav-group">
            <p className="admin-nav-label">CRM объекты</p>
            <nav>
              {NAV_OBJECTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={section === item.id ? "on" : ""}
                  onClick={() => go(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="admin-rail-foot">
            <a href="http://crm.localhost/" target="_blank" rel="noreferrer">
              Открыть Twenty CRM ↗
            </a>
            <span className="admin-user">{user.email}</span>
            <button
              type="button"
              className="admin-link-btn"
              onClick={() => {
                logout();
                router.push("/login");
              }}
            >
              Выйти
            </button>
          </div>
        </aside>

        <div className="admin-content">
          <header className="admin-page-header">
            <div>
              <p className="admin-page-kicker">Консоль оператора</p>
              <h1>{current?.label}</h1>
              <p className="admin-page-desc">{current?.hint}</p>
            </div>
            <div className="admin-main-actions">
              {(section === "companies" ||
                section === "people" ||
                section === "reservations" ||
                section === "orders") && (
                <input
                  className="admin-search"
                  placeholder="Поиск…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}
              <button
                type="button"
                className="admin-btn secondary"
                disabled={busy}
                onClick={() => void loadSection()}
              >
                Обновить
              </button>
            </div>
          </header>

          <main className="admin-main">
            {error && <p className="admin-banner error">{error}</p>}
            {ok && <p className="admin-banner ok">{ok}</p>}

            {section === "overview" && overview && (
              <div className="admin-overview">
                <div className="admin-stat-grid">
                  <article>
                    <span>Выручка</span>
                    <strong>{money(overview.revenue_paid_mdl)}</strong>
                    <small>оплаченные заказы</small>
                  </article>
                  <article>
                    <span>Активные брони</span>
                    <strong>{overview.reservations_active}</strong>
                    <small>из {overview.reservations_total} всего</small>
                  </article>
                  <article>
                    <span>Рестораны</span>
                    <strong>{overview.venues_published}</strong>
                    <small>опубликовано</small>
                  </article>
                  <article>
                    <span>Модерация</span>
                    <strong>{overview.applications_pending}</strong>
                    <small>в очереди</small>
                  </article>
                  <article>
                    <span>Люди</span>
                    <strong>{overview.users_total}</strong>
                    <small>
                      {overview.guests_total} гост. · {overview.owners_total} вл.
                    </small>
                  </article>
                  <article>
                    <span>Заказы</span>
                    <strong>{overview.orders_total}</strong>
                    <small>{overview.orders_paid} оплачено</small>
                  </article>
                  <article>
                    <span>Официант</span>
                    <strong>{overview.waiter_calls_pending}</strong>
                    <small>ожидают</small>
                  </article>
                  <article>
                    <span>Изменения</span>
                    <strong>{overview.change_requests_open}</strong>
                    <small>открытых запросов</small>
                  </article>
                </div>
                <div className="admin-crm-card">
                  <div>
                    <h2>Twenty CRM</h2>
                    <p className="muted">
                      Статус:{" "}
                      <b className={crm?.healthy ? "good" : "bad"}>
                        {crm?.enabled ? (crm.healthy ? "healthy" : "ошибка sync") : "выключен"}
                      </b>
                    </p>
                    {crm?.last_success_at && (
                      <p className="muted">
                        Последний sync: {new Date(crm.last_success_at).toLocaleString("ru-RU")}
                      </p>
                    )}
                    {crm?.last_error && <p className="bad-text">{crm.last_error}</p>}
                  </div>
                  <div className="admin-crm-actions">
                    <a className="admin-btn" href="http://crm.localhost/" target="_blank" rel="noreferrer">
                      Открыть CRM
                    </a>
                    <button
                      type="button"
                      className="admin-btn secondary"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await adminReconcileCRM();
                          setCrm(await adminCRMStatus());
                        }, "Reconcile запущен")
                      }
                    >
                      Reconcile
                    </button>
                  </div>
                </div>
              </div>
            )}

            {section === "moderation" && (
              <div className="admin-section">
                <div className="admin-chips">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id || "all"}
                      type="button"
                      className={filter === f.id ? "on" : ""}
                      onClick={() => setFilter(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Заведение</th>
                        <th>Статус</th>
                        <th>Контакты</th>
                        <th>Фото</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apps.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <strong>{pickLocale(a.name, "ru") || "—"}</strong>
                            <div className="muted">{pickLocale(a.address, "ru")}</div>
                            {a.reject_reason && <div className="bad-text">{a.reject_reason}</div>}
                          </td>
                          <td>
                            <StatusBadge status={a.status} />
                          </td>
                          <td className="muted">
                            {a.phone}
                            <br />
                            {a.email}
                          </td>
                          <td>
                            <div className="admin-photos">
                              {a.photo_urls?.slice(0, 3).map((url) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={url} src={mediaUrl(url)} alt="" />
                              ))}
                            </div>
                          </td>
                          <td>
                            <div className="admin-row-actions">
                              {a.status === "SUBMITTED" && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    run(
                                      () =>
                                        adminReviewApplication(a.id, { status: "UNDER_REVIEW" }).then(
                                          () => undefined,
                                        ),
                                      "Взято в работу",
                                    )
                                  }
                                >
                                  В работу
                                </button>
                              )}
                              {(a.status === "SUBMITTED" || a.status === "UNDER_REVIEW") && (
                                <>
                                  <button
                                    type="button"
                                    className="primary"
                                    disabled={busy}
                                    onClick={() =>
                                      run(
                                        () =>
                                          adminReviewApplication(a.id, { status: "APPROVED" }).then(
                                            () => undefined,
                                          ),
                                        "Одобрено",
                                      )
                                    }
                                  >
                                    Одобрить
                                  </button>
                                  <button type="button" disabled={busy} onClick={() => setRejectFor(a.id)}>
                                    Отклонить
                                  </button>
                                </>
                              )}
                              {a.status === "APPROVED" && (
                                <button
                                  type="button"
                                  className="primary"
                                  disabled={busy}
                                  onClick={() =>
                                    run(
                                      () => adminPublishApplication(a.id).then(() => undefined),
                                      "Опубликовано + CRM",
                                    )
                                  }
                                >
                                  Опубликовать
                                </button>
                              )}
                            </div>
                            {rejectFor === a.id && (
                              <div className="admin-reject">
                                <textarea
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  placeholder="Причина отклонения"
                                />
                                <button
                                  type="button"
                                  className="primary"
                                  disabled={busy || rejectReason.trim().length < 3}
                                  onClick={() =>
                                    run(async () => {
                                      await adminReviewApplication(a.id, {
                                        status: "REJECTED",
                                        reject_reason: rejectReason.trim(),
                                      });
                                      setRejectFor(null);
                                      setRejectReason("");
                                    }, "Отклонено")
                                  }
                                >
                                  Подтвердить
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {apps.length === 0 && <p className="admin-empty">Нет заявок по фильтру.</p>}
                </div>
              </div>
            )}

            {section === "companies" && (
              <div className="admin-table-wrap">
                <p className="admin-sync-note">
                  Зеркало CRM · <b>Companies</b>
                </p>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Название</th>
                      <th>Статус</th>
                      <th>Владелец</th>
                      <th>Средний чек</th>
                      <th>CRM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompanies.map((c) => (
                      <tr key={c.application_id}>
                        <td>
                          <strong>{pickLocale(c.name, "ru")}</strong>
                          <div className="muted">{c.cuisine?.join(", ")}</div>
                        </td>
                        <td>
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="muted">
                          {c.owner_name}
                          <br />
                          {c.owner_email}
                        </td>
                        <td>{c.average_check ? money(c.average_check) : "—"}</td>
                        <td>
                          <span className="crm-pill">{c.crm_object}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredCompanies.length === 0 && <p className="admin-empty">Пока нет компаний.</p>}
              </div>
            )}

            {section === "people" && (
              <div className="admin-table-wrap">
                <p className="admin-sync-note">
                  Зеркало CRM · <b>People</b>
                </p>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Имя</th>
                      <th>Email</th>
                      <th>Роль</th>
                      <th>Телефон</th>
                      <th>CRM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPeople.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.display_name || `${p.first_name} ${p.last_name}`}</strong>
                        </td>
                        <td>{p.email}</td>
                        <td>
                          <span className="role-pill">{p.role}</span>
                        </td>
                        <td className="muted">{p.phone || "—"}</td>
                        <td>
                          <span className="crm-pill">{p.crm_object}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPeople.length === 0 && <p className="admin-empty">Пока нет людей.</p>}
              </div>
            )}

            {section === "reservations" && (
              <div className="admin-table-wrap">
                <p className="admin-sync-note">
                  Зеркало CRM · <b>Reservations</b>
                </p>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Когда</th>
                      <th>Ресторан / стол</th>
                      <th>Гость</th>
                      <th>Статус</th>
                      <th>CRM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReservations.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{new Date(r.reserved_for).toLocaleString("ru-RU")}</strong>
                          <div className="muted">
                            {r.source || "WEB"} · {formatTime(r.created_at)}
                          </div>
                        </td>
                        <td>
                          {pickLocale(r.venue_name, "ru")}
                          <div className="muted">
                            Стол №{r.table_number || "—"} · {r.guests} гост.
                          </div>
                        </td>
                        <td className="muted">
                          {r.guest_name}
                          <br />
                          {r.guest_email}
                        </td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td>
                          <span className="crm-pill">{r.crm_object}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredReservations.length === 0 && <p className="admin-empty">Броней пока нет.</p>}
              </div>
            )}

            {section === "orders" && (
              <div className="admin-table-wrap">
                <p className="admin-sync-note">Заказы и оплаты · оплаченное входит в выручку обзора</p>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Заказ</th>
                      <th>Ресторан</th>
                      <th>Гость</th>
                      <th>Сумма</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <strong>#{o.id.slice(0, 8)}</strong>
                          <div className="muted">{new Date(o.created_at).toLocaleString("ru-RU")}</div>
                        </td>
                        <td>{pickLocale(o.venue_name, "ru")}</td>
                        <td className="muted">
                          {o.guest_name}
                          <br />
                          {o.guest_email}
                        </td>
                        <td>
                          <strong>{money(o.total)}</strong>
                          {o.paid && <div className="good-text">оплачено</div>}
                        </td>
                        <td>
                          <StatusBadge status={o.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredOrders.length === 0 && <p className="admin-empty">Заказов пока нет.</p>}
              </div>
            )}

            {section === "changes" && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Заявка</th>
                      <th>Статус</th>
                      <th>Создано</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <code>{c.application_id.slice(0, 8)}</code>
                          {c.note && <div className="muted">{c.note}</div>}
                        </td>
                        <td>
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="muted">{new Date(c.created_at).toLocaleString("ru-RU")}</td>
                        <td>
                          {c.status === "PENDING" && (
                            <div className="admin-row-actions">
                              <button
                                type="button"
                                className="primary"
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    () =>
                                      adminReviewChangeRequest(c.id, "APPROVED").then(() => undefined),
                                    "Изменение одобрено",
                                  )
                                }
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    () =>
                                      adminReviewChangeRequest(c.id, "REJECTED", "Отклонено админом").then(
                                        () => undefined,
                                      ),
                                    "Изменение отклонено",
                                  )
                                }
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {changes.length === 0 && <p className="admin-empty">Нет запросов на изменение.</p>}
              </div>
            )}

            {section === "crm" && (
              <div className="admin-crm-panel">
                <article>
                  <h2>Карта синхронизации</h2>
                  <ul>
                    <li>
                      <b>People</b> ← гости / владельцы / staff
                    </li>
                    <li>
                      <b>Companies</b> ← заявки и опубликованные рестораны
                    </li>
                    <li>
                      <b>Reservations</b> ← бронирования
                    </li>
                  </ul>
                  <p className="muted">
                    Админка показывает те же объекты, что уходят в Twenty. Reconcile и webhook держат стороны синхронно.
                  </p>
                </article>
                <article>
                  <h2>Соединение</h2>
                  <dl className="admin-kv">
                    <div>
                      <dt>Включено</dt>
                      <dd>{crm?.enabled ? "да" : "нет"}</dd>
                    </div>
                    <div>
                      <dt>Healthy</dt>
                      <dd className={crm?.healthy ? "good" : "bad"}>{String(crm?.healthy)}</dd>
                    </div>
                    {crm?.last_success_at && (
                      <div>
                        <dt>Последний успех</dt>
                        <dd>{new Date(crm.last_success_at).toLocaleString("ru-RU")}</dd>
                      </div>
                    )}
                  </dl>
                  {crm?.last_error && <p className="bad-text">{crm.last_error}</p>}
                  <div className="admin-crm-actions">
                    <a
                      className="admin-btn"
                      href={crm?.crm_url || "http://crm.localhost/"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Twenty CRM
                    </a>
                    <button
                      type="button"
                      className="admin-btn secondary"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await adminReconcileCRM();
                          setCrm(await adminCRMStatus());
                        }, "CRM reconcile выполнен")
                      }
                    >
                      Запустить reconcile
                    </button>
                  </div>
                </article>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
