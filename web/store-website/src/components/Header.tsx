"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { header } from "@/data/content";

// Session flag so the back link keeps showing while the visitor moves around
// this site (document.referrer becomes an internal URL after the first hop).
const CAME_FROM_KEY = "pramaan.cameFromGadgetGuruz";

// Only the main site counts — not pramaan.gadgetguruz.com (this site itself).
function isGadgetGuruzReferrer(referrer: string) {
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    const backHost = new URL(header.backLink).hostname.toLowerCase();
    return host === backHost || host === `www.${backHost}`;
  } catch {
    return false;
  }
}

// Home-page header (ported from components/header.php).
// The mobile menu collapse is handled with React state instead of Bootstrap JS.
export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  // Starts false so the server render and the first client render match.
  const [showBackLink, setShowBackLink] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(CAME_FROM_KEY) === "1") {
        setShowBackLink(true);
        return;
      }
      if (isGadgetGuruzReferrer(document.referrer)) {
        sessionStorage.setItem(CAME_FROM_KEY, "1");
        setShowBackLink(true);
      }
    } catch {
      // sessionStorage unavailable (private mode / blocked) — leave it hidden.
    }
  }, []);

  return (
    <header className="site-header border-bottom">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-3">
            {showBackLink && (
              <a
                href={header.backLink}
                className="text-decoration-none text-muted d-flex align-items-center back-link"
              >
                <i className="fas fa-arrow-left me-2"></i>
                <span className="back-text">{header.backText}</span>
              </a>
            )}
          </div>
          <div className="col-6 text-center">
            <Link href="/">
              <img
                src={header.logoImage}
                alt={header.logoAlt}
                className="reference-logo-img"
              />
            </Link>
          </div>
          <div className="col-3">
            {/* Desktop Navigation */}
            <nav className="d-none d-md-flex justify-content-end gap-3 desktop-nav">
              {header.navItems.map((item) => (
                <Link
                  key={item.text}
                  href={item.href}
                  className="text-decoration-none text-dark"
                >
                  {item.text}
                </Link>
              ))}
            </nav>

            {/* Mobile Hamburger Menu */}
            <div className="d-md-none mobile-nav d-flex justify-content-end">
              <button
                className="hamburger-btn"
                type="button"
                aria-controls="mobileMenu"
                aria-expanded={menuOpen}
                aria-label="Toggle navigation"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="hamburger-line"></span>
                <span className="hamburger-line"></span>
                <span className="hamburger-line"></span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Collapse */}
        <div
          className={`collapse d-md-none${menuOpen ? " show" : ""}`}
          id="mobileMenu"
        >
          <nav className="mobile-menu-nav">
            {header.navItems.map((item) => (
              <Link
                key={item.text}
                href={item.href}
                className="mobile-menu-link"
                onClick={() => setMenuOpen(false)}
              >
                {item.text}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
