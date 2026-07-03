import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root to this app so Next.js stops inferring the parent
  // web/ directory as the workspace root (which pulled in its Tailwind config).
  outputFileTracingRoot: __dirname,
  // Turbopack resolves its own root separately from outputFileTracingRoot; pin it
  // too so `next dev` doesn't infer src/app as the workspace root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
