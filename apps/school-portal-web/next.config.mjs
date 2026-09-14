/** @type {import('next').NextConfig} */
// Served as a static export from S3 via the shared nginx tier on AWS.
// All pages are 'use client', no dynamic routes, no server code - exports cleanly.
const nextConfig = {
	output: "export",
	trailingSlash: true,
	images: { unoptimized: true },
};
export default nextConfig;
