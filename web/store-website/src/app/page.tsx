import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FaqAccordion from "@/components/FaqAccordion";
import PricingSection from "@/components/PricingSection";
import ContactForm from "@/components/ContactForm";
import {
  banner,
  keyFeatures,
  about,
  whoUses,
  certification,
  features,
  faqs,
  partnership,
} from "@/data/content";
import DownloadButton from "@/components/DownloadButton";
import { getDownloadOptions } from "@/lib/releases";

export const metadata: Metadata = {
  title: "Pramaan – Electronics Lifecycle Intelligence Platform",
  description:
    "Standardized testing, certification and device intelligence for repair, refurbishment, insurance and asset management.",
  keywords:
    "laptop diagnostic software, device health testing software, hardware testing software, laptop QC testing tool, device lifecycle analytics, laptop performance testing, hardware diagnostics tool, refurbished device testing, IT asset testing software",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  // Discover every published installer (per platform/arch) from the admin update
  // API for the download dropdowns. `downloadUrl` is the first option's link,
  // used where a single URL is needed (Free Trial CTA).
  const downloadOptions = await getDownloadOptions();
  const downloadUrl = downloadOptions[0]?.url;

  return (
    <>
      <Header />

      {/* Banner Section */}
      <section className="banner-section">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-8 col-12">
              <h1 className="banner-title">
                {banner.title}
                <br />
                <span className="text-purple">{banner.subtitle}</span>
              </h1>
            </div>
            <div className="col-lg-4 col-12 d-flex align-items-center">
              <div className="banner-content">
                <p>{banner.description}</p>
                <div className="gap-3">
                  <DownloadButton options={downloadOptions} ctaText={banner.downloadCtaText} />
                  <a href="#contact" className="book-demo-link">
                    Book a Demo <i className="fa fa-arrow-right" aria-hidden="true"></i>
                  </a>
                </div>
                <div className="runs-on">
                  <span className="runs-on-label">Runs on</span>
                  <ul className="runs-on-list">
                    <li>
                      <i className="fab fa-windows" aria-hidden="true"></i>
                      <span>Windows</span>
                    </li>
                    <li>
                      <i className="fab fa-apple" aria-hidden="true"></i>
                      <span>macOS</span>
                    </li>
                    <li>
                      <i className="fab fa-android" aria-hidden="true"></i>
                      <span>Android</span>
                    </li>
                    <li>
                      <i className="fab fa-linux" aria-hidden="true"></i>
                      <span>Linux</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Floating Dashboard Card */}
      <div className="floating-dashboard-wrapper">
        <div className="col-12">
          <div className="dashboard-screenshot">
            <img
              src={banner.dashboardImage}
              alt={banner.dashboardAlt}
              className="img-fluid"
            />
          </div>
        </div>
      </div>

      {/* Black Section with Key Features */}
      <section className="key-features-black">
        <div className="spacer"></div>
        <div className="container">
          <div className="row key-features-content">
            <div className="key-features-badge">
              <button className="btn">
                <i className="fa fa-chart-line"></i>
                {keyFeatures.badgeText}
              </button>
            </div>
            <div className="col-lg-6 col-md-12">
              <h2 className="text-white">{keyFeatures.title}</h2>
            </div>
            <div className="col-lg-6 col-md-12">
              <p className="text-light">{keyFeatures.description}</p>
            </div>
            <div className="col-lg-12">
              <div className="features-grid-icons">
                <div className="row">
                  {keyFeatures.features.map((feature) => (
                    <div className="col-lg-2 col-md-4 col-6" key={feature.text}>
                      <div className="feature-icon-item">
                        <img
                          src={feature.icon}
                          alt="Key Features Icon"
                          className="img-fluid"
                        />
                        <p className="text-white">{feature.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Pramaan Section */}
      <section className="about-pramaan-section" id="about">
        <div className="container">
          <div className="text-center">
            <p className="about-badge">
              <i className="fas fa-chart-line"></i>
              {about.badgeText}
            </p>
            <h2 className="about-title">{about.title}</h2>
            <p className="about-subtitle">{about.description}</p>
          </div>
          <div className="text-center about-image-wrapper">
            <video className="img-fluid about-video" controls autoPlay muted loop>
              <source src={about.video} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </section>

      {/* Who Uses Pramaan Section */}
      <section className="who-uses-pramaan-section">
        <div className="container">
          <p className="about-badge">
            <i className="fas fa-chart-line"></i>
            {whoUses.badgeText}
          </p>
          <h2 className="about-title">{whoUses.title}</h2>
          <div className="row g-4">
            {whoUses.users.map((user) => (
              <div className="col-md-6 col-lg-3" key={user.title}>
                <div className="user-card text-center">
                  <div className="user-icon">
                    <img src={user.image} alt={user.alt} className="img-fluid" />
                  </div>
                  <h5 className="user-title">{user.title}</h5>
                  <p className="user-description">{user.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Certification Section */}
      <section className="certification-section">
        <div className="container">
          <div className="row">
            <div className="col-md-3 col-12">
              <div className="reference-logo">
                <img
                  src={certification.logoImage}
                  alt={certification.logoAlt}
                  className="reference-logo-img"
                />
              </div>
            </div>
            <div className="col-md-5 col-12 reference-title">
              <h3>{certification.title}</h3>
            </div>
            <div className="col-md-4 col-12">
              <div className="refrence-download text-md-end text-center">
                <span>
                  <DownloadButton options={downloadOptions} ctaText={certification.downloadCtaText} />
                </span>
                <span className="download-text">
                  {certification.downloadText}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Features Section */}
      <section className="features-section" id="features">
        <div className="container">
          <div className="features-badge">
            <button className="btn">
              <i className="fa fa-chart-line"></i>
              {features.badgeText}
            </button>
          </div>
          <h2 className="features-heading">{features.title}</h2>
          <div className="row">
            {features.items.map((feature) => (
              <div className="col-md-6 col-lg-4 feature-border" key={feature.title}>
                <div className="feature-card text-center">
                  <div className="feature-card-icon">
                    <img
                      src={feature.image}
                      alt={feature.alt}
                      className="img-fluid"
                    />
                  </div>
                  <h5 className="feature-card-title">{feature.title}</h5>
                  <p className="feature-card-description">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <PricingSection downloadUrl={downloadUrl} />

      {/* FAQ Section */}
      <section className="faqs-section">
        <div className="container">
          <FaqAccordion
            items={faqs.items}
            limit={5}
            badgeText={faqs.badgeText}
            title={faqs.title}
          />
        </div>
      </section>

      {/* Partnership / Contact Section */}
      <section className="partnership-section" id="contact">
        <div className="container">
          <p className="partnership-badge">
            <i className="fas fa-address-book"></i>
            {partnership.badgeText}
          </p>
          <h2
            className="section-title"
            dangerouslySetInnerHTML={{ __html: partnership.title }}
          />
          <p>{partnership.description}</p>
          <div className="row align-items-center">
            <div className="col-lg-6 col-md-12 col-sm-12">
              <div className="cta-content">
                <ContactForm />
              </div>
            </div>
            <div className="col-lg-6 col-md-12 col-sm-12">
              <div className="all-center d-flex align-items-center justify-content-center">
                <img
                  src={partnership.image}
                  alt={partnership.imageAlt}
                  className="img-fluid d-none d-md-none d-lg-block"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
