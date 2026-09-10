/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,

    // Ships as a container on EC2 (t4g.small) behind the ALB, not as a static
    // export: this app keeps `redirects()` and has dynamic route segments, both of
    // which static export silently drops. See OPEN-QUESTIONS.md section 2.
    //
    // `standalone` emits a self-contained server bundle with only the node_modules
    // actually reached, which cuts the image by roughly 80%.
    output: 'standalone',
    eslint: {
        ignoreDuringBuilds: true,
    },
    env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
    },
    async redirects() {
        return [];
    },
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                ],
            },
        ];
    },
};

export default nextConfig;
