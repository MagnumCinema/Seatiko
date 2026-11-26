"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useLocale, type Locale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import {
  Button,
  ButtonLink,
  IconButton,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui/button";
import {
  HeartIcon,
  MapPinIcon,
  MenuBookIcon,
  SearchIcon,
  SparklesIcon,
} from "@/components/venue-icons";
import "./dev-buttons.css";

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

type CopyPack = {
  kicker: string;
  title: string;
  subtitle: string;
  themeLabel: string;
  dark: string;
  light: string;
  forceLoadingOn: string;
  forceLoadingOff: string;
  sectionVariants: string;
  sectionVariantsDesc: string;
  sectionSizes: string;
  sectionSizesDesc: string;
  sectionSurfaces: string;
  sectionSurfacesDesc: string;
  sectionPrimitives: string;
  sectionPrimitivesDesc: string;
  sectionRules: string;
  sectionRulesDesc: string;
  normalSurfaceTitle: string;
  darkSurfaceTitle: string;
  states: { default: string; loading: string; disabled: string };
  sizeNames: Record<ButtonSize, string>;
  labels: {
    primary: string;
    shimmer: string;
    secondary: string;
    ghost: string;
    link: string;
    dangerOutline: string;
    dangerSolid: string;
    bookTable: string;
    openMap: string;
    keepBooking: string;
    confirmCancel: string;
    cancelPrompt: string;
    iconSearch: string;
    iconFav: string;
    iconClose: string;
    iconDelete: string;
    iconAdd: string;
  };
  whenToUse: Record<ButtonVariant, string>;
  chips: string[];
  segViews: string[];
  phoneStackTitle: string;
  localeProofTitle: string;
};

