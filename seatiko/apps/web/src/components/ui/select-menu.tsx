"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type SelectMenuOption = {
  value: string;
  label: string;
  color?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export type SelectMenuProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectMenuOption[];
  placeholder?: string;
  disabled?: boolean;
  size?: "default" | "compact";
  fullWidth?: boolean;
  align?: "start" | "end";
  id?: string;
  name?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
};

type MenuCoords = {
  top?: number;
  bottom?: number;
  left: number;
  minWidth: number;
  maxWidth: number;
  maxHeight: number;
  placement: "bottom" | "top";
};

function findFirstEnabled(options: SelectMenuOption[]): number {
  return options.findIndex((opt) => !opt.disabled);
}

function findLastEnabled(options: SelectMenuOption[]): number {
  for (let i = options.length - 1; i >= 0; i -= 1) {
    if (!options[i].disabled) return i;
  }
  return -1;
}

function findNextEnabled(
  options: SelectMenuOption[],
  from: number,
  delta: 1 | -1,
): number {
  if (options.length === 0) return -1;
  let idx = from;
  for (let step = 0; step < options.length; step += 1) {
    idx = (idx + delta + options.length) % options.length;
    if (!options[idx].disabled) return idx;
  }
  return -1;
}

function findTypeAheadMatch(
  options: SelectMenuOption[],
  query: string,
  from: number,
): number {
  const needle = query.toLowerCase();
  if (!needle) return -1;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const idx = (from + offset + options.length) % options.length;
    const opt = options[idx];
    if (!opt.disabled && opt.label.trim().toLowerCase().startsWith(needle)) {
      return idx;
    }
  }
  return -1;
}

export function computePopoverCoords(
  triggerRect: Pick<DOMRect, "top" | "bottom" | "left" | "right" | "width">,
  viewport: { width: number; height: number },
  measuredMenu: { width: number; height: number },
  align: "start" | "end",
): MenuCoords {
  const margin = 8;
  const gap = 6;
  const maxMenuCap = 280;
  const spaceBelow = Math.max(0, viewport.height - triggerRect.bottom - margin - gap);
  const spaceAbove = Math.max(0, triggerRect.top - margin - gap);
  const desiredHeight = Math.min(measuredMenu.height || maxMenuCap, maxMenuCap);
  const placement: "bottom" | "top" =
    spaceBelow < desiredHeight && spaceAbove > spaceBelow ? "top" : "bottom";

  const availableVertical = placement === "top" ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(110, Math.min(maxMenuCap, availableVertical));

  const maxWidth = Math.max(140, viewport.width - margin * 2);
  const minWidth = Math.min(Math.max(triggerRect.width, 160), maxWidth);
  const estimatedWidth = Math.min(
    Math.max(minWidth, measuredMenu.width || minWidth),
    maxWidth,
  );

  const rawLeft =
    align === "end" ? triggerRect.right - estimatedWidth : triggerRect.left;
  const left = Math.max(
    margin,
    Math.min(rawLeft, viewport.width - estimatedWidth - margin),
  );

  if (placement === "top") {
    return {
      bottom: Math.max(margin, viewport.height - triggerRect.top + gap),
      left,
      minWidth,
      maxWidth,
      maxHeight,
      placement,
    };
  }

  return {
    top: Math.min(viewport.height - margin - maxHeight, triggerRect.bottom + gap),
    left,
    minWidth,
    maxWidth,
    maxHeight,
    placement,
  };
}

