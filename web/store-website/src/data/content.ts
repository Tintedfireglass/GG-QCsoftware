// Content variables ported 1:1 from the original content.php.
// Image paths point at /assets/... served from web/public.

import { config } from "./config";

export interface NavItem {
  href: string;
  text: string;
}

export const header = {
  logoImage: "/assets/images/logo.svg",
  logoAlt: "PRAMAAN Logo",
  backLink: "https://gadgetguruz.com",
  backText: "Back to Gadget Guruz",
  navItems: [
    { href: "/#about", text: "About" },
    { href: "/#features", text: "Features" },
    { href: "/faq", text: "FAQ" },
    { href: "/#contact", text: "Contact" },
  ] as NavItem[],
};

export const banner = {
  title: "Device health",
  subtitle: "lifecycle monitoring software",
  description:
    "Test, certify and track the health of laptops, desktops and devices with automated diagnostics and QC reports.",
  downloadLink: config.DOWNLOAD_URL,
  downloadCtaText: "Download now",
  downloadText: "Trial verison for 7 days",
  dashboardImage: "/assets/images/banners/pramaan-ss.png",
  dashboardAlt: "PRAMAAN Dashboard Interface",
};

export const keyFeatures = {
  badgeText: "Why pramaan",
  title: "Comprehensive device health diagnostics",
  description:
    "Monitor key hardware metrics including CPU performance, memory health, storage integrity, battery status, thermal stability, and overall device performance score in one unified system.",
  features: [
    { icon: "/assets/images/why/c-1.svg", text: "CPU performance" },
    { icon: "/assets/images/why/c-2.svg", text: "Memory health" },
    { icon: "/assets/images/why/c-3.svg", text: "Storage integrity" },
    { icon: "/assets/images/why/c-4.svg", text: "Battery health" },
    { icon: "/assets/images/why/c-5.svg", text: "Thermal stability" },
    { icon: "/assets/images/why/c-6.svg", text: "Performance score" },
  ],
};

export const about = {
  badgeText: "About pramaan",
  title: "What is PRAMAAN",
  description:
    "PRAMAAN is a hardware diagnostics and device health testing software designed to evaluate the performance, stability and lifecycle health of electronic devices. it generates a device health report and QC certificate, enabling enterprises, technicians and refurbishers to make confident decisions about device reuse, resale or replacement.",
  video: "/assets/videos/pramaan-software.mp4",
  videoAlt: "PRAMAAN Dashboard",
};

export const whoUses = {
  badgeText: "Who is it for",
  title: "Who can use Pramaan ?",
  users: [
    {
      image: "/assets/images/users/img-1.svg",
      alt: "Technicians",
      title: "Technicians",
      description: "Quickly test laptops and devices before and after repair.",
    },
    {
      image: "/assets/images/users/img-2.svg",
      alt: "Enterprises",
      title: "Enterprises",
      description: "Audit the health of employee devices and IT assets.",
    },
    {
      image: "/assets/images/users/img-3.svg",
      alt: "Refurbishers",
      title: "Refurbishers",
      description: "Certify device quality before resale.",
    },
    {
      image: "/assets/images/users/img-4.svg",
      alt: "IT Administrators",
      title: "IT Administrators",
      description: "Track lifecycle health of company hardware.",
    },
  ],
};

export const certification = {
  logoImage: "/assets/images/pramaan-certified.png",
  logoAlt: "PRAMAAN Logo",
  title: "Get your device pramaan certified",
  downloadLink: config.DOWNLOAD_URL,
  downloadCtaText: "Download now",
  downloadText: "Trial verison for 7 days",
};

export const features = {
  badgeText: "Why pramaan",
  title: "Our features",
  items: [
    {
      image: "/assets/images/features/f-1.svg",
      alt: "Automated hardware test",
      title: "Automated hardware test",
      description: "Test CPU, RAM, storage, battery and system stability.",
    },
    {
      image: "/assets/images/features/f-2.svg",
      alt: "Stress testing",
      title: "Stress testing",
      description: "Simulate real-world workloads to identify failures.",
    },
    {
      image: "/assets/images/features/f-3.svg",
      alt: "Device health score",
      title: "Device health score",
      description: "Understand the overall condition of a device instantly.",
    },
    {
      image: "/assets/images/features/f-4.svg",
      alt: "QC certification",
      title: "QC certification",
      description: "Generate standardized health reports for devices.",
    },
    {
      image: "/assets/images/features/f-5.svg",
      alt: "Lifecycle monitoring",
      title: "Lifecycle monitoring",
      description:
        "Track device repair history and component condition over time.",
    },
    {
      image: "/assets/images/features/f-6.svg",
      alt: "Enterprise reporting",
      title: "Enterprise reporting",
      description: "Centralized dashboard for multiple devices.",
    },
  ],
};

