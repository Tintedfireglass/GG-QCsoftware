"use client";

import { useState } from "react";
import type { FaqItem } from "@/data/content";

interface FaqAccordionProps {
  items: FaqItem[];
  /** When set, only the first N items show until "Show All" is clicked. */
  limit?: number;
  /** Optional badge/title rendered above the accordion (home-page variant). */
  badgeText?: string;
  title?: string;
}

// Accordion (ported from the Bootstrap accordion used in index.php / faq.php).
// Open/close and the "Show All" toggle are handled with React state, mirroring
// the original Bootstrap collapse + inline JS behaviour.
export default function FaqAccordion({
  items,
  limit,
  badgeText,
  title,
}: FaqAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const hasShowAll = typeof limit === "number" && items.length > limit;
  const visibleItems =
    hasShowAll && !expanded ? items.slice(0, limit) : items;

  const toggle = (id: string) =>
    setOpenId((current) => (current === id ? null : id));

  return (
    <>
      {badgeText ? (
        <p className="faq-badge">
          <i className="fas fa-question-circle"></i>
          {badgeText}
        </p>
      ) : null}

      {title || hasShowAll ? (
        <div className="faq-header">
          {title ? <h2 className="faq-title">{title}</h2> : <span />}
          {hasShowAll ? (
            <button
              className="faq-show-all-link"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Hide" : "Show All"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="accordion" id="faqAccordion">
        {visibleItems.map((faq) => {
          const isOpen = openId === faq.id;
          return (
            <div className="accordion-item faq-item" key={faq.id}>
              <h2 className="accordion-header">
                <button
                  className={`accordion-button${isOpen ? "" : " collapsed"}`}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={faq.id}
                  onClick={() => toggle(faq.id)}
                >
                  {faq.question}
                </button>
              </h2>
              <div
                id={faq.id}
                className={`accordion-collapse collapse${isOpen ? " show" : ""}`}
              >
                <div className="accordion-body">{faq.answer}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
