"use client";

import { useState } from "react";
import { partnership } from "@/data/content";
import { apiUrl, hasApiBase } from "@/lib/api-base";

// Contact / partnership form (ported from the form in index.php).
// Submits to the admin app's public /api/contact endpoint (cross-origin).
export default function ContactForm() {
  const [notice, setNotice] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (!hasApiBase()) {
      setNotice({ type: "err", text: "Submission is not configured yet. Please try again later." });
      return;
    }

    const fd = new FormData(form);
    const payload = {
      name: String(fd.get("name") || ""),
      company_name: String(fd.get("company_name") || ""),
      phone_no: String(fd.get("phone_no") || ""),
      email_id: String(fd.get("email_id") || ""),
      service: String(fd.get("service") || "PRAMAAN"),
      description: String(fd.get("description") || ""),
    };

    setSubmitting(true);
    setNotice(null);
    try {
      // text/plain keeps this a CORS "simple request" — no preflight needed.
      const res = await fetch(apiUrl("contact"), {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "Could not submit your enquiry.");
      }
      setNotice({ type: "ok", text: "Thanks! Your enquiry has been received. We'll be in touch shortly." });
      form.reset();
    } catch (err) {
      setNotice({ type: "err", text: err instanceof Error ? err.message : "Could not submit your enquiry." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="row career-form" id="carrerForm" onSubmit={handleSubmit}>
      <div className="form-group">
        <input
          type="text"
          className="form-control"
          name="name"
          placeholder="Name *"
          required
        />
      </div>

      <div className="form-group">
        <input
          type="text"
          className="form-control"
          name="company_name"
          placeholder="Company Name *"
          required
        />
      </div>

      <div className="form-group">
        <input
          type="tel"
          className="form-control"
          name="phone_no"
          placeholder="Phone Number *"
          pattern="[0-9]{10,11}"
          minLength={10}
          maxLength={11}
          title="Please enter a valid phone number (10-11 digits)"
          required
        />
      </div>

      <div className="form-group">
        <input
          type="email"
          className="form-control"
          name="email_id"
          placeholder="Email ID *"
          pattern="[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
          required
        />
      </div>

      <div className="form-group">
        <input
          type="text"
          className="form-control"
          name="service"
          placeholder="Service *"
          defaultValue="PRAMAAN"
          required
          readOnly
        />
      </div>

      <div className="form-group">
        <textarea
          className="form-control"
          name="description"
          placeholder="Description"
          maxLength={250}
          style={{ minHeight: "120px" }}
        ></textarea>
        <small className="form-text text-muted">
          Note: Links and scripts are not allowed
        </small>
      </div>

      {/* reCAPTCHA placeholder — widget is wired up with the live API later. */}
      <div className="g-recaptcha" data-sitekey={partnership.recaptchaKey}></div>

      {notice ? (
        <div
          className={`form-text ${notice.type === "ok" ? "text-success" : "text-danger"}`}
          style={{ marginBottom: "1rem" }}
        >
          {notice.text}
        </div>
      ) : null}

      <div className="col-lg-6 col-md-12 col-sm-12 d-flex justify-content-start align-items-center">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Submitting..." : "Apply"}
        </button>
      </div>
    </form>
  );
}
