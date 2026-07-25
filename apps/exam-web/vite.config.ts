import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		strictPort: true,
	},
	resolve: {
		alias: {
			"@features": "/src/features",
			"@shared": "/src/shared",
		},
	},
});
