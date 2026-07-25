/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export so the app can be hosted anywhere free (Vercel/Netlify/GitHub
  // Pages) and served from the Electron desktop shell without a Node server.
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
