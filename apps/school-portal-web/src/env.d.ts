// Ambient typing for the browser-exposed environment variables this app reads.
// Next.js only inlines `NEXT_PUBLIC_*` vars referenced as plain dot-access
// (`process.env.NEXT_PUBLIC_X`), so they are declared explicitly here.
declare namespace NodeJS {
	interface ProcessEnv {
		readonly NEXT_PUBLIC_API_URL?: string;
		readonly NEXT_PUBLIC_SCHOOL_SUPPORT_EMAIL?: string;
	}
}
