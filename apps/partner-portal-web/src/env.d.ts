// Explicit `ProcessEnv` augmentation for this app's public env vars.
//
// Two constraints are in tension without this: the root tsconfig's
// `noPropertyAccessFromIndexSignature` wants bracket access
// (`process.env["X"]`) for anything typed only via `NodeJS.ProcessEnv`'s
// index signature, but Next.js's build-time inlining of `NEXT_PUBLIC_*`
// vars only recognizes the plain dot-access form (`process.env.X`) — it
// does not statically analyze bracket/dynamic access. Declaring these as
// named (not indexed) properties satisfies the strict lint rule while
// keeping the dot-access Next.js requires.
declare namespace NodeJS {
	interface ProcessEnv {
		readonly NEXT_PUBLIC_PORTAL_API_URL?: string;
		/** Legacy backend base URL — owns partner apply + login (the only JWT signer). */
		readonly NEXT_PUBLIC_API_URL?: string;
		readonly NEXT_PUBLIC_PARTNER_SUPPORT_EMAIL?: string;
	}
}
