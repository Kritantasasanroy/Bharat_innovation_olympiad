import cors from "@elysiajs/cors";

export const corsPlugin = cors({
	origin: process.env["CORS_ORIGIN"] ?? true,
});
