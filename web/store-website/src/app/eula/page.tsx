import type { Metadata } from "next";
import Link from "next/link";
import HeaderInternal from "@/components/HeaderInternal";
import Footer from "@/components/Footer";
import "./eula.css";

export const metadata: Metadata = {
  title: "End User License Agreement (EULA) - PRAMAAN",
  description:
    "End User License Agreement for Pramaan device health testing software. Read the software license terms.",
  keywords:
    "Pramaan EULA, software license, end user agreement, license terms",
  alternates: { canonical: "/eula" },
};

export default function EulaPage() {
  return (
    <>
      <HeaderInternal />

      <div className="container py-5">
        <div className="row">
          <div className="col-lg-10 mx-auto">
            <div className="terms-content">
              <h1>End User License Agreement (EULA) – Pramaan</h1>

              <div className="effective-date">
                <strong>Effective Date: 10.3.2026</strong>
              </div>

              <p>
                This End User License Agreement (&quot;Agreement&quot;) is a
                legal agreement between you (&quot;User&quot;, &quot;You&quot;)
                and Gadget Guruz Private Limited (&quot;Gadget Guruz&quot;,
                &quot;Company&quot;, &quot;We&quot;, &quot;Us&quot;) for the use
                of the Pramaan diagnostic software and related services.
              </p>

              <div className="important-notice">
                <strong>
                  By installing, accessing, or using Pramaan, you agree to be
                  bound by the terms of this Agreement. If you do not agree, do
                  not install or use the software.
                </strong>
              </div>

              <h2>1. License Grant</h2>
              <p>
                Gadget Guruz grants you a limited, non-exclusive,
                non-transferable, revocable license to install and use Pramaan
                solely for the purpose of:
              </p>
              <ul>
                <li>Running device diagnostics</li>
                <li>Performing hardware health tests</li>
                <li>Generating device QC reports</li>
                <li>Monitoring device health</li>
              </ul>
              <p>
                The license is provided for personal, technician, or business
                use depending on the license purchased.
              </p>

              <h2>2. Ownership</h2>
              <p>Pramaan is licensed, not sold.</p>
              <p>All intellectual property rights including:</p>
              <ul>
                <li>Software code</li>
                <li>Diagnostic algorithms</li>
                <li>User interface</li>
                <li>Documentation</li>
                <li>Branding</li>
              </ul>
              <p>remain the exclusive property of Gadget Guruz Private Limited.</p>

              <h2>3. Permitted Use</h2>
              <p>You may use Pramaan to:</p>
              <ul>
                <li>Test hardware performance</li>
                <li>Diagnose device issues</li>
                <li>Generate quality reports</li>
                <li>Assess device health</li>
              </ul>
              <p>
                You may install the software only on the number of devices
                permitted under your license.
              </p>

              <h2>4. Restrictions</h2>
              <p>You may not:</p>
              <ul>
                <li>Reverse engineer, decompile, or modify the software</li>
                <li>Distribute or resell the software without authorization</li>
                <li>Use the software for illegal purposes</li>
                <li>Bypass licensing or activation mechanisms</li>
                <li>Attempt to access protected components of the platform</li>
              </ul>
              <p>
                <strong>
                  Violation of these restrictions may result in termination of
                  the license.
                </strong>
              </p>

              <h2>5. Diagnostic Disclaimer</h2>
              <p>
                Pramaan performs automated diagnostics based on system-level
                testing.
              </p>
              <p>While the software aims to provide reliable results:</p>
              <ul>
                <li>Diagnostic results are informational only</li>
                <li>Results may vary depending on hardware condition</li>
                <li>
                  The software does not guarantee device performance or
                  reliability
                </li>
                <li>
                  Users should apply professional judgment when using the
                  results.
                </li>
              </ul>

              <h2>6. Updates and Improvements</h2>
              <p>Gadget Guruz may release updates that include:</p>
              <ul>
                <li>Security improvements</li>
                <li>Additional device testing modules</li>
                <li>Performance enhancements</li>
                <li>Bug fixes</li>
              </ul>
              <p>Updates may be required to continue using the software.</p>

              <h2>7. Data Collection</h2>
              <p>
                Pramaan may collect device diagnostic information and usage data
                required for the functioning of the software.
              </p>
              <p>
                For details on data handling practices, please refer to the{" "}
                <Link href="/privacy-policy">Pramaan Privacy Policy</Link>.
              </p>

              <h2>8. Termination</h2>
              <p>This Agreement will remain in effect until terminated.</p>
              <p>Gadget Guruz may terminate the license if:</p>
              <ul>
                <li>The user violates this Agreement</li>
                <li>Unauthorized software usage is detected</li>
                <li>Licensing terms are breached</li>
              </ul>
              <p>
                Upon termination, the user must uninstall and stop using the
                software.
              </p>

              <h2>9. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, Gadget Guruz shall not be
                liable for:
              </p>
              <ul>
                <li>Hardware damage resulting from testing</li>
                <li>Loss of business or profits</li>
                <li>Data loss</li>
                <li>Decisions made based on diagnostic results</li>
              </ul>
              <p>
                <strong>The software is used at the user&apos;s own risk.</strong>
              </p>

              <h2>10. Governing Law</h2>
              <p>This Agreement shall be governed by the laws of India.</p>
              <p>
                Any disputes shall fall under the jurisdiction of courts located
                in New Delhi, India.
              </p>

              <h2>11. Contact</h2>
              <p>For licensing questions or support:</p>
              <p>
                <strong>Gadget Guruz Private Limited</strong>
                <br />
                Website:{" "}
                <a href="https://gadgetguruz.com" target="_blank" rel="noreferrer">
                  https://gadgetguruz.com
                </a>
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