export interface PricingPlan {
  title: string;
  subtitle: string;
  price: string;
  period: string;
  features: string[];
  ctaText: string;
  ctaClass: string;
  featured: boolean;
  badge?: string;
  ctaLink?: string;
  ctaModal?: string;
}

export const pricing = {
  badgeText: "OUR PRICING",
  title: "Transparent Pricing for Device Health",
  plans: [
    {
      title: "Free Trial",
      subtitle: "Perfect for trying out basic features.",
      price: `${config.CURRENCY_SYMBOL}0`,
      period: "",
      features: [
        "7-day free trial",
        "Basic QC of laptop/desktop/server",
        "Automated testing",
        "System health report",
        "Customer support",
      ],
      ctaText: "Start Free Trial",
      ctaLink: config.DOWNLOAD_URL,
      ctaClass: "pricing-btn-outline",
      featured: false,
    },
    {
      title: "Basic",
      subtitle: "Cost Effective 1 month subscription plan.",
      price: `${config.CURRENCY_SYMBOL}49`,
      period: "/ month",
      features: [
        "Everything in Free Trial",
        "1 Month subscription",
        "Lifecycle monitoring",
        "QC certification",
        "Advanced hardware diagnostics",
      ],
      ctaText: "Buy Now",
      ctaModal: "buyMonthlyModal",
      ctaClass: "pricing-btn-outline",
      featured: false,
    },
    {
      title: "Professional",
      subtitle: "For growing teams and active monitoring.",
      price: `${config.CURRENCY_SYMBOL}${config.PRICE_PER_UNIT}`,
      period: "/ lifetime",
      features: [
        "Everything in Free Trial",
        "Lifecycle monitoring",
        "Enterprise reporting",
        "QC certification",
        "Advanced hardware diagnostics",
      ],
      ctaText: "Buy Now",
      ctaModal: "buyNowModal",
      ctaClass: "pricing-btn-primary",
      featured: true,
      badge: "Recommended",
    },
    {
      title: "Enterprise",
      subtitle: "Custom solutions for large scale operations.",
      price: "Custom",
      period: "",
      features: [
        "Full dashboard integration",
        "Customization possible",
        "API access",
        "Priority support",
        "Dedicated account manager",
      ],
      ctaText: "Connect with us",
      ctaLink: "/#contact",
      ctaClass: "pricing-btn-outline",
      featured: false,
    },
  ] as PricingPlan[],
};

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const faqs = {
  badgeText: "FAQs",
  title: "Frequently asked questions",
  items: [
    {
      id: "faq1",
      question: "What is Pramaan device diagnostics software?",
      answer:
        "Pramaan is an automated device diagnostics and certification platform that evaluates the health and condition of laptops and computers using hardware-level tests. It generates a device health score, certification report, and lifecycle record.",
    },
    {
      id: "faq2",
      question: "How does Pramaan check the health of a laptop or computer?",
      answer:
        "Pramaan runs automated hardware diagnostics including CPU stress tests, thermal monitoring, battery health analysis, storage SMART tests, and OS integrity checks.",
    },
    {
      id: "faq3",
      question: "Can Pramaan detect hidden issues in refurbished laptops?",
      answer:
        "Yes. It detects issues like thermal throttling, battery degradation, storage reliability problems, and performance instability using stress tests and telemetry analysis.",
    },
    {
      id: "faq4",
      question: "Who should use Pramaan device certification software?",
      answer:
        "IT asset managers, enterprises, refurbishers, recyclers, technicians, and insurance providers.",
    },
    {
      id: "faq5",
      question: "How does Pramaan help enterprises manage IT assets?",
      answer:
        "It enables automated diagnostics and lifecycle tracking, helping organizations make decisions about redeployment, resale, or recycling.",
    },
    {
      id: "faq6",
      question: "Can Pramaan help determine resale value?",
      answer:
        "Yes. It uses hardware health, battery status, and performance data to estimate resale or buyback value.",
    },
    {
      id: "faq7",
      question: "How does Pramaan help insurance companies?",
      answer:
        "It provides a device health score to classify risk before issuing insurance coverage.",
    },
    {
      id: "faq8",
      question: "Can Pramaan be used remotely?",
      answer:
        "Yes. Diagnostics run locally and reports can be shared remotely for verification.",
    },
    {
      id: "faq9",
      question: "Does Pramaan generate certification reports?",
      answer:
        "Yes. Each test generates a report with a unique certificate ID and QR verification.",
    },
    {
      id: "faq10",
      question: "How is Pramaan different from other tools?",
      answer:
        "It provides standardized health scores, lifecycle records, certification reports, and risk insights—not just raw data.",
    },
    {
      id: "faq11",
      question: "Can Pramaan track lifecycle and repair history?",
      answer:
        "Yes. It maintains diagnostic history, repair logs, and hardware changes.",
    },
    {
      id: "faq12",
      question: "Is Pramaan useful for large-scale audits?",
      answer: "Yes. It supports bulk diagnostics across thousands of devices.",
    },
    {
      id: "faq13",
      question: "Does Pramaan access personal files?",
      answer:
        "No. It only collects hardware-level diagnostics and performance metrics.",
    },
    {
      id: "faq14",
      question: "Is Pramaan spying on users?",
      answer: "No. It does not track user activity or personal data.",
    },
    {
      id: "faq15",
      question: "What data does Pramaan collect?",
      answer:
        "Only system-level data like CPU performance, thermal readings, battery health, storage SMART data, and configuration details.",
    },
    {
      id: "faq16",
      question: "How does Pramaan test storage health?",
      answer:
        "It uses SMART diagnostics to evaluate sector health, error rates, and read/write reliability.",
    },
    {
      id: "faq17",
      question: "Does Pramaan scan hard drive content?",
      answer: "No. It does not read or scan personal or business files.",
    },
    {
      id: "faq18",
      question: "Is Pramaan safe for enterprise use?",
      answer:
        "Yes. It performs non-invasive diagnostics suitable for enterprise environments.",
    },
    {
      id: "faq19",
      question: "Does Pramaan send data externally?",
      answer:
        "Only diagnostic data needed for reports is transmitted. No personal data is shared.",
    },
    {
      id: "faq20",
      question: "Is Pramaan safe for production systems?",
      answer:
        "Yes. It runs controlled tests that do not harm hardware or data.",
    },
    {
      id: "faq21",
      question: "Can Pramaan detect repairs or modifications?",
      answer:
        "Yes. It compares hardware configuration with past records to detect changes.",
    },
    {
      id: "faq22",
      question: "Can Pramaan run bulk diagnostics?",
      answer:
        "Yes. It supports enterprise-scale diagnostics across multiple devices.",
    },
    {
      id: "faq23",
      question: "How does Pramaan help lifecycle planning?",
      answer:
        "It identifies devices for reuse, repair, resale, or recycling based on health scores.",
    },
    {
      id: "faq24",
      question: "Can Pramaan be used before selling or donating devices?",
      answer:
        "Yes. It provides certification reports to verify device condition.",
    },
    {
      id: "faq25",
      question: "Does Pramaan integrate with ITAM workflows?",
      answer:
        "Yes. It supports audits, lifecycle tracking, and asset evaluation processes.",
    },
    {
      id: "faq26",
      question: "Can Pramaan reduce fraud in refurbished devices?",
      answer: "Yes. It provides objective health reports with QR verification.",
    },
    {
      id: "faq27",
      question:
        "Can Pramaan help prepare devices for resale or recycling?",
      answer:
        "Yes. It helps assess device condition and decide next steps like resale, refurbish, or recycle.",
    },
  ] as FaqItem[],
};

export const partnership = {
  badgeText: "Contact us",
  title: "Start Testing Devices<br>with Pramaan",
  description:
    "Run automated diagnostics and generate certified device health reports in minutes.",
  image: "/assets/images/partners/partners.svg",
  imageAlt: "Partner with us",
  recaptchaKey: config.RECAPTCHA_SITE_KEY,
};

export const footer = {
  copyrightText: "GadgetGuruz. All rights reserved.",
  links: [
    { href: "/privacy-policy", text: "Privacy Policy" },
    { href: "/eula", text: "EULA" },
    { href: "/terms-conditions", text: "Terms & Conditions" },
    { href: "/enterprise-license", text: "Enterprise License" },
  ] as NavItem[],
};

export const payment = {
  title: "Order PRAMAAN",
  amount: config.PRICE_PER_UNIT,
  currency: config.CURRENCY_SYMBOL,
};
