"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/components/locale-provider";
import {
  addVenuePresetRoles,
  ApiError,
  createVenueRole,
  deleteVenueRole,
  updateVenueRole,
  type StaffMember,
  type VenueRole,
} from "@/lib/api";
import { getSiteCopy } from "@/lib/site-copy";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { SelectMenu } from "@/components/ui/select-menu";
import {
  deleteState,
  nextRoleColor,
  ROLE_COLORS,
  ROLE_NAME_MAX,
  roleLabel,
  sortRoles,
  validRoleName,
} from "@/lib/venue-roles";

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/** Small coloured role tag used in team lists, the planner and shift cards. */
export function RoleBadge({ label, color, className = "" }: { label: string; color?: string; className?: string }) {
  return (
    <span className={`cabinet-role-badge ${className}`} style={{ "--role-color": color || "#64748b" } as CSSProperties}>
      <span className="cabinet-role-badge-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

type Props = {
  venueId: string;
  roles: VenueRole[];
  staff: StaffMember[];
  venueType: string;
  suggested: string[];
  /** Reload roles and team after a change (deleting with reassignment moves members). */
  onChanged: () => Promise<void>;
};

type Editor = { mode: "create" } | { mode: "edit"; role: VenueRole };

/** "Команда и роли": the venue's roles, custom ones, schedule flag, colours and order. */
export function CabinetRolesCard({ venueId, roles, staff, venueType, suggested, onChanged }: Props) {
  const { locale } = useLocale();
  const site = getSiteCopy(locale);
  const copy = site.cabinet.roles;
  const presetNames = copy.presets as Record<string, string>;
  const typeNames = site.discover.chips as Record<string, string>;

  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(ROLE_COLORS[0]);
  const [inSchedule, setInSchedule] = useState(true);
  const [deleting, setDeleting] = useState<VenueRole | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const editorRef = useRef<HTMLElement>(null);
  const deleteRef = useRef<HTMLElement>(null);
  useDialogFocus(!!editor, editorRef, () => setEditor(null));
  useDialogFocus(!!deleting, deleteRef, () => setDeleting(null));

  useEffect(() => {
    if (!editor && !deleting) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [editor, deleting]);

  const ordered = useMemo(() => sortRoles(roles), [roles]);
  const memberCount = (key: string) => staff.filter((m) => m.role === key).length;
  const nameError = editor ? validRoleName(name, roles, presetNames, editor.mode === "edit" ? editor.role.id : undefined) : null;
  // A preset role may go back to its translated name with an empty field.
  const canClearName = editor?.mode === "edit" && editor.role.is_system && Boolean(presetNames[editor.role.key]);
  const nameBlocking = nameError && !(nameError === "empty" && canClearName);

  function openCreate() {
    setEditor({ mode: "create" });
    setName("");
    setColor(nextRoleColor(roles));
    setInSchedule(true);
  }

  function openEdit(role: VenueRole) {
    setEditor({ mode: "edit", role });
    setName(role.name || presetNames[role.key] || role.key);
    setColor(role.color || ROLE_COLORS[0]);
    setInSchedule(role.in_schedule);
  }

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await onChanged();
      setMessage({ kind: "success", text: ok });
      return true;
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      setMessage({ kind: "error", text: code === "role_exists" ? copy.errTaken : copy.errFailed });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveEditor() {
    if (!editor || nameBlocking) return;
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (editor.mode === "create") {
      if (await run(() => createVenueRole(venueId, { name: trimmed, color, in_schedule: inSchedule }), copy.created)) setEditor(null);
      return;
    }
    const role = editor.role;
    // Keep a preset role on its translated name unless the owner typed another one.
    const presetName = presetNames[role.key];
    const nextName = role.is_system && presetName && (trimmed === presetName || !trimmed) ? "" : trimmed;
    if (await run(() => updateVenueRole(venueId, role.id, { name: nextName, color, in_schedule: inSchedule }), copy.saved)) setEditor(null);
  }

  async function move(role: VenueRole, delta: -1 | 1) {
    const list = [...ordered];
    const from = list.findIndex((r) => r.id === role.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    await run(
      () => Promise.all(list.map((r, i) => (r.position === i ? null : updateVenueRole(venueId, r.id, { position: i })))),
      copy.saved,
    );
  }

  function openDelete(role: VenueRole) {
    setDeleting(role);
    setReassignTo(ordered.find((r) => r.id !== role.id && r.in_schedule)?.key ?? ordered.find((r) => r.id !== role.id)?.key ?? "");
  }

  const deletingState = deleting ? deleteState(deleting, staff) : null;

  return (
    <section className="owner-card cabinet-ops-card cabinet-roles-card" aria-labelledby="cabinet-roles-title">
      <div className="owner-card-head cabinet-roles-head">
        <div>
          <span className="owner-kicker">
            {venueType ? typeNames[venueType] ?? venueType : copy.typeNotSet} · {fill(copy.rolesCount, { count: roles.length })}
          </span>
          <h3 id="cabinet-roles-title">{copy.title}</h3>
          <p className="cabinet-ops-sub">{copy.subtitle}</p>
        </div>
        <button type="button" className="panel-btn" onClick={openCreate} disabled={busy}>
          + {copy.addRole}
        </button>
      </div>

      {message && (
        <div className={`owner-notice ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
          <span aria-hidden="true">{message.kind === "error" ? "!" : "✓"}</span>
          <p>{message.text}</p>
        </div>
      )}

      {suggested.length > 0 && (
        <div className="cabinet-roles-suggest" role="note">
          <div>
            <strong>{fill(copy.suggestedTitle, { type: typeNames[venueType] ?? venueType })}</strong>
            <p>{fill(copy.suggestedBody, { roles: suggested.map((k) => presetNames[k] ?? k).join(", ") })}</p>
          </div>
          <button
            type="button"
            className="panel-btn ghost sm"
            disabled={busy}
            onClick={() => void run(() => addVenuePresetRoles(venueId, suggested), copy.suggestedAdded)}
          >
            {copy.suggestedAdd}
          </button>
        </div>
      )}

      <ul className="cabinet-roles-list">
        {ordered.map((role, index) => {
          const label = roleLabel(role, presetNames);
          const count = memberCount(role.key);
          return (
            <li key={role.id} className="cabinet-role-row" style={{ "--role-color": role.color || "#64748b" } as CSSProperties}>
              <span className="cabinet-role-swatch" aria-hidden="true" />
              <div className="cabinet-role-info">
                <div className="cabinet-role-name-row">
                  <strong>{label}</strong>
                  <span className={`cabinet-role-kind ${role.is_system ? "system" : "custom"}`}>
                    {role.is_system ? copy.system : copy.custom}
                  </span>
                  {!role.in_schedule && <span className="cabinet-role-kind off">{copy.notInSchedule}</span>}
                </div>
                <small>{fill(copy.membersCount, { count })}</small>
              </div>
              <div className="cabinet-role-actions">
                <label className="cabinet-role-switch" title={copy.inScheduleHint}>
                  <input
                    type="checkbox"
                    checked={role.in_schedule}
                    disabled={busy}
                    onChange={(e) =>
                      void run(() => updateVenueRole(venueId, role.id, { in_schedule: e.target.checked }), copy.saved)
                    }
                  />
                  <span className="cabinet-role-switch-track" aria-hidden="true" />
                  <span className="cabinet-role-switch-label">{copy.inSchedule}</span>
                </label>
                <div className="cabinet-role-buttons">
                  <button
                    type="button"
                    className="panel-btn ghost sm icon"
                    aria-label={`${copy.moveUp}: ${label}`}
                    title={copy.moveUp}
                    disabled={busy || index === 0}
                    onClick={() => void move(role, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="panel-btn ghost sm icon"
                    aria-label={`${copy.moveDown}: ${label}`}
                    title={copy.moveDown}
                    disabled={busy || index === ordered.length - 1}
                    onClick={() => void move(role, 1)}
                  >
                    ↓
                  </button>
                  <button type="button" className="panel-btn ghost sm" disabled={busy} onClick={() => openEdit(role)}>
                    {copy.edit}
                  </button>
                  <button
                    type="button"
                    className="panel-btn ghost sm danger"
                    disabled={busy || role.is_system}
                    title={role.is_system ? copy.systemLocked : copy.delete}
                    onClick={() => openDelete(role)}
                  >
                    {copy.delete}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {editor &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="booking-popup-root cabinet-delete-modal-root" role="presentation">
            <button type="button" className="booking-popup-backdrop" aria-label={copy.cancel} onClick={() => setEditor(null)} />
            <section
              ref={editorRef}
              className="booking-popup cabinet-delete-dialog cabinet-role-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cabinet-role-editor-title"
            >
              <form
                className="booking-popup-card cabinet-role-editor"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveEditor();
                }}
              >
                <button type="button" className="booking-popup-x" onClick={() => setEditor(null)} aria-label={copy.cancel}>
                  ×
                </button>
                <h3 id="cabinet-role-editor-title">
                  {editor.mode === "create" ? copy.addRole : roleLabel(editor.role, presetNames)}
                </h3>
                <div className="field">
                  <label htmlFor="cabinet-role-name">{copy.nameLabel}</label>
                  <input
                    id="cabinet-role-name"
                    className="cabinet-staff-input"
                    value={name}
                    maxLength={ROLE_NAME_MAX + 10}
                    placeholder={copy.namePlaceholder}
                    onChange={(e) => setName(e.target.value)}
                    aria-invalid={Boolean(nameBlocking)}
                    aria-describedby="cabinet-role-name-error"
                    data-autofocus
                  />
                  <small id="cabinet-role-name-error" className="cabinet-role-error" aria-live="polite">
                    {nameBlocking && name.length > 0
                      ? nameError === "too_long"
                        ? copy.errTooLong
                        : nameError === "taken"
                        ? copy.errTaken
                        : copy.errEmpty
                      : ""}
                  </small>
                  {canClearName && editor.mode === "edit" && editor.role.name && (
                    <button
                      type="button"
                      className="cabinet-role-link"
                      onClick={() => setName(presetNames[editor.role.key] ?? "")}
                    >
                      {copy.restoreName}
                    </button>
                  )}
                </div>
                <fieldset className="cabinet-role-colors">
                  <legend>{copy.colorLabel}</legend>
                  {ROLE_COLORS.map((c) => (
                    <label key={c} className="cabinet-role-color" style={{ "--role-color": c } as CSSProperties}>
                      <input
                        type="radio"
                        name="cabinet-role-color"
                        value={c}
                        aria-label={c}
                        checked={color === c}
                        onChange={() => setColor(c)}
                      />
                      <span aria-hidden="true" />
                    </label>
                  ))}
                </fieldset>
                <label className="cabinet-role-switch block">
                  <input type="checkbox" checked={inSchedule} onChange={(e) => setInSchedule(e.target.checked)} />
                  <span className="cabinet-role-switch-track" aria-hidden="true" />
                  <span className="cabinet-role-switch-label">
                    {copy.inSchedule}
                    <small>{copy.inScheduleHint}</small>
                  </span>
                </label>
                <div className="cabinet-delete-actions">
                  <button type="submit" className="panel-btn" disabled={busy || Boolean(nameBlocking)}>
                    {editor.mode === "create" ? copy.create : copy.save}
                  </button>
                  <button type="button" className="panel-btn ghost" disabled={busy} onClick={() => setEditor(null)}>
                    {copy.cancel}
                  </button>
                </div>
              </form>
            </section>
          </div>,
          document.body,
        )}

      {deleting &&
        deletingState &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="booking-popup-root cabinet-delete-modal-root" role="presentation">
            <button type="button" className="booking-popup-backdrop" aria-label={copy.cancel} onClick={() => setDeleting(null)} />
            <section
              ref={deleteRef}
              className="booking-popup cabinet-delete-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cabinet-role-delete-title"
            >
              <div className="booking-popup-card cabinet-delete-card">
                <button type="button" className="booking-popup-x" onClick={() => setDeleting(null)} aria-label={copy.cancel}>
                  ×
                </button>
                <div className="cabinet-delete-icon" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </div>
                <h3 id="cabinet-role-delete-title">{fill(copy.deleteTitle, { name: roleLabel(deleting, presetNames) })}</h3>
                <p className="cabinet-delete-text">
                  {deletingState.blocked === "in_use" ? fill(copy.deleteInUse, { count: deletingState.members }) : copy.deleteBody}
                </p>
                {deletingState.blocked === "in_use" && (
                  <div className="field cabinet-role-reassign">
                    <label htmlFor="cabinet-role-reassign">{copy.reassignLabel}</label>
                    <SelectMenu
                      id="cabinet-role-reassign"
                      value={reassignTo}
                      onChange={setReassignTo}
                      options={ordered
                        .filter((r) => r.id !== deleting.id)
                        .map((r) => ({
                          value: r.key,
                          label: roleLabel(r, presetNames),
                          color: r.color || "#64748b",
                        }))}
                    />
                  </div>
                )}
                <div className="cabinet-delete-actions">
                  <button
                    type="button"
                    className="panel-btn danger"
                    disabled={busy || (deletingState.blocked === "in_use" && !reassignTo)}
                    onClick={() => {
                      const target = deleting;
                      void run(
                        () => deleteVenueRole(venueId, target.id, deletingState.blocked === "in_use" ? reassignTo : undefined),
                        copy.deleted,
                      ).then((ok) => ok && setDeleting(null));
                    }}
                  >
                    {copy.deleteConfirm}
                  </button>
                  <button type="button" className="panel-btn ghost" data-autofocus disabled={busy} onClick={() => setDeleting(null)}>
                    {copy.cancel}
                  </button>
                </div>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </section>
  );
}
