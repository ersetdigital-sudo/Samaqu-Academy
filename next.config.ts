import type { NextConfig } from 'next';

// Sandbox preview only (BASE44_PREVIEW_MODE=1): the preview proxy serves the app
// from https://3000-<public host suffix>, so the dev server must accept that origin
// for its dev assets / HMR. Unset (or any other value) keeps the original config.
const previewMode = process.env.BASE44_PREVIEW_MODE === '1';
const previewOrigin = process.env.BASE44_PUBLIC_HOST_SUFFIX
  ? `3000-${process.env.BASE44_PUBLIC_HOST_SUFFIX}`
  : null;

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  ...(previewMode && previewOrigin ? { allowedDevOrigins: [previewOrigin] } : {}),
};

export default nextConfig;
