import type { Metadata } from "next";
import HeaderInternal from "@/components/HeaderInternal";
import Footer from "@/components/Footer";
import "./enterprise-license.css";

export const metadata: Metadata = {
  title: "Enterprise License Agreement (ELA) - PRAMAAN",
  description:
    "Enterprise License Agreement for Pramaan device health testing software. Learn about enterprise licensing terms.",
  keywords:
    "Pramaan enterprise license, ELA, business license, enterprise agreement",
  alternates: { canonical: "/enterprise-license" },
};

export default function EnterpriseLicensePage() {
  return (
    <>
      <HeaderInternal />

      <div className="container py-5">
        <div className="row">
          <div className="col-lg-10 mx-auto">
            <div className="ela-content">
              <h1>Enterprise License Agreement (ELA)</h1>

              <div className="effective-date">
                <strong>Effective Date: 10.3.2026</strong>
              </div>

              <div className="enterprise-notice">
                <h5>
                  <i className="fas fa-building"></i> Enterprise Agreement
                </h5>
                <p className="mb-0">
                  This Enterprise License Agreement (&quot;Agreement&quot;) is
                  entered into between Gadget Guruz Private Limited
                  (&quot;Provider&quot;) and the Enterprise Customer
                  (&quot;Customer&quot;) for the use of Pramaan enterprise
                  diagnostic software and services.
                </p>
              </div>

              <h2>1. License Scope</h2>
              <p>
                Gadget Guruz grants the Customer a non-exclusive,
                non-transferable license to deploy Pramaan across the
                organization&apos;s devices for purposes including:
              </p>
              <ul>
                <li>IT asset health monitoring</li>
                <li>Hardware diagnostics</li>
                <li>Device lifecycle management</li>
                <li>Quality control testing</li>
              </ul>
              <p>The license may be based on:</p>
              <ul>
                <li>Number of devices</li>
                <li>Number of technicians</li>
                <li>Organization-wide deployment</li>
              </ul>
              <p>as defined in the commercial agreement.</p>

              <h2>2. Enterprise Dashboard Access</h2>
              <p>
                Enterprise customers may receive access to an administrative
                dashboard that enables:
              </p>
              <ul>
                <li>Device health monitoring</li>
                <li>Diagnostic reports</li>
                <li>Device inventory insights</li>
                <li>Asset lifecycle analytics</li>
              </ul>
              <p>
                Access to the dashboard must be managed by authorized
                administrators.
              </p>

              <h2>3. Responsibilities of the Enterprise</h2>
              <p>The Customer agrees to:</p>
              <ul>
                <li>Ensure authorized use by employees</li>
                <li>Protect login credentials</li>
                <li>Prevent unauthorized distribution of the software</li>
                <li>Comply with applicable data protection laws</li>
              </ul>

              <h2>4. Data Ownership</h2>
              <p>
                Device diagnostic data generated through Pramaan remains the
                property of the Enterprise Customer.
              </p>
              <p>However, Gadget Guruz may use anonymized diagnostic data to:</p>
              <ul>
                <li>Improve diagnostic algorithms</li>
                <li>Enhance testing accuracy</li>
                <li>Improve software performance</li>
              </ul>

              <h2>5. Implementation and Setup</h2>
              <p>Gadget Guruz may provide implementation support including:</p>
              <ul>
                <li>Software deployment</li>
                <li>Configuration assistance</li>
                <li>Technician onboarding</li>
                <li>Integration guidance</li>
              </ul>
              <p>Specific services may be defined in the enterprise contract.</p>

              <h2>6. Service Availability</h2>
              <p>
                Gadget Guruz will make reasonable efforts to maintain service
                availability but does not guarantee uninterrupted operation.
              </p>
              <p>Temporary downtime may occur due to:</p>
              <ul>
                <li>Maintenance</li>
                <li>Infrastructure updates</li>
                <li>Technical failures</li>
              </ul>

              <h2>7. Security</h2>
              <p>
                Gadget Guruz follows industry-standard practices to protect
                enterprise data, including:
              </p>
              <ul>
                <li>Secure data transmission</li>
                <li>Role-based access control</li>
                <li>Authentication mechanisms</li>
              </ul>

              <h2>8. Fees and Payment</h2>
              <p>Enterprise licensing fees may be based on:</p>
              <ul>
                <li>Per device license</li>
                <li>Per technician license</li>
                <li>Organization-wide deployment</li>
              </ul>
              <p>
                Payment terms will be defined in the enterprise agreement or
                purchase order.
              </p>

              <h2>9. Term and Termination</h2>
              <p>
                This Agreement remains active for the duration of the
                subscription or license period.
              </p>
              <p>Either party may terminate the agreement if:</p>
              <ul>
                <li>Terms are breached</li>
                <li>Payment obligations are not met</li>
                <li>Security misuse occurs</li>
              </ul>
              <p>
                Upon termination, the Customer must discontinue use of the
                software.
              </p>

              <h2>10. Limitation of Liability</h2>
              <p>
                To the extent permitted by law, Gadget Guruz shall not be liable
                for:
              </p>
              <ul>
                <li>Hardware damage resulting from diagnostics</li>
                <li>Loss of enterprise data</li>
                <li>Operational disruptions</li>
                <li>Indirect or consequential damages</li>
              </ul>

              <h2>11. Confidentiality</h2>
              <p>
                Both parties agree to maintain the confidentiality of proprietary
                information exchanged during the course of the agreement.
              </p>

              <h2>12. Governing Law</h2>
              <p>This Agreement shall be governed by the laws of India.</p>
              <p>
                Disputes shall be subject to the jurisdiction of courts located
                in New Delhi, India.
              </p>

              <h2>13. Contact</h2>
              <div className="contact-box">
                <p>
                  <strong>For enterprise licensing inquiries:</strong>
                </p>
                <p>
                  <strong>Gadget Guruz Private Limited</strong>
                  <br />
                  Email:{" "}
                  <a href="mailto:enterprise@gadgetguruz.com">
                    enterprise@gadgetguruz.com
                  </a>
                  <br />
                  Website:{" "}
                  <a
                    href="https://gadgetguruz.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    https://gadgetguruz.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
