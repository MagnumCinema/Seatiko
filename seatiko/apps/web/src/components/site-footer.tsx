"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback } from "react";
import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { ModalBody, ModalFooter, ModalHeader, ModalShell } from "@/components/ui/modal-shell";
import { ScrollerFade } from "@/components/ui/scroller-fade";
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

export function SiteFooter() {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).footer;
  const pathname = usePathname();
  const [activeDocId, setActiveDocId] = useState<LegalDocId | null>(null);

  const handleClose = useCallback(() => {
    setActiveDocId(null);
  }, []);

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

      {/* Official documents: one dialog, a tab per document (ModalShell, always-dark surface). */}
      <ModalShell
        open={currentDoc !== null}
        onClose={handleClose}
        size="lg"
        labelledBy="legal-modal-title"
        className="legal-modal"
        surface="dark"
      >
        {currentDoc ? (
          <>
            <ModalHeader
              kicker={currentDoc.badge}
              title={currentDoc.title}
              titleId="legal-modal-title"
              subtitle={currentDoc.updatedAt}
              onClose={handleClose}
            >
              <ScrollerFade
                className="legal-modal-tabs"
                trackClassName="seg legal-modal-seg"
                role="tablist"
                ariaLabel={copy.legalTitle}
                activeKey={activeDocId}
              >
                {copy.legalLinks.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={activeDocId === item.id}
                    className={`seg-item legal-modal-tab${activeDocId === item.id ? " is-active" : ""}`}
                    onClick={() => setActiveDocId(item.id as LegalDocId)}
                  >
                    {item.label}
                  </button>
                ))}
              </ScrollerFade>
            </ModalHeader>
            <ModalBody className="legal-modal-body">
              {currentDoc.sections.map((section, idx) => (
                <article key={idx} className="legal-modal-section">
                  <h4>{section.title}</h4>
                  {section.paragraphs.map((p, pIdx) => (
                    <p key={pIdx}>{p}</p>
                  ))}
                </article>
              ))}
            </ModalBody>
            <ModalFooter
              summary={
                <span className="legal-modal-support">
                  {copy.modalSupportNotice} <a href={`mailto:${copy.contactEmail}`}>{copy.contactEmail}</a>
                </span>
              }
            >
              <Button variant="secondary" size="md" onClick={handleClose}>
                {copy.modalClose}
              </Button>
            </ModalFooter>
          </>
        ) : null}
      </ModalShell>
    </>
  );
}

