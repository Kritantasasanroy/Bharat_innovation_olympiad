/** Environment-derived runtime configuration. Read once at process start. */
export interface Config {
	readonly port: number;
	readonly jwtSecret: string;
	/** Base URL of the `admin-api` partner engine (PRD-046), e.g. "http://localhost:4100". */
	readonly adminApiUrl: string;
	readonly corsOrigin: string | boolean;
	/** `mailto:` target shown as the dispute/contact link (PRD-011 — plain link, not a ticket system). */
	readonly partnerSupportEmail: string;
	/** Student app base URL used to build a campaign's shareable `?ref=` link. */
	readonly studentAppUrl: string;
}

export function loadConfig(): Config {
	return {
		port: Number(process.env["PORT"] ?? 3000),
		jwtSecret: process.env["JWT_SECRET"] ?? "",
		adminApiUrl: process.env["ADMIN_API_URL"] ?? "http://localhost:4100",
		corsOrigin: process.env["CORS_ORIGIN"] ?? true,
		partnerSupportEmail: process.env["PARTNER_SUPPORT_EMAIL"] ?? "partners@bio.example.com",
		studentAppUrl: process.env["STUDENT_APP_URL"] ?? "http://localhost:3000",
	};
}

export const config: Config = loadConfig();
