export type BioRole = "student" | "guardian" | "curator" | "admin" | "ops" | "service";

export interface AuthClaims {
	readonly subjectId: string;
	readonly role: BioRole;
	readonly consentVersion?: string;
	readonly issuedAt: number;
	readonly expiresAt: number;
}

export interface AuthorizationPolicy {
	canBookSlot(claims: AuthClaims): boolean;
	canStartAttempt(claims: AuthClaims): boolean;
	canEditQuestion(claims: AuthClaims): boolean;
	canPublishExam(claims: AuthClaims): boolean;
	canViewProctorReport(claims: AuthClaims): boolean;
}