function ChevronDownIcon() {
  return (
    <svg
      className="select-menu-chevron"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckMarkIcon() {
  return (
    <svg
      className="select-menu-check"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function SelectMenu({
  value,
  onChange,
  options,
  placeholder = "",
  disabled = false,
  size = "default",
  fullWidth = true,
  align = "start",
  id,
  name,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  className = "",
  buttonClassName = "",
  menuClassName = "",
}: SelectMenuProps) {
  const generatedId = useId();
  const listboxId = `${generatedId}-listbox`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const typeAheadRef = useRef<{ buffer: string; timer: ReturnType<typeof setTimeout> | null }>({
    buffer: "",
    timer: null,
  });

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [coords, setCoords] = useState<MenuCoords | null>(null);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) ?? null,
    [options, value],
  );
  const isPlaceholder = !selectedOption || (selectedOption.value === "" && Boolean(placeholder));
  const displayLabel = selectedOption?.label ?? (placeholder || value);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuEl = listRef.current;
    const measured = {
      width: menuEl ? menuEl.offsetWidth : 0,
      height: menuEl ? menuEl.scrollHeight : 0,
    };
    setCoords(
      computePopoverCoords(
        rect,
        { width: window.innerWidth, height: window.innerHeight },
        measured,
        align,
      ),
    );
  }, [align]);

  const closeMenu = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setCoords(null);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const openMenu = useCallback(
    (initialIndex?: number) => {
      if (disabled || options.length === 0) return;
      const selectedIdx = options.findIndex((opt) => opt.value === value && !opt.disabled);
      const fallbackIdx = findFirstEnabled(options);
      const target =
        initialIndex !== undefined && initialIndex >= 0 && !options[initialIndex]?.disabled
          ? initialIndex
          : selectedIdx >= 0
            ? selectedIdx
            : fallbackIdx;
      setActiveIndex(target);
      setOpen(true);
    },
    [disabled, options, value],
  );

  const selectOption = useCallback(
    (opt: SelectMenuOption) => {
      if (opt.disabled) return;
      if (opt.value !== value) {
        onChange(opt.value);
      }
      closeMenu(true);
    },
    [closeMenu, onChange, value],
  );

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = requestAnimationFrame(() => updatePosition());
    return () => cancelAnimationFrame(frame);
  }, [open, options.length, updatePosition]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus({ preventScroll: true });
    if (activeIndex >= 0) {
      const optionEl = listRef.current?.children[activeIndex] as HTMLElement | undefined;
      optionEl?.scrollIntoView?.({ block: "nearest" });
    }
    // Only run initial focus on open transition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const optionEl = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    optionEl?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !rootRef.current?.contains(target) &&
        !listRef.current?.contains(target)
      ) {
        closeMenu(false);
      }
    };

    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
        return;
      }
      if (event.key === "Tab") {
        // Restore focus to trigger first so Tab proceeds from the control naturally.
        setOpen(false);
        setCoords(null);
        triggerRef.current?.focus();
      }
    };

    const onReposition = () => updatePosition();

    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onWindowKeyDown, true);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onWindowKeyDown, true);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, closeMenu, updatePosition]);

  useEffect(() => {
    const ta = typeAheadRef.current;
    return () => {
      if (ta.timer) clearTimeout(ta.timer);
    };
  }, []);

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openMenu();
      else setActiveIndex((idx) => findNextEnabled(options, idx, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        const selectedIdx = options.findIndex((opt) => opt.value === value && !opt.disabled);
        openMenu(selectedIdx >= 0 ? selectedIdx : findLastEnabled(options));
      } else {
        setActiveIndex((idx) => findNextEnabled(options, idx, -1));
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      openMenu(findFirstEnabled(options));
    } else if (event.key === "End") {
      event.preventDefault();
      openMenu(findLastEnabled(options));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) closeMenu(true);
      else openMenu();
    }
  };

  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((idx) => findNextEnabled(options, idx < 0 ? -1 : idx, 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((idx) =>
        findNextEnabled(options, idx < 0 ? 0 : idx, -1),
      );
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(findFirstEnabled(options));
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(findLastEnabled(options));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const opt = activeIndex >= 0 ? options[activeIndex] : undefined;
      if (opt && !opt.disabled) selectOption(opt);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const ta = typeAheadRef.current;
      if (ta.timer) clearTimeout(ta.timer);
      ta.buffer += event.key;
      ta.timer = setTimeout(() => {
        ta.buffer = "";
      }, 500);
      const match = findTypeAheadMatch(options, ta.buffer, activeIndex);
      if (match >= 0) setActiveIndex(match);
    }
  };

  const activeOptionId =
    open && activeIndex >= 0 ? `${generatedId}-opt-${activeIndex}` : undefined;

  const popoverStyle: CSSProperties = coords
    ? {
        position: "fixed",
        top: coords.top !== undefined ? `${coords.top}px` : undefined,
        bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
        left: `${coords.left}px`,
        minWidth: `${coords.minWidth}px`,
        maxWidth: `${coords.maxWidth}px`,
        maxHeight: `${coords.maxHeight}px`,
      }
    : {
        position: "fixed",
        visibility: "hidden",
        top: 0,
        left: 0,
      };

  return (
    <div
      ref={rootRef}
      className={`select-menu${fullWidth ? " is-full" : ""}${size === "compact" ? " is-compact" : ""}${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
    >
      {name ? (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      ) : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`select-menu-trigger${isPlaceholder ? " is-placeholder" : ""}${buttonClassName ? ` ${buttonClassName}` : ""}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        onClick={() => {
          if (open) closeMenu(true);
          else openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="select-menu-value-wrap">
          {selectedOption?.color ? (
            <span
              className="select-menu-dot"
              style={{ "--select-dot-color": selectedOption.color } as CSSProperties}
              aria-hidden="true"
            />
          ) : selectedOption?.icon ? (
            <span className="select-menu-icon" aria-hidden="true">
              {selectedOption.icon}
            </span>
          ) : null}
          <span className="select-menu-value">{displayLabel}</span>
        </span>
        <ChevronDownIcon />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              tabIndex={-1}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              aria-activedescendant={activeOptionId}
              className={`select-menu-popover${coords?.placement === "top" ? " is-top" : ""}${menuClassName ? ` ${menuClassName}` : ""}`}
              style={popoverStyle}
              onKeyDown={handleListKeyDown}
            >
              {options.map((opt, index) => {
                const selected = opt.value === value;
                const active = index === activeIndex;
                return (
                  <li
                    key={`${opt.value}-${index}`}
                    id={`${generatedId}-opt-${index}`}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={opt.disabled || undefined}
                    className={`select-menu-option${selected ? " is-selected" : ""}${active ? " is-active" : ""}${opt.disabled ? " is-disabled" : ""}`}
                    onMouseEnter={() => {
                      if (!opt.disabled) setActiveIndex(index);
                    }}
                    onMouseDown={(event) => {
                      // Prevent trigger blur/focus flicker before click completes
                      event.preventDefault();
                    }}
                    onClick={() => selectOption(opt)}
                  >
                    <span className="select-menu-option-main">
                      {opt.color ? (
                        <span
                          className="select-menu-dot"
                          style={{ "--select-dot-color": opt.color } as CSSProperties}
                          aria-hidden="true"
                        />
                      ) : opt.icon ? (
                        <span className="select-menu-icon" aria-hidden="true">
                          {opt.icon}
                        </span>
                      ) : null}
                      <span className="select-menu-option-label">{opt.label}</span>
                    </span>
                    {selected ? <CheckMarkIcon /> : null}
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
