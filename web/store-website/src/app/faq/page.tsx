import type { Metadata } from "next";
import Link from "next/link";
import HeaderInternal from "@/components/HeaderInternal";
import Footer from "@/components/Footer";
import FaqAccordion from "@/components/FaqAccordion";
import { faqs } from "@/data/content";

export const metadata: Metadata = {
  title: "FAQ - Pramaan Device Health Testing Software",
  description:
    "Frequently asked questions about Pramaan hardware diagnostic and device health testing software. Get answers about device testing, certification, and more.",
  keywords:
    "Pramaan FAQ, device testing questions, hardware diagnostic FAQ, laptop testing questions, device health FAQ",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <>
      <HeaderInternal />

      {/* FAQ Hero Section */}
      <section className="faq-hero-section">
        <div className="container">
          <div className="text-center">
            <p className="faq-badge">
              <i className="fas fa-question-circle"></i>
              {faqs.badgeText}
            </p>
            <h1 className="faq-hero-title">{faqs.title}</h1>
            <p className="faq-hero-subtitle">
              Find answers to common questions about Pramaan device health
              testing software
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="faqs-section">
        <div className="container">
          <FaqAccordion items={faqs.items} />
        </div>
      </section>

      {/* CTA Section */}
      <section className="faq-cta-section">
        <div className="container">
          <div className="text-center">
            <h2>Still have questions?</h2>
            <p>
              Can&apos;t find the answer you&apos;re looking for? Get in touch
              with our team.
            </p>
            <Link href="/#contact" className="btn-primary">
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
