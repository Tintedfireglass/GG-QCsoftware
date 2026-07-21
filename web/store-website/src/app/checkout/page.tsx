import type { Metadata } from "next";
import { Suspense } from "react";
import HeaderInternal from "@/components/HeaderInternal";
import Footer from "@/components/Footer";
import CheckoutClient from "@/components/CheckoutClient";
import "./checkout.css";

export const metadata: Metadata = {
  title: "Checkout - Pramaan Device Health Testing Software",
  description:
    "Choose your platforms and device counts, then complete your Pramaan license purchase.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/checkout" },
};

export default function CheckoutPage() {
  return (
    <>
      <HeaderInternal />
      <Suspense fallback={<div className="checkout-loading">Loading checkout…</div>}>
        <CheckoutClient />
      </Suspense>
      <Footer />
    </>
  );
}
