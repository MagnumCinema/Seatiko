"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { useLocale } from "@/components/locale-provider";
import { getSiteCopy } from "@/lib/site-copy";
import { LEGAL_DOCS, type LegalDocId } from "@/lib/legal-content";

function PinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function SiteFooter() {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).footer;
  const pathname = usePathname();
  const [activeDocId, setActiveDocId] = useState<LegalDocId | null>(null);

  const handleClose = useCallback(() => {
    setActiveDocId(null);
  }, []);

  // Keyboard navigation & body scroll lock
  useEffect(() => {
    if (!activeDocId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeDocId, handleClose]);

  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (pathname === "/" && href.startsWith("/#")) {
      e.preventDefault();
      const id = href.replace("/#", "");
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const currentDoc = activeDocId ? LEGAL_DOCS[locale][activeDocId] : null;

  return (
    <>
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-grid">
            {/* Col 1: Brand & Identity */}
            <div className="footer-brand-col">
              <Link href="/" className="footer-brand">
                <span className="site-brand-mark" aria-hidden="true">S</span>
                <span>Seatiko</span>
              </Link>
              <p className="footer-tagline">{copy.tagline}</p>
              
              <div className="footer-pilot-badge">
                <span className="footer-pilot-dot" aria-hidden="true" />
                <span>{copy.pilotBadge}</span>
              </div>

              <div className="footer-contacts-list">
                <a href={`mailto:${copy.contactEmail}`} className="footer-contact-item">
                  <MailIcon />
                  <span>{copy.contactEmail}</span>
                </a>
                <div className="footer-contact-item">
                  <PinIcon />
                  <span>{copy.city}</span>
                </div>
                <div className="footer-contact-item muted">
                  <ClockIcon />
                  <span>{copy.hours}</span>
                </div>
              </div>
            </div>

            {/* Col 2: For Guests */}
            <div className="footer-col">
              <h4>{copy.guestsTitle}</h4>
              <ul>
                {copy.guestsLinks.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      onClick={(e) => handleAnchorClick(e, link.href)}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 3: For Restaurants */}
            <div className="footer-col">
              <h4>{copy.businessTitle}</h4>
              <ul>
                {copy.businessLinks.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      onClick={(e) => handleAnchorClick(e, link.href)}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 4: Official & Legal */}
            <div className="footer-col">
              <h4>{copy.legalTitle}</h4>
              <ul>
                {copy.legalLinks.map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      className="footer-legal-btn"
                      onClick={() => setActiveDocId(doc.id as LegalDocId)}
                    >
                      <span>{doc.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="footer-divider" />

          {/* Bottom Bar */}
          <div className="footer-bottom">
            <span>{copy.copyright}</span>

            <div className="footer-status">
              <span className="footer-status-dot" aria-hidden="true" />
              <span>{copy.systemStatus}</span>
            </div>

            <span className="footer-made-in">{copy.madeIn}</span>
          </div>
        </div>
      </footer>

      {/* Interactive Official Documents Modal */}
      {currentDoc && (
        <div
          className="legal-modal-backdrop"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="legal-modal-title"
        >
          <div
            className="legal-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="legal-modal-header">
              <div className="legal-modal-title-group">
                <span className="legal-modal-badge">{currentDoc.badge}</span>
                <h3 id="legal-modal-title">{currentDoc.title}</h3>
                <small className="legal-modal-updated">{currentDoc.updatedAt}</small>
              </div>
              <button
                type="button"
                className="legal-modal-close"
                onClick={handleClose}
                aria-label={copy.modalClose}
              >
                <CloseIcon />
              </button>
            </div>

            {/* Tab navigation between all documents */}
            <div className="legal-modal-tabs" role="tablist">
              {copy.legalLinks.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={activeDocId === item.id}
                  className={`legal-modal-tab ${activeDocId === item.id ? "active" : ""}`}
                  onClick={() => setActiveDocId(item.id as LegalDocId)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Modal Document Body */}
            <div className="legal-modal-body">
              {currentDoc.sections.map((section, idx) => (
                <article key={idx} className="legal-modal-section">
                  <h4>{section.title}</h4>
                  {section.paragraphs.map((p, pIdx) => (
                    <p key={pIdx}>{p}</p>
                  ))}
                </article>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="legal-modal-footer">
              <div className="legal-modal-support">
                <span>{copy.modalSupportNotice}</span>
                <a href={`mailto:${copy.contactEmail}`}>{copy.contactEmail}</a>
              </div>
              <button
                type="button"
                className="btn btn-gold btn-legal-close"
                onClick={handleClose}
              >
                {copy.modalClose}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