const COPY: Record<Locale, CopyPack> = {
  ru: {
    kicker: "UI System · Предпросмотр /dev/buttons",
    title: "Единая система кнопок Seatiko",
    subtitle:
      "6 семантических вариантов, 3 размера и отдельные примитивы для чипов и сегментных переключателей. Нажмите на любую кнопку «Обычная», чтобы проверить спиннер без скачка ширины.",
    themeLabel: "Тема",
    dark: "Тёмная",
    light: "Светлая",
    forceLoadingOn: "Показать загрузку",
    forceLoadingOff: "Обычный вид",
    sectionVariants: "1. Варианты и состояния",
    sectionVariantsDesc:
      "Нажмите на кнопку в первом столбце — она перейдёт в загрузку на 1,5 сек без сдвига соседних элементов.",
    sectionSizes: "2. Размеры (sm / md / lg) и кнопки-иконки",
    sectionSizesDesc:
      "sm (36px, 44px на touch), md (44px по умолчанию), lg (52px для hero и ключевых экранов).",
    sectionSurfaces: "3. Обычная поверхность vs всегда тёмная поверхность",
    sectionSurfacesDesc:
      "В светлой теме основной цвет — глубокий изумруд; внутри тёмных секций (hero, баннер владельца) кнопки остаются золотыми.",
    sectionPrimitives: "4. Чипы фильтров и сегментные переключатели",
    sectionPrimitivesDesc:
      "Отдельные примитивы .chip и .seg / .seg-item, чтобы фильтры и вкладки не смешивались с кнопками действий.",
    sectionRules: "5. Паттерн удаления, перенос на телефонах и проверка в одну строку (RU / EN / RO)",
    sectionRulesDesc:
      "Двухшаговое подтверждение, стек на экранах ≤540px и длинные подписи без переноса текста внутри кнопки.",
    normalSurfaceTitle: "Обычная карточка (следует теме сайта)",
    darkSurfaceTitle: "Всегда тёмная секция ([data-surface=\"dark\"])",
    states: { default: "Обычная (клик)", loading: "Загрузка", disabled: "Отключена" },
    sizeNames: { sm: "sm · 36px", md: "md · 44px", lg: "lg · 52px" },
    labels: {
      primary: "Подтвердить бронь",
      shimmer: "Подключить ресторан",
      secondary: "Показать на карте",
      ghost: "Отмена",
      link: "Перейти к моей брони",
      dangerOutline: "Отменить бронь",
      dangerSolid: "Да, отменить",
      bookTable: "Забронировать этот стол",
      openMap: "К карте",
      keepBooking: "Нет, оставить",
      confirmCancel: "Да, отменить",
      cancelPrompt: "Вы уверены, что хотите отменить бронирование? Это действие нельзя отменить.",
      iconSearch: "Поиск заведений",
      iconFav: "Добавить в избранное",
      iconClose: "Закрыть",
      iconDelete: "Удалить заведение",
      iconAdd: "Добавить ресторан",
    },
    whenToUse: {
      primary: "Главное действие на экране, форме или карточке. Не больше одной на блок.",
      secondary: "Равноценная альтернатива или парное действие рядом с основной кнопкой.",
      ghost: "Второстепенное тихое действие: «Отмена», «Назад», закрытие, панель инструментов.",
      link: "Встроенный текстовый переход без рамки и фона.",
      "danger-outline": "Начальный триггер опасного действия: открывает диалог или полосу подтверждения.",
      danger: "Финальное подтверждение удаления/отмены — только внутри окна или шага подтверждения.",
    },
    chips: ["Терраса", "Вегетарианское", "Свободные столы", "Живая музыка"],
    segViews: ["Плитка", "Список", "На карте"],
    phoneStackTitle: "Адаптивный стек (.btn-group--mobile-stack на ≤540px)",
    localeProofTitle: "Проверка в одну строку (white-space: nowrap) во всех языках",
  },
  en: {
    kicker: "UI System · Preview /dev/buttons",
    title: "Seatiko Unified Button System",
    subtitle:
      "6 semantic variants, 3 sizes, and dedicated primitives for filter chips and segmented controls. Click any Default button to verify width-preserving loading.",
    themeLabel: "Theme",
    dark: "Dark",
    light: "Light",
    forceLoadingOn: "Preview loading",
    forceLoadingOff: "Default state",
    sectionVariants: "1. Variants & States",
    sectionVariantsDesc:
      "Click any button in the Default column to trigger a 1.5s spinner with zero horizontal layout shift.",
    sectionSizes: "2. Sizes (sm / md / lg) & Icon Buttons",
    sectionSizesDesc:
      "sm (36px visual, 44px on coarse pointers), md (44px default), lg (52px hero & primary flows).",
    sectionSurfaces: "3. Normal Surface vs Always-Dark Showcase Surface",
    sectionSurfacesDesc:
      "In Light mode, Primary switches to deep emerald on normal cards while staying matte gold inside [data-surface=\"dark\"] bands.",
    sectionPrimitives: "4. Filter Chips & Segmented Switchers",
    sectionPrimitivesDesc:
      "Separate .chip and .seg primitives so toggles never collide with action button rules.",
    sectionRules: "5. Destructive Pattern, Phone Stack & One-Line Proof (RU / EN / RO)",
    sectionRulesDesc:
      "Two-step delete confirmation, ≤540px full-width stacking, and long labels staying strictly single-line.",
    normalSurfaceTitle: "Normal surface (follows active theme)",
    darkSurfaceTitle: "Always-dark surface ([data-surface=\"dark\"])",
    states: { default: "Default (click)", loading: "Loading", disabled: "Disabled" },
    sizeNames: { sm: "sm · 36px", md: "md · 44px", lg: "lg · 52px" },
    labels: {
      primary: "Confirm booking",
      shimmer: "Connect restaurant",
      secondary: "Back to map",
      ghost: "Cancel",
      link: "Go to my booking",
      dangerOutline: "Cancel booking",
      dangerSolid: "Yes, cancel",
      bookTable: "Book this table",
      openMap: "Menu",
      keepBooking: "No, keep it",
      confirmCancel: "Yes, cancel",
      cancelPrompt: "Are you sure you want to cancel this reservation? This cannot be undone.",
      iconSearch: "Search venues",
      iconFav: "Add to favorites",
      iconClose: "Close",
      iconDelete: "Delete venue",
      iconAdd: "Add restaurant",
    },
    whenToUse: {
      primary: "The single main commitment action per view, card, or form. Max one per group.",
      secondary: "Equal or paired alternative beside a primary CTA, or outlined utility trigger.",
      ghost: "Low-emphasis Cancel, Back, Skip, or calm toolbar actions.",
      link: "Inline navigation or subtle utility action with zero box chrome.",
      "danger-outline": "Initial trigger for destructive actions; opens the confirmation step.",
      danger: "Final destructive confirmation only — paired beside Ghost Cancel inside confirm dialogs.",
    },
    chips: ["Terrace", "Vegetarian", "Free tables", "Live music"],
    segViews: ["Grid", "List", "Map"],
    phoneStackTitle: "Phone full-width stack (.btn-group--mobile-stack at ≤540px)",
    localeProofTitle: "Single-line proof (white-space: nowrap) across RU / EN / RO",
  },
  ro: {
    kicker: "Sistem UI · Previzualizare /dev/buttons",
    title: "Sistemul unificat de butoane Seatiko",
    subtitle:
      "6 variante semantice, 3 dimensiuni și primitive separate pentru cipuri și comutatoare. Apăsați orice buton Implicit pentru a testa spinner-ul fără schimbare de lățime.",
    themeLabel: "Temă",
    dark: "Întunecată",
    light: "Luminoasă",
    forceLoadingOn: "Mod încărcare",
    forceLoadingOff: "Mod normal",
    sectionVariants: "1. Variante și stări",
    sectionVariantsDesc:
      "Apăsați orice buton din coloana Implicit pentru a vedea încărcarea de 1,5s fără deplasarea elementelor.",
    sectionSizes: "2. Dimensiuni (sm / md / lg) și butoane cu pictogramă",
    sectionSizesDesc:
      "sm (36px, 44px pe ecrane tactile), md (44px implicit), lg (52px pentru hero și rezervări).",
    sectionSurfaces: "3. Suprafață normală vs suprafață mereu întunecată",
    sectionSurfacesDesc:
      "În tema luminoasă, Primary trece pe smarald adânc; în secțiunile întunecate ([data-surface=\"dark\"]) rămâne auriu mat.",
    sectionPrimitives: "4. Cipuri de filtrare și comutatoare segmentate",
    sectionPrimitivesDesc:
      "Primitive dedicate .chip și .seg / .seg-item, separate de sistemul de butoane de acțiune.",
    sectionRules: "5. Confirmare ștergere, telefon ≤540px și etichete pe un singur rând (RU / EN / RO)",
    sectionRulesDesc:
      "Confirmare în doi pași, lățime completă pe telefon și texte lungi în română fără trecere pe două rânduri.",
    normalSurfaceTitle: "Suprafață normală (urmează tema activă)",
    darkSurfaceTitle: "Suprafață mereu întunecată ([data-surface=\"dark\"])",
    states: { default: "Implicit (click)", loading: "Încărcare", disabled: "Dezactivat" },
    sizeNames: { sm: "sm · 36px", md: "md · 44px", lg: "lg · 52px" },
    labels: {
      primary: "Confirmă rezervarea",
      shimmer: "Conectează restaurantul",
      secondary: "La hartă",
      ghost: "Anulează",
      link: "Mergi la rezervarea mea",
      dangerOutline: "Anulează rezervarea",
      dangerSolid: "Da, anulează",
      bookTable: "Rezervă această masă",
      openMap: "Meniu",
      keepBooking: "Nu, păstrează",
      confirmCancel: "Da, anulează",
      cancelPrompt: "Sigur doriți să anulați această rezervare? Acțiunea este ireversibilă.",
      iconSearch: "Caută localuri",
      iconFav: "Adaugă la favorite",
      iconClose: "Închide",
      iconDelete: "Șterge localul",
      iconAdd: "Adaugă restaurant",
    },
    whenToUse: {
      primary: "Acțiunea principală a ecranului sau formularului. Cel mult una per secțiune.",
      secondary: "Alternativă secundară lângă butonul principal sau acțiune cu contur.",
      ghost: "Acțiune discretă: Anulează, Înapoi, închidere sau bară de instrumente.",
      link: "Legătură inline fără chenar, pentru acțiuni textuale secundare.",
      "danger-outline": "Declanșatorul inițial pentru ștergere sau anulare; deschide confirmarea.",
      danger: "Confirmare distructivă finală — folosită exclusiv în fereastra de confirmare.",
    },
    chips: ["Terasă", "Vegetarian", "Mese libere", "Muzică live"],
    segViews: ["Grilă", "Listă", "Pe hartă"],
    phoneStackTitle: "Lățime completă pe telefon (.btn-group--mobile-stack la ≤540px)",
    localeProofTitle: "Dovadă pe un singur rând (white-space: nowrap) pentru toate limbile",
  },
};

