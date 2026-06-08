import type { Metadata } from "next";
import HeaderInternal from "@/components/HeaderInternal";
import Footer from "@/components/Footer";
import "./privacy-policy.css";

export const metadata: Metadata = {
  title: "Privacy Policy - PRAMAAN",
  description:
    "Privacy Policy for PRAMAAN Device Health Diagnostics & Certification Software by Gadget Guruz Technologies Pvt Ltd.",
  keywords:
    "Pramaan privacy policy, DPDP Act, data protection, device diagnostics privacy, Gadget Guruz",
  alternates: { canonical: "/privacy-policy" },
};

export default function PrivacyPolicyPage() {
  return (
    <>
      {/* DM Sans / DM Serif fonts used only on this page (hoisted to <head>). */}
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />

      <HeaderInternal />

      <main className="pp-page">
        <div className="pp-wrap">
          {/* Hero */}
          <div className="pp-hero">
            <div className="pp-brand">
              PRAMAAN — Gadget Guruz Technologies Pvt Ltd
            </div>
            <h1>Privacy Policy</h1>
            <p className="subtitle">
              Device Health Diagnostics &amp; Certification Software
            </p>
            <div className="pp-meta">
              <span className="pp-badge">DPDP Act, 2023 Compliant</span>
              <span className="pp-badge">IT Act, 2000</span>
              <span className="pp-badge">Effective: April 2025</span>
              <span className="pp-badge">Version 1.0</span>
            </div>
          </div>

          {/* Table of Contents */}
          <div className="pp-toc">
            <div className="pp-toc-title">Contents</div>
            <ol>
              <li><a href="#s1">Introduction</a></li>
              <li><a href="#s2">Data Fiduciary Details</a></li>
              <li><a href="#s3">Design Principles</a></li>
              <li><a href="#s4">Information We Collect</a></li>
              <li><a href="#s5">What We Do Not Collect</a></li>
              <li><a href="#s6">How We Use Information</a></li>
              <li><a href="#s7">Consent</a></li>
              <li><a href="#s8">Notice to Data Principals</a></li>
              <li><a href="#s9">Software Permissions</a></li>
              <li><a href="#s10">Data Storage &amp; Security</a></li>
              <li><a href="#s11">Sharing of Data</a></li>
              <li><a href="#s12">Data Retention &amp; Deletion</a></li>
              <li><a href="#s13">Rights of Data Principals</a></li>
              <li><a href="#s14">Children&apos;s Privacy</a></li>
              <li><a href="#s15">Third-Party Services</a></li>
              <li><a href="#s16">Applicable Laws</a></li>
              <li><a href="#s17">Grievance Redressal</a></li>
              <li><a href="#s18">Policy Changes</a></li>
              <li><a href="#s19">Contact Us</a></li>
            </ol>
          </div>

          {/* 1. Introduction */}
          <div className="pp-section" id="s1">
            <span className="pp-section-num">Section 01</span>
            <h2>Introduction</h2>
            <p>
              PRAMAAN is a hardware diagnostics and device health testing
              software developed and operated by Gadget Guruz Technologies Pvt
              Ltd (&quot;Company&quot;, &quot;we&quot;, &quot;our&quot;,
              &quot;us&quot;). PRAMAAN is designed to evaluate the performance,
              stability, and lifecycle health of electronic devices — including
              laptops, desktops, and other hardware — and to generate verified
              device health reports and QC certificates.
            </p>
            <p>
              This Privacy Policy explains how we collect, use, store, disclose,
              and protect information when you install, access, or use:
            </p>
            <ul>
              <li>The PRAMAAN desktop application</li>
              <li>The PRAMAAN website at pramaan.gadgetguruz.com</li>
              <li>The PRAMAAN enterprise dashboard and reporting portal</li>
              <li>
                Any PRAMAAN APIs, integrations, or related services
                (collectively, the &quot;Service&quot;)
              </li>
            </ul>
            <p>This Policy applies to all categories of users:</p>
            <ul>
              <li>Individual users running diagnostics on their own devices</li>
              <li>
                Technicians using PRAMAAN for device testing before and after
                repair
              </li>
              <li>
                Enterprises and IT administrators using PRAMAAN for asset health
                monitoring
              </li>
              <li>
                Refurbishers and recyclers using PRAMAAN for device certification
                before resale or disposal
              </li>
              <li>
                Insurance providers using PRAMAAN health scores for device risk
                classification
              </li>
              <li>Visitors to the PRAMAAN website or dashboard portals</li>
            </ul>
            <div className="pp-infobox">
              This Policy is compliant with the{" "}
              <strong>
                Digital Personal Data Protection (DPDP) Act, 2023
              </strong>{" "}
              and the <strong>Information Technology Act, 2000</strong>. By
              installing or using PRAMAAN, you acknowledge that you have read,
              understood, and agreed to this Privacy Policy.
            </div>
          </div>

          {/* 2. Data Fiduciary */}
          <div className="pp-section" id="s2">
            <span className="pp-section-num">Section 02</span>
            <h2>Data Fiduciary Details</h2>
            <p>
              As per Section 2(i) of the DPDP Act, 2023, Gadget Guruz
              Technologies Pvt Ltd is the Data Fiduciary for all personal and
              diagnostic data processed through PRAMAAN.
            </p>
            <div className="pp-card">
              <div className="pp-card-header">Data Fiduciary Information</div>
              <div className="pp-card-body">
                <div className="pp-card-row"><div className="pp-card-key">Company</div><div className="pp-card-val">Gadget Guruz Technologies Pvt Ltd</div></div>
                <div className="pp-card-row"><div className="pp-card-key">Registered Address</div><div className="pp-card-val">F 90/31, Okhla Phase 1, New Delhi</div></div>
                <div className="pp-card-row"><div className="pp-card-key">Product</div><div className="pp-card-val">PRAMAAN — Device Health Diagnostics &amp; Certification Software</div></div>
                <div className="pp-card-row"><div className="pp-card-key">Website</div><div className="pp-card-val"><a href="https://pramaan.gadgetguruz.com" target="_blank" rel="noreferrer">pramaan.gadgetguruz.com</a></div></div>
                <div className="pp-card-row"><div className="pp-card-key">Grievance Officer</div><div className="pp-card-val">Mr. Atul Kishan</div></div>
                <div className="pp-card-row"><div className="pp-card-key">Privacy Contact</div><div className="pp-card-val"><a href="mailto:privacy@gadgetguruz.com">privacy@gadgetguruz.com</a></div></div>
                <div className="pp-card-row"><div className="pp-card-key">General Support</div><div className="pp-card-val"><a href="mailto:support@gadgetguruz.com">support@gadgetguruz.com</a></div></div>
                <div className="pp-card-row"><div className="pp-card-key">Acknowledgment SLA</div><div className="pp-card-val">Within 48 hours of receiving a request</div></div>
                <div className="pp-card-row"><div className="pp-card-key">Resolution SLA</div><div className="pp-card-val">Within 30 days of acknowledgment</div></div>
              </div>
            </div>
          </div>

          {/* 3. Design Principles */}
          <div className="pp-section" id="s3">
            <span className="pp-section-num">Section 03</span>
            <h2>What PRAMAAN Does — Design Principles</h2>
            <p>
              PRAMAAN is built on a principle of{" "}
              <strong>minimal data collection</strong>. It is a hardware
              diagnostic tool — not a surveillance tool, monitoring tool, or data
              harvesting platform. Its sole function is to assess the physical
              health of a device&apos;s hardware components and generate a
              standardised, verifiable health report.
            </p>
            <div className="pp-notebox">
              PRAMAAN does <strong>NOT</strong> access, read, scan, copy, or
              transmit: personal files, documents, emails, photos, videos,
              messages, contact lists, browser history, passwords, financial
              credentials, or any user-generated content. It has no visibility
              into what you do on your device — only how your device&apos;s
              hardware is performing.
            </div>
            <p>
              Every permission that PRAMAAN requests from your operating system
              is used exclusively for hardware diagnostics. See Section 9 for a
              full list of permissions and the specific reason each is required.
            </p>
          </div>

          {/* 4. Information We Collect */}
          <div className="pp-section" id="s4">
            <span className="pp-section-num">Section 04</span>
            <h2>Information We Collect</h2>

            <h3>4.1 Account &amp; Registration Data</h3>
            <p>
              When you create a PRAMAAN account or purchase a license, we
              collect:
            </p>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead><tr><th>Data Point</th><th>Purpose</th></tr></thead>
                <tbody>
                  <tr><td>Full name</td><td>Account identification and license assignment</td></tr>
                  <tr><td>Company or organisation name</td><td>Enterprise license management and reporting</td></tr>
                  <tr><td>Phone number</td><td>Account verification and support contact</td></tr>
                  <tr><td>Email address</td><td>License delivery, account notifications, support</td></tr>
                  <tr><td>Password (cryptographic hash only)</td><td>Secure account authentication — never stored in plain text</td></tr>
                  <tr><td>Purchase details</td><td>License issuance, billing reconciliation, and support</td></tr>
                </tbody>
              </table>
            </div>

            <h3>4.2 Device Diagnostic Data</h3>
            <p>
              When PRAMAAN runs a diagnostic scan, it collects the following
              hardware-level data:
            </p>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead><tr><th>Component</th><th>Data Collected</th><th>Why It Is Needed</th></tr></thead>
                <tbody>
                  <tr><td>CPU</td><td>Model, clock speed, core count, usage under load, stress scores, thermal throttling</td><td>Evaluate processing performance and stability</td></tr>
                  <tr><td>RAM / Memory</td><td>Capacity, usage, health indicators, error rate</td><td>Assess memory integrity and detect degradation</td></tr>
                  <tr><td>Storage (HDD/SSD)</td><td>SMART attributes: sector health, error rates, remaining life, temperature</td><td>Evaluate storage reliability and predict failure risk</td></tr>
                  <tr><td>Battery (laptops)</td><td>Design vs. current capacity, cycle count, charge/discharge rate, health %</td><td>Determine battery health and remaining useful life</td></tr>
                  <tr><td>Thermal System</td><td>CPU temp at idle and load, fan speed, throttling events</td><td>Assess cooling efficiency and stability</td></tr>
                  <tr><td>Display</td><td>Dead pixels, backlight consistency (where applicable)</td><td>Identify display hardware defects</td></tr>
                  <tr><td>Network Interface</td><td>Adapter status, connection capability test</td><td>Confirm network hardware is functional</td></tr>
                  <tr><td>Sensors &amp; Peripherals</td><td>Camera/mic hardware presence check (no recording), USB/port status</td><td>Verify hardware components are detectable</td></tr>
                  <tr><td>System Configuration</td><td>Device model, manufacturer, OS version, firmware/BIOS, serial number</td><td>Associate results with the correct device</td></tr>
                </tbody>
              </table>
            </div>

            <h3>4.3 Usage &amp; Performance Data</h3>
            <ul>
              <li>Test timestamps and diagnostic session durations</li>
              <li>Feature usage statistics (e.g. which diagnostic modules were run)</li>
              <li>Crash reports and error logs, including software version and failure nature</li>
              <li>Diagnostic model performance metrics</li>
            </ul>
            <p>
              This data is collected in aggregated or pseudonymised form where
              possible and used solely for improving PRAMAAN&apos;s diagnostic
              accuracy and software stability. It is never used for advertising
              or sold to third parties.
            </p>

            <h3>4.4 Enterprise Asset Data</h3>
            <p>
              For enterprise deployments, PRAMAAN may collect and maintain:
              device inventory, diagnostic history per device, component change
              logs, repair history records, and lifecycle analytics. This data is
              visible only to authorised administrators within the customer
              organisation.
            </p>

            <h3>4.5 Certification &amp; Report Data</h3>
            <p>
              Each completed diagnostic generates a permanent, verifiable record:
              a device health score, a detailed QC report, a unique Certificate
              ID, a verification QR code, and the test timestamp and PRAMAAN
              version used.
            </p>
          </div>

          {/* 5. What We Do Not Collect */}
          <div className="pp-section" id="s5">
            <span className="pp-section-num">Section 05</span>
            <h2>What PRAMAAN Does Not Collect</h2>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead><tr><th>Data Type</th><th>Why PRAMAAN Does Not Need It</th></tr></thead>
                <tbody>
                  <tr><td>Personal files, documents, PDFs</td><td>Irrelevant to hardware diagnostics</td></tr>
                  <tr><td>Photos, videos, or audio recordings</td><td>Camera/mic tests are hardware presence checks only — no recording occurs</td></tr>
                  <tr><td>Emails, messages, or chat history</td><td>Irrelevant to hardware diagnostics</td></tr>
                  <tr><td>Browser history or internet activity</td><td>Network tests check adapter functionality only — not traffic content</td></tr>
                  <tr><td>Contact lists or address books</td><td>Irrelevant to hardware diagnostics</td></tr>
                  <tr><td>Passwords, PINs, or credentials</td><td>PRAMAAN does not interact with authentication systems</td></tr>
                  <tr><td>Financial information or banking data</td><td>Payments are handled separately at purchase</td></tr>
                  <tr><td>Precise real-time geolocation</td><td>Device location is not relevant to hardware health assessment</td></tr>
                  <tr><td>User activity or behaviour</td><td>PRAMAAN is not a monitoring or surveillance tool</td></tr>
                  <tr><td>Data from users under 18 without consent</td><td>PRAMAAN is not intended for use by minors</td></tr>
                </tbody>
              </table>
            </div>
            <div className="pp-infobox">
              PRAMAAN does not spy on users. It does not monitor what you do on
              your device. It collects only what is necessary to answer one
              question: <strong>how healthy is this device&apos;s hardware?</strong>
            </div>
          </div>

          {/* 6. How We Use Information */}
          <div className="pp-section" id="s6">
            <span className="pp-section-num">Section 06</span>
            <h2>How We Use the Information — Purpose Limitation</h2>
            <p>
              In accordance with Section 4 of the DPDP Act, 2023, all data
              collected by PRAMAAN is used only for the specific purposes stated
              below.
            </p>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead><tr><th>Purpose</th><th>Data Used</th></tr></thead>
                <tbody>
                  <tr><td>Device health scoring and QC certification</td><td>Hardware diagnostic data, system configuration data</td></tr>
                  <tr><td>Generating QC reports and certificates</td><td>All diagnostic data, device identifiers, test timestamps</td></tr>
                  <tr><td>IT asset lifecycle management</td><td>Enterprise asset data, diagnostic history, component change logs</td></tr>
                  <tr><td>Resale and buyback value estimation</td><td>Hardware health scores, battery status, storage SMART data</td></tr>
                  <tr><td>Insurance device risk classification</td><td>Overall health score, component health breakdown</td></tr>
                  <tr><td>Fraud prevention in refurbished device markets</td><td>Component change logs, hardware configuration history</td></tr>
                  <tr><td>Account management and license issuance</td><td>Registration data, purchase details</td></tr>
                  <tr><td>Customer support and troubleshooting</td><td>Registration data, crash logs, diagnostic session data</td></tr>
                  <tr><td>Software diagnostic model improvement</td><td>Anonymised/aggregated usage and performance telemetry</td></tr>
                  <tr><td>Legal compliance and regulatory obligations</td><td>Minimum data necessary as required by applicable law</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 7. Consent */}
          <div className="pp-section" id="s7">
            <span className="pp-section-num">Section 07</span>
            <h2>Consent (Section 6, DPDP Act 2023)</h2>
            <p>
              We process your data only on the basis of free, specific, informed,
              unconditional, and unambiguous consent, as required by Section 6 of
              the DPDP Act, 2023.
            </p>

            <h3>7.1 How Consent Is Obtained</h3>
            <ul>
              <li>A dedicated consent screen is displayed during PRAMAAN installation, before any diagnostic data is collected or transmitted</li>
              <li>At first launch, you are presented with a clear notice of what data will be collected and for what purpose, and asked to provide explicit consent before proceeding</li>
              <li>Consent is not bundled with general terms and conditions — each distinct processing purpose is presented separately</li>
              <li>For enterprise deployments, the enterprise administrator is responsible for ensuring device users are informed of and have consented to the use of PRAMAAN diagnostics</li>
            </ul>

            <h3>7.2 Withdrawing Consent</h3>
            <p>
              You may withdraw consent at any time without affecting the
              lawfulness of prior processing. To withdraw consent:
            </p>
            <ul>
              <li>Uninstall PRAMAAN from your device (this terminates all future data collection from that device)</li>
              <li>Submit a data deletion request to <a href="mailto:privacy@gadgetguruz.com">privacy@gadgetguruz.com</a></li>
              <li>Enterprise administrators may contact their PRAMAAN account manager or email <a href="mailto:privacy@gadgetguruz.com">privacy@gadgetguruz.com</a></li>
            </ul>
          </div>

          {/* 8. Notice */}
          <div className="pp-section" id="s8">
            <span className="pp-section-num">Section 08</span>
            <h2>Notice to Data Principals (Section 5, DPDP Act 2023)</h2>
            <p>
              Before or at the time of collecting your data, PRAMAAN provides a
              clear Notice that includes:
            </p>
            <ul>
              <li>The categories of data being collected</li>
              <li>The specific purpose for which each category is collected</li>
              <li>The identity and contact details of the Data Fiduciary and Grievance Officer</li>
              <li>Any third parties with whom data may be shared</li>
              <li>Your rights as a Data Principal and how to exercise them</li>
              <li>The data retention period applicable to your data</li>
            </ul>
            <p>
              This Notice is presented as a mandatory consent screen at
              installation and at first launch, and is also incorporated into the
              PRAMAAN EULA, available at{" "}
              <a href="https://pramaan.gadgetguruz.com/eula.php" target="_blank" rel="noreferrer">
                pramaan.gadgetguruz.com/eula.php
              </a>
              .
            </p>
          </div>

          {/* 9. Permissions */}
          <div className="pp-section" id="s9">
            <span className="pp-section-num">Section 09</span>
            <h2>Software Permissions</h2>
            <p>
              To perform hardware diagnostics, PRAMAAN requires certain
              system-level permissions. Below is a complete, transparent list of
              every permission required and the specific reason it is needed.
            </p>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead><tr><th>Permission</th><th>What PRAMAAN Accesses</th><th>What PRAMAAN Does NOT Do</th></tr></thead>
                <tbody>
                  <tr><td>System hardware access</td><td>CPU model, clock speed, core metrics, load under stress</td><td>Does not read files or user data stored on the CPU cache</td></tr>
                  <tr><td>Memory (RAM) access</td><td>RAM capacity, usage statistics, error indicators</td><td>Does not read the content of memory (running processes, open documents)</td></tr>
                  <tr><td>Storage health monitoring</td><td>Drive SMART attributes: sector health, error rates, temperature</td><td>Does not read, copy, or scan the content of any file on the drive</td></tr>
                  <tr><td>Battery &amp; power access</td><td>Battery design vs. current capacity, cycle count, charge rate</td><td>Does not control or modify battery charging behaviour</td></tr>
                  <tr><td>Thermal sensor access</td><td>CPU and system temperature readings, fan speed</td><td>Does not modify thermal settings or fan control</td></tr>
                  <tr><td>Network interface access</td><td>Adapter presence and connectivity status</td><td>Does not monitor network traffic, websites visited, or data transmitted</td></tr>
                  <tr><td>Display diagnostics</td><td>Screen resolution, display hardware status</td><td>Does not capture screenshots or record screen content</td></tr>
                  <tr><td>Camera hardware check</td><td>Detects whether a camera device is present and functional</td><td>Does not capture images, video, or activate the camera in any recording capacity</td></tr>
                  <tr><td>Microphone hardware check</td><td>Detects whether a microphone device is present and functional</td><td>Does not record audio or activate the microphone in any recording capacity</td></tr>
                  <tr><td>USB/Port status</td><td>Connected port types, port health</td><td>Does not read data from connected USB devices or peripherals</td></tr>
                  <tr><td>System identifier</td><td>Device model, OS version, BIOS/firmware version, serial number</td><td>Does not use the identifier for tracking beyond associating with the device&apos;s own health records</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 10. Security */}
          <div className="pp-section" id="s10">
            <span className="pp-section-num">Section 10</span>
            <h2>Data Storage and Security (Section 8, DPDP Act 2023)</h2>
            <p>
              We implement appropriate technical, administrative, and
              organisational safeguards to protect your data. Our security
              measures include:
            </p>
            <ul>
              <li>TLS/HTTPS encryption for all data transmitted between PRAMAAN and our servers</li>
              <li>Encryption of stored data at rest using industry-standard algorithms</li>
              <li>Passwords stored as one-way cryptographic hashes — never in recoverable plain text</li>
              <li>Role-based access controls ensuring only authorised personnel can access data</li>
              <li>Multi-factor authentication for enterprise dashboard access</li>
              <li>Secure server infrastructure on enterprise-grade cloud providers</li>
              <li>Regular security audits, vulnerability assessments, and penetration testing</li>
              <li>Contractual data protection obligations imposed on all third-party sub-processors</li>
            </ul>
            <p>
              In the event of a personal data breach likely to result in a risk
              to your rights and interests, we will notify the Data Protection
              Board of India and affected Data Principals within the timelines
              prescribed under the DPDP Act, 2023.
            </p>
          </div>

          {/* 11. Sharing */}
          <div className="pp-section" id="s11">
            <span className="pp-section-num">Section 11</span>
            <h2>Sharing of Data</h2>
            <p>
              We do not sell, rent, or trade your personal or diagnostic data.
              Data is shared only in the following specific and limited
              circumstances:
            </p>

            <h3>11.1 Enterprise Administrators</h3>
            <p>
              For enterprise deployments, device diagnostic data is shared with
              authorised enterprise administrators as contracted, governed by the
              PRAMAAN Enterprise License Agreement and a Data Processing Addendum
              (DPA).
            </p>

            <h3>11.2 Service Providers &amp; Sub-Processors</h3>
            <p>
              We engage trusted third-party vendors for cloud infrastructure,
              software hosting, customer support tools, and analytics. All
              sub-processors are bound by Data Processing Agreements requiring
              DPDP-equivalent data protection standards.
            </p>

            <h3>11.3 Certificate Verification</h3>
            <p>
              PRAMAAN-generated certificates include a Certificate ID and QR code
              for independent third-party verification. When scanned, the
              verifier receives a read-only summary of the device health report.
              No personal data about the device owner is included in the publicly
              verifiable certificate summary.
            </p>

            <h3>11.4 Legal Requirements</h3>
            <p>
              We may disclose data when required by applicable law, court order,
              or regulatory directive, including to the Data Protection Board of
              India. We will, where legally permissible, notify affected users
              before such disclosure.
            </p>

            <h3>11.5 Business Transfers</h3>
            <p>
              In the event of a merger, acquisition, restructuring, or asset
              sale, PRAMAAN data may be transferred as part of the transaction.
              We will notify affected Data Principals prior to such a transfer and
              ensure the receiving entity is bound by equivalent privacy
              obligations.
            </p>

            <h3>11.6 Cross-Border Transfers</h3>
            <p>
              If processing involves transferring personal data outside India,
              such transfers are conducted only to countries notified as
              permissible by the Central Government under the DPDP Act, or where
              adequate contractual safeguards are in place. Enterprise customers
              requiring data residency within India may request this — contact{" "}
              <a href="mailto:privacy@gadgetguruz.com">privacy@gadgetguruz.com</a>.
            </p>
          </div>

          {/* 12. Retention */}
          <div className="pp-section" id="s12">
            <span className="pp-section-num">Section 12</span>
            <h2>Data Retention &amp; Deletion</h2>
            <p>
              We retain data only for as long as necessary to fulfil the stated
              purpose or to comply with legal obligations. On expiry, data is
              securely deleted or irreversibly anonymised.
            </p>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead><tr><th>Data Type</th><th>Retention Period</th></tr></thead>
                <tbody>
                  <tr><td>Active account data</td><td>For the duration of the active account/license</td></tr>
                  <tr><td>Inactive individual user accounts</td><td>3 years from last login, then permanently deleted</td></tr>
                  <tr><td>Diagnostic reports — individual users</td><td>Active license period; deleted within 90 days of account closure or on request</td></tr>
                  <tr><td>Diagnostic reports — enterprise</td><td>Duration of enterprise license + 1 year; deleted 30 days after contract termination</td></tr>
                  <tr><td>Enterprise asset &amp; lifecycle records</td><td>Duration of enterprise contract + 1 year</td></tr>
                  <tr><td>QC Certificates (issued)</td><td>5 years from date of issue (for audit trail and verification)</td></tr>
                  <tr><td>Crash logs and error reports</td><td>12 months on a rolling basis</td></tr>
                  <tr><td>Anonymised usage telemetry</td><td>24 months on a rolling basis</td></tr>
                  <tr><td>Support and communication records</td><td>3 years from resolution of the interaction</td></tr>
                  <tr><td>Data breach incident logs</td><td>5 years from date of incident (regulatory requirement)</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 13. Rights */}
          <div className="pp-section" id="s13">
            <span className="pp-section-num">Section 13</span>
            <h2>Rights of Data Principals (Sections 11–14, DPDP Act 2023)</h2>
            <p>
              As a Data Principal, you have the following statutory rights under
              the DPDP Act, 2023:
            </p>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead><tr><th>Right</th><th>What It Means</th><th>How to Exercise</th></tr></thead>
                <tbody>
                  <tr><td>Right to Access (S.11)</td><td>Request a summary of all personal and diagnostic data we hold about you</td><td>Email privacy@gadgetguruz.com — Subject: &apos;PRAMAAN Data Access Request&apos;</td></tr>
                  <tr><td>Right to Correction (S.12)</td><td>Request correction of inaccurate, outdated, or incomplete registration data</td><td>Update in PRAMAAN account settings, or email us</td></tr>
                  <tr><td>Right to Erasure (S.12)</td><td>Request deletion of your personal and diagnostic data, subject to legal retention obligations</td><td>Email privacy@gadgetguruz.com — Subject: &apos;PRAMAAN Data Deletion Request&apos;</td></tr>
                  <tr><td>Right to Grievance Redressal (S.13)</td><td>Lodge a complaint and receive a substantive written response within 30 days</td><td>Email privacy@gadgetguruz.com — Subject: &apos;PRAMAAN Privacy Grievance&apos;</td></tr>
                  <tr><td>Right to Nominate (S.14)</td><td>Nominate another individual to exercise your data rights in the event of death or incapacity</td><td>Submit a written nomination to privacy@gadgetguruz.com</td></tr>
                  <tr><td>Right to Withdraw Consent</td><td>Withdraw consent at any time without affecting prior lawful processing</td><td>Uninstall PRAMAAN and/or email privacy@gadgetguruz.com</td></tr>
                  <tr><td>Data Portability (anticipated)</td><td>Receive a copy of your diagnostic data in a structured, machine-readable format where feasible</td><td>Email privacy@gadgetguruz.com</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              All rights requests will be acknowledged within 48 hours and
              resolved within 30 days. If a request is denied, we will provide
              written reasons and inform you of your right to escalate to the Data
              Protection Board of India.
            </p>
          </div>

          {/* 14. Children */}
          <div className="pp-section" id="s14">
            <span className="pp-section-num">Section 14</span>
            <h2>Children&apos;s Privacy (Section 9, DPDP Act 2023)</h2>
            <p>
              PRAMAAN is intended for professional and enterprise use and is not
              directed at individuals under the age of 18. We do not knowingly
              collect data from minors.
            </p>
            <p>
              As required by Section 9 of the DPDP Act, if a user is or may be
              under 18, verifiable consent from a parent or lawful guardian must
              be obtained before any data is collected or processed.
            </p>
            <div className="pp-infobox">
              If you are a parent or guardian and believe your child has created a
              PRAMAAN account without your consent, please contact{" "}
              <a href="mailto:privacy@gadgetguruz.com">privacy@gadgetguruz.com</a>{" "}
              immediately. We will promptly delete the account and all associated
              data.
            </div>
          </div>

          {/* 15. Third-Party */}
          <div className="pp-section" id="s15">
            <span className="pp-section-num">Section 15</span>
            <h2>Third-Party Services and Integrations</h2>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead><tr><th>Third Party</th><th>Role</th></tr></thead>
                <tbody>
                  <tr><td>Cloud Infrastructure Provider (e.g. AWS)</td><td>Secure server hosting for PRAMAAN data and reports</td></tr>
                  <tr><td>Enterprise ITAM Systems</td><td>Integration with customer&apos;s existing IT asset management platform (as contracted)</td></tr>
                  <tr><td>Device Repair Workflow Tools</td><td>Integration with repair management platforms used by technicians and refurbishers (as contracted)</td></tr>
                  <tr><td>Analytics Platform</td><td>Anonymised software performance and usage telemetry only — opt-out available via PRAMAAN settings</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              We impose contractual data protection obligations on all
              third-party processors. However, Gadget Guruz is not responsible for
              the independent data practices of third-party services beyond what
              is governed by our agreements with them.
            </p>
          </div>

          {/* 16. Laws */}
          <div className="pp-section" id="s16">
            <span className="pp-section-num">Section 16</span>
            <h2>Applicable Laws and Compliance</h2>
            <p>
              PRAMAAN&apos;s data practices comply with the following applicable
              laws and standards:
            </p>
            <ul>
              <li><strong>Digital Personal Data Protection (DPDP) Act, 2023</strong> — India&apos;s primary data protection legislation governing personal data processing</li>
              <li><strong>Information Technology Act, 2000</strong> (and IT Amendment Act, 2008) — Governing electronic records, cybersecurity, and data security obligations</li>
              <li><strong>IT (Reasonable Security Practices) Rules, 2011</strong> — Security standards for sensitive personal data</li>
              <li>Applicable enterprise data security standards relevant to enterprise PRAMAAN deployments (e.g. ISO 27001-equivalent controls)</li>
            </ul>
          </div>

          {/* 17. Grievance */}
          <div className="pp-section" id="s17">
            <span className="pp-section-num">Section 17</span>
            <h2>Grievance Redressal (Section 13, DPDP Act 2023)</h2>
            <p>
              If you have any complaint, concern, or grievance regarding the
              collection, use, storage, or disclosure of your data by PRAMAAN,
              please contact our Grievance Officer:
            </p>
            <div className="pp-card">
              <div className="pp-card-header">Grievance Officer Details</div>
              <div className="pp-card-body">
                <div className="pp-card-row"><div className="pp-card-key">Grievance Executive</div><div className="pp-card-val">Atul Kishan</div></div>
                <div className="pp-card-row"><div className="pp-card-key">Email</div><div className="pp-card-val"><a href="mailto:privacy@gadgetguruz.com">privacy@gadgetguruz.com</a></div></div>
                <div className="pp-card-row"><div className="pp-card-key">Postal Address</div><div className="pp-card-val">Gadget Guruz Technologies Pvt Ltd, F 90/31, Okhla Phase 1, New Delhi</div></div>
                <div className="pp-card-row"><div className="pp-card-key">Acknowledgment</div><div className="pp-card-val">Within 48 hours of receipt</div></div>
                <div className="pp-card-row"><div className="pp-card-key">Resolution Target</div><div className="pp-card-val">Within 30 days of acknowledgment</div></div>
              </div>
            </div>
            <p>
              If you are not satisfied with the resolution provided by our
              Grievance Officer, you have the right to escalate your complaint to
              the Data Protection Board of India under Section 18 of the DPDP Act,
              2023.
            </p>
          </div>

          {/* 18. Changes */}
          <div className="pp-section" id="s18">
            <span className="pp-section-num">Section 18</span>
            <h2>Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we make
              material changes, we will:
            </p>
            <ul>
              <li>Post the updated Policy on pramaan.gadgetguruz.com with a revised Effective Date and version number</li>
              <li>Display an in-app notification in PRAMAAN and/or send an email notification to registered users for significant changes</li>
              <li>Seek fresh and explicit consent where new or expanded processing activities require it under the DPDP Act</li>
            </ul>
            <p>
              Continued use of PRAMAAN after the Effective Date of any revision
              constitutes your acceptance of the updated Policy.
            </p>
          </div>

          {/* 19. Contact */}
          <div className="pp-section" id="s19">
            <span className="pp-section-num">Section 19</span>
            <h2>Contact Us</h2>
            <p>
              For any questions, requests, or concerns about this Privacy Policy
              or PRAMAAN&apos;s data practices:
            </p>
            <div className="pp-contact-grid">
              <div className="pp-contact-item">
                <div className="label">Privacy &amp; Data Requests</div>
                <div className="value"><a href="mailto:privacy@gadgetguruz.com">privacy@gadgetguruz.com</a></div>
              </div>
              <div className="pp-contact-item">
                <div className="label">General Support</div>
                <div className="value"><a href="mailto:support@gadgetguruz.com">support@gadgetguruz.com</a></div>
              </div>
              <div className="pp-contact-item">
                <div className="label">Website</div>
                <div className="value"><a href="https://pramaan.gadgetguruz.com" target="_blank" rel="noreferrer">pramaan.gadgetguruz.com</a></div>
              </div>
              <div className="pp-contact-item">
                <div className="label">EULA</div>
                <div className="value"><a href="https://pramaan.gadgetguruz.com/eula.php" target="_blank" rel="noreferrer">pramaan.gadgetguruz.com/eula.php</a></div>
              </div>
              <div className="pp-contact-item">
                <div className="label">Enterprise DPA Request</div>
                <div className="value"><a href="mailto:privacy@gadgetguruz.com">privacy@gadgetguruz.com</a><br /><small style={{ fontWeight: 400, color: "#718096" }}>Subject: &apos;PRAMAAN Enterprise DPA Request&apos;</small></div>
              </div>
              <div className="pp-contact-item">
                <div className="label">Privacy Policy URL</div>
                <div className="value"><a href="https://pramaan.gadgetguruz.com/privacy-policy.php" target="_blank" rel="noreferrer">pramaan.gadgetguruz.com/privacy-policy.php</a></div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
