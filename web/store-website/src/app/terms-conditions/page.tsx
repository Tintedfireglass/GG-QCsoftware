import type { Metadata } from "next";
import HeaderInternal from "@/components/HeaderInternal";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms and Conditions - PRAMAAN",
  description:
    "Terms and Conditions for using Pramaan device health testing software. Read our terms of service.",
  keywords: "Pramaan terms, conditions, software license, device testing terms",
  alternates: { canonical: "/terms-conditions" },
};

export default function TermsConditionsPage() {
  return (
    <>
      <HeaderInternal />

      <div className="container my-5">
        <div className="row">
          <div className="col-lg-10 mx-auto">
            <h1 className="mb-4">Terms and Conditions</h1>
            <p className="text-muted mb-4">
              <strong>Effective Date:</strong> 10.3.2026
            </p>

            <div className="content">
              <p>
                These Terms and Conditions (&quot;Terms&quot;) govern the use of
                Pramaan, a device diagnostics and health testing software
                developed and operated by Gadget Guruz Private Limited
                (&quot;Gadget Guruz&quot;, &quot;we&quot;, &quot;us&quot;, or
                &quot;our&quot;).
              </p>

              <p>
                By accessing, installing, or using Pramaan, you agree to comply
                with and be bound by these Terms. If you do not agree with these
                Terms, you must not use the software.
              </p>

              <h2>1. About Pramaan</h2>
              <p>
                Pramaan is a device diagnostics and health testing software
                designed to evaluate the performance, condition, and
                functionality of electronic devices including but not limited
                to:
              </p>
              <ul>
                <li>Laptops</li>
                <li>Desktop computers</li>
                <li>Mobile devices</li>
                <li>Tablets</li>
                <li>Other supported electronic hardware</li>
              </ul>
              <p>
                The software provides diagnostic tools, quality control reports,
                and device health insights.
              </p>

              <h2>2. Eligibility</h2>
              <p>By using Pramaan, you confirm that:</p>
              <ul>
                <li>You are at least 18 years of age, or</li>
                <li>
                  You are authorized to use the software on behalf of a business
                  or organization.
                </li>
              </ul>
              <p>
                Enterprise users must ensure that their employees comply with
                these Terms.
              </p>

              <h2>3. Software License</h2>
              <p>
                Gadget Guruz grants you a limited, non-exclusive,
                non-transferable, revocable license to install and use Pramaan
                solely for the purpose of device diagnostics and testing.
              </p>
              <p>You may not:</p>
              <ul>
                <li>Copy, distribute, or resell the software</li>
                <li>Reverse engineer or modify the software</li>
                <li>Use the software for unlawful purposes</li>
                <li>Attempt to access restricted system components</li>
                <li>Use the software to damage devices intentionally</li>
              </ul>
              <p>
                All intellectual property rights remain the property of Gadget
                Guruz Private Limited.
              </p>

              <h2>4. Acceptable Use</h2>
              <p>
                You agree to use Pramaan only for legitimate diagnostic and
                device testing purposes.
              </p>
              <p>You must not:</p>
              <ul>
                <li>Use the software to conduct unauthorized surveillance</li>
                <li>Manipulate diagnostic results</li>
                <li>Interfere with the platform&apos;s security</li>
                <li>Use automated systems to abuse the platform</li>
                <li>Attempt to bypass licensing restrictions</li>
              </ul>
              <p>Violation of these rules may result in termination of access.</p>

              <h2>5. Diagnostic Results Disclaimer</h2>
              <p>
                Pramaan provides automated diagnostic assessments based on system
                tests and device parameters.
              </p>
              <p>While we strive to ensure accuracy:</p>
              <ul>
                <li>Diagnostic results are informational only</li>
                <li>
                  They should not be considered a guarantee of device performance
                </li>
                <li>
                  Gadget Guruz does not guarantee that diagnostic results are
                  error-free
                </li>
              </ul>
              <p>
                Users should apply professional judgment before making repair or
                purchase decisions based on the reports.
              </p>

              <h2>6. Enterprise Usage</h2>
              <p>
                Organizations using Pramaan may deploy the software across
                multiple devices.
              </p>
              <p>Enterprise administrators are responsible for:</p>
              <ul>
                <li>Managing user access</li>
                <li>Monitoring device diagnostics</li>
                <li>Ensuring compliance with company policies</li>
                <li>Protecting access credentials</li>
              </ul>
              <p>
                Pramaan may provide dashboards for device health monitoring and
                analytics.
              </p>

              <h2>7. Software Updates</h2>
              <p>We may release updates, patches, or improvements to the software.</p>
              <p>These updates may include:</p>
              <ul>
                <li>New diagnostic modules</li>
                <li>Security updates</li>
                <li>Performance improvements</li>
                <li>Bug fixes</li>
              </ul>
              <p>Continued use of the software may require installing updates.</p>

              <h2>8. Availability of Service</h2>
              <p>
                While we strive for continuous availability, we do not guarantee
                that Pramaan will operate without interruption or errors.
              </p>
              <p>The service may be temporarily unavailable due to:</p>
              <ul>
                <li>System maintenance</li>
                <li>Technical failures</li>
                <li>Infrastructure upgrades</li>
                <li>External service disruptions</li>
              </ul>

              <h2>9. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, Gadget Guruz shall not be
                liable for:
              </p>
              <ul>
                <li>Device damage caused during testing</li>
                <li>Business losses</li>
                <li>Data loss</li>
                <li>Indirect or consequential damages</li>
                <li>Decisions made based on diagnostic reports</li>
              </ul>
              <p>Users run diagnostics at their own discretion and responsibility.</p>

              <h2>10. Data and Privacy</h2>
              <p>
                Use of Pramaan is also governed by our Privacy Policy, which
                explains how device information and diagnostic data are collected
                and used.
              </p>
              <p>
                By using Pramaan, you consent to the data practices described in
                the Privacy Policy.
              </p>

              <h2>11. Suspension or Termination</h2>
              <p>
                We reserve the right to suspend or terminate access to Pramaan
                if:
              </p>
              <ul>
                <li>These Terms are violated</li>
                <li>The software is used for illegal activities</li>
                <li>Security threats are detected</li>
                <li>Licensing terms are breached</li>
              </ul>

              <h2>12. Intellectual Property</h2>
              <p>
                All software, branding, technology, and materials related to
                Pramaan are the intellectual property of Gadget Guruz Private
                Limited.
              </p>
              <p>
                Unauthorized use, reproduction, or distribution is strictly
                prohibited.
              </p>

              <h2>13. Third-Party Components</h2>
              <p>Pramaan may incorporate third-party technologies or services.</p>
              <p>
                These components are governed by their respective licenses and
                policies.
              </p>

              <h2>14. Changes to These Terms</h2>
              <p>We may update these Terms from time to time.</p>
              <p>
                Updated Terms will be posted on the website with a revised
                effective date.
              </p>
              <p>
                Continued use of Pramaan after updates constitutes acceptance of
                the revised Terms.
              </p>

              <h2>15. Governing Law</h2>
              <p>
                These Terms shall be governed by and interpreted in accordance
                with the laws of India.
              </p>
              <p>
                Any disputes arising from the use of Pramaan shall be subject to
                the jurisdiction of the courts located in New Delhi, India.
              </p>

              <h2>16. Contact Information</h2>
              <p>For questions regarding these Terms, please contact:</p>
              <p>
                <strong>Gadget Guruz Private Limited</strong>
                <br />
                Website: <a href="https://gadgetguruz.com">https://gadgetguruz.com</a>
                <br />
                Email:{" "}
                <a href="mailto:support@gadgetguruz.com">
                  support@gadgetguruz.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
