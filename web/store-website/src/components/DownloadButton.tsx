"use client";

import { useEffect, useRef, useState } from "react";
import type { DownloadOption } from "@/lib/releases";

// Download call-to-action. When only one build is published it renders a plain
// link (unchanged behaviour). With multiple platform/arch builds it becomes a
// dropdown so the visitor can pick the installer that matches their machine.

// Brand icon per platform (Font Awesome Free brands). Falls back to a generic
// download glyph for anything we don't recognise.
function platformIcon(platform: string): string {
  switch (platform) {
    case "windows":
      return "fab fa-windows";
    case "mac":
      return "fab fa-apple";
    case "linux":
      return "fab fa-linux";
    case "android":
      return "fab fa-android";
    default:
      return "fa fa-download";
  }
}

export default function DownloadButton({
  options,
  ctaText,
  className = "btn-primary",
}: {
  options: DownloadOption[];
  ctaText: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Single build → keep the simple link.
  if (options.length <= 1) {
    const only = options[0];
    return (
      <a href={only?.url} className={className}>
        {ctaText} <i className="fa fa-arrow-down"></i>
      </a>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className={className}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {ctaText}{" "}
        <i
          className="fa fa-chevron-down"
          style={{
            fontSize: ".8em",
            marginLeft: ".15em",
            transition: "transform .15s ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        ></i>
      </button>

      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + .5rem)",
            left: 0,
            minWidth: "300px",
            backgroundColor: "#ffffff",
            opacity: 1,
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
            padding: ".4rem",
            zIndex: 1000,
          }}
        >
          {options.map((o) => (
            <a
              key={`${o.platform}-${o.arch}`}
              href={o.url}
              role="menuitem"
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: ".9rem",
                padding: ".7rem .85rem",
                borderRadius: 8,
                color: "#334155",
                textDecoration: "none",
                fontSize: "1rem",
                lineHeight: 1.2,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <i
                className={platformIcon(o.platform)}
                aria-hidden="true"
                style={{
                  width: "1.4rem",
                  textAlign: "center",
                  fontSize: "1.2rem",
                  color: "#1e293b",
                  flexShrink: 0,
                }}
              ></i>
              <span style={{ flex: 1, fontWeight: 500, whiteSpace: "nowrap" }}>{o.label}</span>
              {o.channel && o.channel !== "stable" ? (
                <span
                  style={{
                    textTransform: "capitalize",
                    fontSize: ".68rem",
                    fontWeight: 600,
                    letterSpacing: ".02em",
                    color: "#9333ea",
                    background: "#f3e8ff",
                    padding: ".1rem .4rem",
                    borderRadius: 999,
                  }}
                >
                  {o.channel}
                </span>
              ) : null}
              {o.version ? (
                <span style={{ color: "#94a3b8", fontSize: ".78rem" }}>v{o.version}</span>
              ) : null}
              {o.kind === "store" ? (
                <i className="fa fa-external-link-alt" aria-hidden="true" style={{ color: "#94a3b8", fontSize: ".8rem" }}></i>
              ) : null}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
