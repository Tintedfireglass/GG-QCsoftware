// store-website uses Bootstrap, not Tailwind. This empty config exists so Next.js
// does not walk up to the parent web/ postcss.config.mjs (which requires
// @tailwindcss/postcss, a package not installed here).
const config = {
  plugins: {},
};

export default config;
