import path from 'path';
import type { NextConfig } from 'next';

/**
 * Student portal — built as a static export for S3 + CloudFront.
 *
 * `output: 'export'` writes plain HTML/JS/CSS to `out/`, which is what makes the
 * SEO and AEO requirement achievable: crawlers get real HTML per route instead of
 * an empty shell. It also means there is no Node server to run or pay for.
 *
 * Three consequences that are easy to trip over:
 *
 * 1. **No dynamic route segments.** Static export must enumerate every URL at
 *    build time, and booking ids / attempt ids / certificate numbers only exist at
 *    runtime. Those routes take their id from the query string instead — see
 *    `src/lib/route-params.tsx`.
 * 2. **`headers()` is silently dropped.** It is not an error, it just stops
 *    existing, which would have quietly removed the three security headers. They
 *    are enforced at the edge instead, by the CloudFront response-headers policy
 *    in `infra/terraform/modules/s3-cloudfront/main.tf`.
 * 3. **The image optimiser needs a server.** `unoptimized: true` turns it off.
 */
const nextConfig: NextConfig = {
    output: 'export',
    reactStrictMode: true,

    // S3 serves `about/index.html` for `/about/`. Without this, export emits
    // `about.html`, which S3 will not serve at `/about`.
    trailingSlash: true,

    images: { unoptimized: true },

    // This app lives inside a monorepo. Left to itself Next walks up and picks the
    // repository's pnpm-lock.yaml as the workspace root, then traces files from the
    // wrong directory. Pin it to this app. (Task P-4.)
    outputFileTracingRoot: path.join(__dirname),

    env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
        NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000',
    },

    // NOTE: `async headers()` deliberately removed — static export drops it. The
    // X-Frame-Options, X-Content-Type-Options and Referrer-Policy headers are set
    // by the CloudFront response-headers policy. Do not re-add them here and
    // assume they are live.
};

export default nextConfig;
