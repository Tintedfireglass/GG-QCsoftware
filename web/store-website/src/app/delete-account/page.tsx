import type { Metadata } from "next";
import HeaderInternal from "@/components/HeaderInternal";
import Footer from "@/components/Footer";
import "./delete-account.css";

export const metadata: Metadata = {
  title: "Delete Your Account - PRAMAAN",
  description:
    "How to delete your PRAMAAN account and associated data, what data is removed, and what is retained. Provided by Gadget Guruz Technologies Pvt Ltd.",
  keywords:
    "Pramaan delete account, account deletion, data deletion request, remove account, Gadget Guruz",
  alternates: { canonical: "/delete-account" },
};

export default function DeleteAccountPage() {
  return (
    <>
      {/* DM Sans / DM Serif fonts used only on this page (hoisted to <head>). */}
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />

      <HeaderInternal />

      <main className="da-page">
        <div className="da-wrap">
          {/* Hero */}
          <div className="da-hero">
            <div className="da-brand">
              PRAMAAN — Gadget Guruz Technologies Pvt Ltd
            </div>
            <h1>Delete Your Account</h1>
            <p className="subtitle">
              How to permanently delete your PRAMAAN account and associated data
            </p>
            <div className="da-meta">
              <span className="da-badge">DPDP Act, 2023 — Right to Erasure</span>
              <span className="da-badge">App: PRAMAAN (com.gadgetguruz.pramaan)</span>
            </div>
          </div>

          {/* Intro */}
          <div className="da-section">
            <p>
              You can request permanent deletion of your PRAMAAN account at any
              time. Deleting your account removes your profile and the personal
              data associated with it, subject to the limited legal retention
              obligations described below. This page explains the two ways to
              request deletion, exactly what data is removed, and what we are
              required to retain and for how long.
            </p>
            <div className="da-warnbox">
              <strong>Account deletion is permanent and cannot be undone.</strong>{" "}
              Once your account is deleted you will lose access to your profile
              and your saved diagnostic history, and you will need to create a
              new account to use PRAMAAN again.
            </div>
          </div>

          {/* Option 1 — In-app */}
          <div className="da-section">
            <h2>Option 1 — Delete from within the PRAMAAN app</h2>
            <p>
              The fastest way to delete your account is directly inside the
              PRAMAAN mobile app:
            </p>
            <ol className="da-steps">
              <li>Open the <strong>PRAMAAN</strong> app and sign in.</li>
              <li>
                Go to <strong>Profile</strong> (tap the profile icon), then tap{" "}
                <strong>Edit Profile</strong>.
              </li>
              <li>
                Scroll to the <strong>Danger Zone</strong> and tap{" "}
                <strong>Delete Account</strong>.
              </li>
              <li>
                Confirm in the dialog by tapping <strong>Delete</strong>. Your
                account is deleted and you are signed out immediately.
              </li>
            </ol>
          </div>

          {/* Option 2 — Email */}
          <div className="da-section">
            <h2>Option 2 — Request deletion by email</h2>
            <p>
              If you are unable to access the app, you can request account
              deletion by email. Send a message from the email address
              registered to your account to{" "}
              <a href="mailto:privacy@gadgetguruz.com?subject=PRAMAAN%20Data%20Deletion%20Request">
                privacy@gadgetguruz.com
              </a>{" "}
              with the subject line{" "}
              <strong>&quot;PRAMAAN Data Deletion Request&quot;</strong>, and
              include the phone number or email associated with your account so
              we can verify your identity.
            </p>
            <div className="da-infobox">
              We acknowledge every request within <strong>48 hours</strong> and
              complete verified deletions within <strong>30 days</strong>, in
              line with your Right to Erasure under the DPDP Act, 2023.
            </div>
          </div>

          {/* What gets deleted */}
          <div className="da-section">
            <h2>What data is deleted</h2>
            <p>
              When your account deletion is processed, we permanently delete or
              irreversibly anonymise:
            </p>
            <ul>
              <li>Your account and login credentials</li>
              <li>
                Your profile details — name, phone number, and email address
              </li>
              <li>
                Diagnostic reports and device health history linked to your
                account
              </li>
              <li>Support and communication records linked to your account</li>
            </ul>
          </div>

          {/* What is retained */}
          <div className="da-section">
            <h2>What we are required to retain</h2>
            <p>
              A limited set of records may be retained after account deletion to
              meet legal, audit, and security obligations. These records are not
              used to re-identify you for any other purpose and are deleted on
              expiry of the periods below.
            </p>
            <div className="da-table-wrap">
              <table className="da-table">
                <thead>
                  <tr>
                    <th>Data Type</th>
                    <th>Retention Period</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Issued QC Certificates</td>
                    <td>5 years from date of issue</td>
                    <td>Audit trail and independent certificate verification</td>
                  </tr>
                  <tr>
                    <td>Crash logs &amp; error reports</td>
                    <td>12 months (rolling)</td>
                    <td>Software stability and diagnostics</td>
                  </tr>
                  <tr>
                    <td>Anonymised usage telemetry</td>
                    <td>24 months (rolling)</td>
                    <td>No longer linked to your identity after deletion</td>
                  </tr>
                  <tr>
                    <td>Data breach incident logs</td>
                    <td>5 years from date of incident</td>
                    <td>Regulatory requirement under applicable law</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              For full details on how we handle your data, see our{" "}
              <a href="/privacy-policy">Privacy Policy</a>.
            </p>
          </div>

          {/* Contact */}
          <div className="da-section">
            <h2>Need help?</h2>
            <p>
              If you have any questions about deleting your account or exercising
              your data rights, contact us:
            </p>
            <div className="da-contact-grid">
              <div className="da-contact-item">
                <div className="label">Data Deletion &amp; Privacy</div>
                <div className="value">
                  <a href="mailto:privacy@gadgetguruz.com">
                    privacy@gadgetguruz.com
                  </a>
                </div>
              </div>
              <div className="da-contact-item">
                <div className="label">General Support</div>
                <div className="value">
                  <a href="mailto:support@gadgetguruz.com">
                    support@gadgetguruz.com
                  </a>
                </div>
              </div>
              <div className="da-contact-item">
                <div className="label">Grievance Officer</div>
                <div className="value">Mr. Atul Kishan</div>
              </div>
              <div className="da-contact-item">
                <div className="label">Acknowledgment SLA</div>
                <div className="value">Within 48 hours of request</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
