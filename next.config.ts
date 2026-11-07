import type { NextConfig } from "next";

// The page loads scripts, styles and images from its own origin only, and the
// browser talks to this app alone: model requests go through /api/chat.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

// Development needs inline evaluation for fast refresh, and Vercel preview
// deployments load the Vercel Toolbar, so the policy applies to production only.
const enforceCsp =
  process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: enforceCsp
          ? [...securityHeaders, { key: "Content-Security-Policy", value: contentSecurityPolicy }]
          : securityHeaders,
      },
    ];
  },
};

export default nextConfig;
