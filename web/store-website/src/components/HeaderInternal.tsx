"use client";

import { useState } from "react";
import Link from "next/link";
import { header } from "@/data/content";

// Internal-page header (ported from components/header-internal.php).
// Shows a "Back to Home" link instead of the "Back to Gadget Guruz" link.
export default function HeaderInternal() {
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { href: "/#about", text: "About" },
    { href: "/#features", text: "Features" },
    { href: "/faq", text: "FAQ" },
    { href: "/#contact", text: "Contact" },
  ];

  return (
    <header className="site-header border-bottom">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-3">
            <Link
              href="/"
              className="text-decoration-none text-muted d-flex align-items-center back-link"
            >
              <i className="fas fa-arrow-left me-2"></i>
              <span className="back-text">Back to Home</span>
            </Link>
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
              {navItems.map((item) => (
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
            {navItems.map((item) => (
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