const VARIANT_LIST: ButtonVariant[] = [
  "primary",
  "secondary",
  "ghost",
  "link",
  "danger-outline",
  "danger",
];

const SIZE_LIST: ButtonSize[] = ["sm", "md", "lg"];

const LOCALES: Locale[] = ["ru", "en", "ro"];

export default function DevButtonsPage() {
  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  const copy = COPY[locale];

  const [globalLoading, setGlobalLoading] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState<Record<string, boolean>>({});
  const [selectedChips, setSelectedChips] = useState<number[]>([0, 2]);
  const [viewIndex, setViewIndex] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(true);
  const [favPressed, setFavPressed] = useState(false);

  const pulseLoading = (key: string) => {
    setLoadingKeys((prev) => ({ ...prev, [key]: true }));
    window.setTimeout(() => {
      setLoadingKeys((prev) => ({ ...prev, [key]: false }));
    }, 1500);
  };

  const toggleChip = (idx: number) => {
    setSelectedChips((prev) =>
      prev.includes(idx) ? prev.filter((item) => item !== idx) : [...prev, idx],
    );
  };

  const labelForVariant = (variant: ButtonVariant): string => {
    switch (variant) {
      case "primary":
        return copy.labels.primary;
      case "secondary":
        return copy.labels.secondary;
      case "ghost":
        return copy.labels.ghost;
      case "link":
        return copy.labels.link;
      case "danger-outline":
        return copy.labels.dangerOutline;
      case "danger":
        return copy.labels.dangerSolid;
    }
  };

  return (
    <div className="dev-btns-page">
      <SiteHeader />

      <main className="dev-btns-main">
        <header className="dev-btns-hero">
          <div>
            <p className="dev-btns-kicker">{copy.kicker}</p>
            <h1 className="dev-btns-title">{copy.title}</h1>
            <p className="dev-btns-subtitle">{copy.subtitle}</p>
          </div>

          <div className="dev-btns-toolbar">
            <div className="seg" role="group" aria-label={copy.themeLabel}>
              <button
                type="button"
                className={`seg-item${theme === "dark" ? " is-active" : ""}`}
                aria-pressed={theme === "dark"}
                onClick={() => setTheme("dark")}
              >
                {copy.dark}
              </button>
              <button
                type="button"
                className={`seg-item${theme === "light" ? " is-active" : ""}`}
                aria-pressed={theme === "light"}
                onClick={() => setTheme("light")}
              >
                {copy.light}
              </button>
            </div>

            <div className="seg" role="group" aria-label="Language">
              {LOCALES.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  className={`seg-item${locale === loc ? " is-active" : ""}`}
                  aria-pressed={locale === loc}
                  onClick={() => setLocale(loc)}
                >
                  {loc.toUpperCase()}
                </button>
              ))}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setGlobalLoading((v) => !v)}
              aria-pressed={globalLoading}
            >
              {globalLoading ? copy.forceLoadingOff : copy.forceLoadingOn}
            </Button>
          </div>
        </header>

        {/* 1. Variants × States */}
        <section className="dev-btns-section">
          <div className="dev-btns-section-head">
            <h2>{copy.sectionVariants}</h2>
            <p className="dev-btns-section-desc">{copy.sectionVariantsDesc}</p>
          </div>

          <div className="dev-btns-rows">
            {VARIANT_LIST.map((variant) => {
              const label = labelForVariant(variant);
              const loadKey = `v-${variant}`;
              const isLoading = globalLoading || Boolean(loadingKeys[loadKey]);
              return (
                <div className="dev-btns-row" key={variant}>
                  <div className="dev-btns-row-meta">
                    <code>{`.btn--${variant}`}</code>
                    <p className="dev-btns-row-caption">{copy.whenToUse[variant]}</p>
                  </div>
                  <div className="dev-btns-states">
                    <div className="dev-btns-cell">
                      <span className="dev-btns-cell-label">{copy.states.default}</span>
                      <Button
                        variant={variant}
                        loading={isLoading}
                        onClick={() => pulseLoading(loadKey)}
                      >
                        {label}
                      </Button>
                    </div>
                    <div className="dev-btns-cell">
                      <span className="dev-btns-cell-label">{copy.states.loading}</span>
                      <Button variant={variant} loading>
                        {label}
                      </Button>
                    </div>
                    <div className="dev-btns-cell">
                      <span className="dev-btns-cell-label">{copy.states.disabled}</span>
                      <Button variant={variant} disabled>
                        {label}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Shimmer Primary Showcase */}
            <div className="dev-btns-row">
              <div className="dev-btns-row-meta">
                <code>.btn--primary.btn--shimmer</code>
                <p className="dev-btns-row-caption">{copy.whenToUse.primary}</p>
              </div>
              <div className="dev-btns-states">
                <div className="dev-btns-cell">
                  <span className="dev-btns-cell-label">{copy.states.default}</span>
                  <Button
                    variant="primary"
                    size="lg"
                    shimmer
                    leftIcon={<SparklesIcon />}
                    loading={globalLoading}
                  >
                    {copy.labels.shimmer}
                  </Button>
                </div>
                <div className="dev-btns-cell">
                  <span className="dev-btns-cell-label">{"<ButtonLink />"}</span>
                  <ButtonLink
                    href="/venues"
                    variant="primary"
                    size="md"
                    rightIcon={<MapPinIcon />}
                    loading={globalLoading}
                  >
                    {copy.labels.bookTable}
                  </ButtonLink>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Sizes × Variants & IconButtons */}
        <section className="dev-btns-section">
          <div className="dev-btns-section-head">
            <h2>{copy.sectionSizes}</h2>
            <p className="dev-btns-section-desc">{copy.sectionSizesDesc}</p>
          </div>

          <div className="dev-btns-rows">
            {SIZE_LIST.map((size) => (
              <div className="dev-btns-row" key={size}>
                <div className="dev-btns-row-meta">
                  <code>{`.btn--${size}`}</code>
                  <p className="dev-btns-row-caption">{copy.sizeNames[size]}</p>
                </div>
                <div className="dev-btns-states">
                  <Button variant="primary" size={size} leftIcon={<SearchIcon />} loading={globalLoading}>
                    {copy.labels.primary}
                  </Button>
                  <Button variant="secondary" size={size} leftIcon={<MenuBookIcon />} loading={globalLoading}>
                    {copy.labels.openMap}
                  </Button>
                  <Button variant="ghost" size={size} loading={globalLoading}>
                    {copy.labels.ghost}
                  </Button>
                  <Button variant="danger-outline" size={size} loading={globalLoading}>
                    {copy.labels.dangerOutline}
                  </Button>
                  <IconButton
                    variant="secondary"
                    size={size}
                    label={copy.labels.iconFav}
                    icon={<HeartIcon filled={favPressed} />}
                    aria-pressed={favPressed}
                    loading={globalLoading}
                    onClick={() => setFavPressed((v) => !v)}
                  />
                  <IconButton
                    variant="ghost"
                    size={size}
                    label={copy.labels.iconClose}
                    icon={<CloseIcon />}
                    loading={globalLoading}
                  />
                  <IconButton
                    variant="danger-outline"
                    size={size}
                    label={copy.labels.iconDelete}
                    icon={<TrashIcon />}
                    loading={globalLoading}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Normal Surface vs Always-Dark Surface */}
        <section className="dev-btns-section">
          <div className="dev-btns-section-head">
            <h2>{copy.sectionSurfaces}</h2>
            <p className="dev-btns-section-desc">{copy.sectionSurfacesDesc}</p>
          </div>

          <div className="dev-btns-surface-grid">
            <div className="dev-btns-surface-card">
              <h3>{copy.normalSurfaceTitle}</h3>
              <div className="btn-group btn-group--mobile-stack">
                <Button variant="primary" size="lg" loading={globalLoading}>
                  {copy.labels.bookTable}
                </Button>
                <Button variant="secondary" size="lg" loading={globalLoading}>
                  {copy.labels.secondary}
                </Button>
                <Button variant="ghost" size="md" loading={globalLoading}>
                  {copy.labels.ghost}
                </Button>
              </div>
              <div className="dev-btns-states">
                <Button variant="link">{copy.labels.link}</Button>
                <Button variant="danger-outline" size="sm">
                  {copy.labels.dangerOutline}
                </Button>
              </div>
            </div>

            <div className="dev-btns-surface-card" data-surface="dark">
              <h3>{copy.darkSurfaceTitle}</h3>
              <div className="btn-group btn-group--mobile-stack">
                <Button variant="primary" size="lg" loading={globalLoading}>
                  {copy.labels.bookTable}
                </Button>
                <Button variant="secondary" size="lg" loading={globalLoading}>
                  {copy.labels.secondary}
                </Button>
                <Button variant="ghost" size="md" loading={globalLoading}>
                  {copy.labels.ghost}
                </Button>
              </div>
              <div className="dev-btns-states">
                <Button variant="link">{copy.labels.link}</Button>
                <Button variant="danger-outline" size="sm">
                  {copy.labels.dangerOutline}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Separate Primitives (.chip & .seg) */}
        <section className="dev-btns-section">
          <div className="dev-btns-section-head">
            <h2>{copy.sectionPrimitives}</h2>
            <p className="dev-btns-section-desc">{copy.sectionPrimitivesDesc}</p>
          </div>

          <div className="dev-btns-surface-grid">
            <div className="dev-btns-surface-card">
              <span className="dev-btns-cell-label">.chip + .seg ({copy.normalSurfaceTitle})</span>
              <div className="btn-group">
                {copy.chips.map((chip, idx) => {
                  const active = selectedChips.includes(idx);
                  return (
                    <button
                      key={chip}
                      type="button"
                      className={`chip${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      onClick={() => toggleChip(idx)}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>

              <div className="seg" role="tablist" aria-label="View mode">
                {copy.segViews.map((view, idx) => {
                  const active = viewIndex === idx;
                  return (
                    <button
                      key={view}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`seg-item${active ? " is-active" : ""}`}
                      onClick={() => setViewIndex(idx)}
                    >
                      {view}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="dev-btns-surface-card" data-surface="dark">
              <span className="dev-btns-cell-label">.chip + .seg ([data-surface=&quot;dark&quot;])</span>
              <div className="btn-group">
                {copy.chips.map((chip, idx) => {
                  const active = selectedChips.includes(idx);
                  return (
                    <button
                      key={chip}
                      type="button"
                      className={`chip${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      onClick={() => toggleChip(idx)}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>

              <div className="seg" role="tablist" aria-label="View mode on dark">
                {copy.segViews.map((view, idx) => {
                  const active = viewIndex === idx;
                  return (
                    <button
                      key={view}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`seg-item${active ? " is-active" : ""}`}
                      onClick={() => setViewIndex(idx)}
                    >
                      {view}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* 5. Destructive 2-Step, Phone Stack & One-Line RU/EN/RO Proof */}
        <section className="dev-btns-section">
          <div className="dev-btns-section-head">
            <h2>{copy.sectionRules}</h2>
            <p className="dev-btns-section-desc">{copy.sectionRulesDesc}</p>
          </div>

          <div className="dev-btns-confirm-box">
            <p className="dev-btns-confirm-text">{copy.labels.cancelPrompt}</p>
            <div className="btn-group btn-group--mobile-stack">
              {!confirmOpen ? (
                <Button variant="danger-outline" size="md" onClick={() => setConfirmOpen(true)}>
                  {copy.labels.dangerOutline}
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="md" onClick={() => setConfirmOpen(false)}>
                    {copy.labels.keepBooking}
                  </Button>
                  <Button
                    variant="danger"
                    size="md"
                    loading={Boolean(loadingKeys.confirmCancel)}
                    onClick={() => pulseLoading("confirmCancel")}
                  >
                    {copy.labels.confirmCancel}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="dev-btns-surface-card">
            <span className="dev-btns-cell-label">{copy.phoneStackTitle}</span>
            <div className="btn-group btn-group--mobile-stack">
              <Button variant="primary" size="md" leftIcon={<PlusIcon />} loading={globalLoading}>
                {copy.labels.iconAdd}
              </Button>
              <Button variant="secondary" size="md" loading={globalLoading}>
                {copy.labels.secondary}
              </Button>
              <Button variant="ghost" size="md" loading={globalLoading}>
                {copy.labels.ghost}
              </Button>
            </div>
          </div>

          <div className="dev-btns-surface-head">
            <span className="dev-btns-cell-label">{copy.localeProofTitle}</span>
          </div>
          <div className="dev-btns-locale-grid">
            {LOCALES.map((loc) => (
              <div className="dev-btns-locale-card" key={loc}>
                <span className="dev-btns-locale-tag">{loc.toUpperCase()}</span>
                <Button variant="primary" size="lg" block loading={globalLoading}>
                  {COPY[loc].labels.bookTable}
                </Button>
                <Button variant="primary" size="md" block loading={globalLoading}>
                  {COPY[loc].labels.primary}
                </Button>
                <Button variant="secondary" size="md" block loading={globalLoading}>
                  {COPY[loc].labels.link}
                </Button>
                <Button variant="danger-outline" size="sm" block loading={globalLoading}>
                  {COPY[loc].labels.dangerOutline}
                </Button>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
