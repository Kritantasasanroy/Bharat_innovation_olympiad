/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    eslint: {
        ignoreDuringBuilds: true,
    },
    env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
    },
    async redirects() {
        return [
            // Partner review merged into the shared Access Requests queue, which
            // now covers schools too. Done here rather than with a page calling
            // `redirect()`: a prerendered page ships an error shell and only
            // redirects once JS runs, where this is a real Location response.
            { source: '/partners', destination: '/access', permanent: false },
        ];
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
