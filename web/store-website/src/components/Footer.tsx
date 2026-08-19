import Link from "next/link";
import { footer } from "@/data/content";
import { appUrl, hasApiBase } from "@/lib/api-base";

// Footer (ported from components/footer.php).
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer bg-dark text-white">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-md-6 col-12">
            <p>
              {year} {footer.copyrightText}
            </p>
          </div>
          <div className="col-md-6 col-12 text-md-end">
            {footer.links.map((link) => (
              <Link
                key={link.text}
                href={link.href}
                className="text-white text-decoration-none footer-link"
              >
                {link.text}
              </Link>
            ))}
            {/* The partner API reference is generated from the admin app's own
                code, so it is served there rather than duplicated here. */}
            {hasApiBase() && (
              <a
                href={appUrl("docs/api")}
                className="text-white text-decoration-none footer-link"
              >
                Developer API
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
