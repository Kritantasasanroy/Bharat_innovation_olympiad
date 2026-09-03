import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    NotFoundException,
    UnauthorizedException,
    Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { assertAccessTransition, hasVerifiedEmail } from '../common/access-lifecycle';
import { issueActivationTicket, verifyActivationTicket } from '../common/activation-ticket';
import {
    generateAccessToken,
    hashAccessToken,
    isValidAccessToken,
    openAccessToken,
    randomCode,
    sealAccessToken,
} from '../common/access-token';
import { EmailOtpService } from '../common/email-otp.service';
import {
    cooldownRemainingSeconds,
    createEmailVerificationChallenge,
    hashEmailVerificationToken,
} from '../common/email-verification-token';
import { issuePasswordResetTicket, verifyPasswordResetTicket } from '../common/password-reset-ticket';
import { NotificationService } from '../notification/notification.service';
import { PartnerAdminApiClient } from '../partner/admin-api.client';
import { PartnerDirectoryService } from '../partner/partner-directory.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApplySchoolDto, DecideSchoolDto, SchoolLoginDto } from './dto/school.dto';
import { schoolNameKey } from './school-directory.helpers';

/**
 * A real hash to compare against when no school matches the email, so the
 * "unknown email" and "wrong password" paths cost the same time. Built once at
 * import; a hand-written placeholder would make bcrypt throw on a malformed salt.
 */
const ABSENT_SCHOOL_HASH = bcrypt.hashSync('bio-timing-equalizer', 10);

/**
 * School access lifecycle (PRD-047), mirroring the partner loop: a school
 * self-applies (public, no credential), staff review it alongside partner
 * requests, and approval provisions the `School` row, a coordinator `User`
 * (role `SCHOOL`), and exactly one access token.
 *
 * A self-applying coordinator chooses a password during activation. A
 * partner-submitted coordinator is invited to set a password when they confirm
 * their email, and can also create or reset one at any time through the
 * forgot-password flow. Either way, every approved school can sign in with the
 * coordinator email + password or with the access token Innovation Olympiad staff issue on
 * approval. The token's digest is uniquely indexed, so a token resolves to at
 * most one school and can never sign a different one in.
 */
type SchoolRequestRecord = {
    id: string;
    schoolName: string;
    board: string;
    udiseCode: string | null;
    pincode: string;
    city: string;
    state: string;
    coordinatorName: string;
    coordinatorEmail: string;
    coordinatorPhone: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
    passwordHash: string | null;
    emailVerifiedAt: Date | null;
    emailVerificationTokenExpiresAt: Date | null;
    emailVerificationSentAt: Date | null;
    emailVerificationTokenUsedAt: Date | null;
    submittedByPartnerId: string | null;
    submittedViaReferralCode: string | null;
    schoolId: string | null;
    coordinatorUserId: string | null;
    accessTokenHash: string | null;
    accessTokenSealed: string | null;
    tokenIssuedAt: Date | null;
    tokenLastUsedAt: Date | null;
    decidedAt: Date | null;
    school?: SchoolRecord | null;
};

type SchoolRecord = {
    id: string;
    name: string;
    nameKey: string;
    code: string;
    city: string;
    state: string;
    pincode: string;
    board: string | null | undefined;
    udiseCode: string | null | undefined;
    partnerId: string | null | undefined;
    onboardedAt: Date | null | undefined;
};

type UserRecord = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    schoolId: string | null | undefined;
    isActive: boolean;
};

type StoreArgs = {
    where?: Record<string, unknown>;
    data?: Record<string, unknown>;
    include?: Record<string, unknown>;
    select?: Record<string, unknown>;
    orderBy?: unknown;
};

type SchoolTransactionStore = {
    schoolRequest: {
        findFirst(args: StoreArgs): Promise<SchoolRequestRecord | null>;
        update(args: StoreArgs): Promise<SchoolRequestRecord>;
    };
    school: {
        findUnique(args: StoreArgs): Promise<SchoolRecord | null>;
        findMany(args: StoreArgs): Promise<SchoolRecord[]>;
        create(args: StoreArgs): Promise<SchoolRecord>;
        update(args: StoreArgs): Promise<SchoolRecord>;
    };
    user: {
        findFirst(args: StoreArgs): Promise<UserRecord | null>;
        findUnique(args: StoreArgs): Promise<UserRecord | null>;
        create(args: StoreArgs): Promise<UserRecord>;
        update(args: StoreArgs): Promise<UserRecord>;
    };
    auditLog: {
        create(args: StoreArgs): Promise<unknown>;
    };
};

type SchoolPersistence = SchoolTransactionStore & {
    schoolRequest: SchoolTransactionStore['schoolRequest'] & {
        findFirst(args: StoreArgs): Promise<SchoolRequestRecord | null>;
        findUnique(args: StoreArgs): Promise<SchoolRequestRecord | null>;
        findMany(args?: StoreArgs): Promise<readonly SchoolRequestRecord[]>;
        create(args: StoreArgs): Promise<SchoolRequestRecord>;
        updateMany(args: StoreArgs): Promise<{ count: number }>;
    };
    $transaction<T>(callback: (tx: SchoolTransactionStore) => Promise<T>): Promise<T>;
};

type SchoolSessionSigner = {
    sign(payload: Record<string, unknown>, options?: Record<string, unknown>): string;
};

type SchoolPartnerResolver = {
    resolvePartnerIdByReferralCode(code: string): Promise<string | null>;
};

type SchoolPartnerDirectory = {
    detailsFor(partnerId: string, isDefault: boolean): Promise<{
        email: string;
        contactPerson: string;
    }>;
    /** id → org name, for showing which partner onboarded a school. */
    labelsFor(partnerIds: readonly string[]): Promise<Record<string, string>>;
};

@Injectable()
export class SchoolService {
    constructor(
        @Inject(PrismaService) private prisma: SchoolPersistence,
        @Inject(JwtService) private jwt: SchoolSessionSigner,
        @Inject(PartnerAdminApiClient) private adminApi: SchoolPartnerResolver,
        private notifications: NotificationService,
        @Inject(PartnerDirectoryService) private partnerDirectory: SchoolPartnerDirectory,
        private emailOtp: EmailOtpService,
    ) {}

    /**
     * Every school, as id/name/code — the directory behind the admin filter
     * dropdowns.
     *
     * Deliberately unpaginated and capped: these feed `<select>` elements, so a
     * consumer wants the whole list at once, and a school estate large enough to
     * exceed this cap needs a searchable control rather than a longer dropdown.
     */
    async listAllForAdmin() {
        return this.prisma.school.findMany({
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
            take: 2000,
        } as StoreArgs);
    }

    /**
     * Create a SchoolRequest and, if a concurrent request wins the race on the
     * unique `coordinatorEmail`, translate the Prisma P2002 into a clear
     * ConflictException so the caller always sees a layman message instead of a 500.
     */
    private async createSchoolRequest(data: Prisma.SchoolRequestUncheckedCreateInput) {
        try {
            return await this.prisma.schoolRequest.create({ data } as StoreArgs);
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new ConflictException(
                    'A school application is already in the Innovation Olympiad review queue for this coordinator email. Check your email for an update, or contact Innovation Olympiad support.',
                );
            }
            throw e;
        }
    }

    /**
     * Self-service application. Two shapes, depending on who is submitting:
     *
     * - **Self-applying coordinator** (public `/school/apply`, no
     *   `submittedByPartnerId`): must already hold a `verificationTicket` from
     *   `startVerification` + `verifyEmail` — the coordinator proves control of
     *   the email *before* filling in the rest, not after. The request is
     *   created already verified, and a password is required so the
     *   coordinator can sign in with email + password as well as a token.
     * - **Partner-submitted** (`submittedByPartnerId` set, from the
     *   authenticated `/partner/schools` path): unchanged — the partner has no
     *   way to prove control of someone else's inbox up front, so this school
     *   is created unverified and the coordinator confirms their email
     *   afterwards, exactly as before.
     */
    async apply(dto: ApplySchoolDto, submittedByPartnerId?: string) {
        const coordinatorEmail = dto.coordinatorEmail.trim().toLowerCase();

        const existing = await this.prisma.schoolRequest.findFirst({
            where: {
                coordinatorEmail: { equals: coordinatorEmail, mode: 'insensitive' },
            },
        });
        if (existing) {
            throw new ConflictException(
                'A school application is already in the Innovation Olympiad review queue for this coordinator email. Check your email for an update, or contact Innovation Olympiad support.',
            );
        }

        // Approval provisions a coordinator User under this address. Refusing here
        // rather than at approval keeps us from ever mutating someone else's
        // existing account (a student's, say) into a school coordinator behind their back.
        const claimed = await this.prisma.user.findFirst({
            where: {
                email: { equals: coordinatorEmail, mode: 'insensitive' },
            },
        });
        if (claimed) {
            throw new ConflictException(
                'This email already has an Innovation Olympiad account. Use a different coordinator email, or sign in if this is your account.',
            );
        }

        // A campaign referral code (self-apply path) resolves to the partner that
        // owns it. The authenticated partner path passes `submittedByPartnerId`
        // directly and carries no code.
        const referralCode = dto.referralCode?.trim() || null;
        let partnerId = submittedByPartnerId ?? null;
        if (!partnerId && referralCode) {
            partnerId = await this.adminApi.resolvePartnerIdByReferralCode(referralCode);
        }

        const now = new Date();
        const baseData = {
            schoolName: dto.schoolName.trim(),
            board: dto.board.trim(),
            udiseCode: dto.udiseCode?.trim() || null,
            pincode: dto.pincode.trim(),
            city: dto.city.trim(),
            state: dto.state.trim(),
            coordinatorName: dto.coordinatorName.trim(),
            coordinatorEmail,
            coordinatorPhone: dto.coordinatorPhone.trim(),
            status: 'PENDING' as const,
            submittedByPartnerId: partnerId,
            // Recorded only when a code actually resolved to a partner.
            submittedViaReferralCode: partnerId && referralCode ? referralCode : null,
        };

        if (!submittedByPartnerId) {
            if (!dto.password) {
                throw new BadRequestException('Choose a password.');
            }
            if (
                !dto.verificationTicket ||
                !verifyActivationTicket(dto.verificationTicket, 'SCHOOL', coordinatorEmail, now)
            ) {
                throw new BadRequestException(
                    'Verify your coordinator email before submitting this application.',
                );
            }

            const passwordHash = await bcrypt.hash(dto.password, 10);
            const request = await this.createSchoolRequest({
                ...baseData,
                passwordHash,
                emailVerifiedAt: now,
            });
            const emailSent = await this.notifications.sendSchoolApplicationReceived(
                request.coordinatorEmail,
                request.coordinatorName,
                request.schoolName,
            );
            return {
                status: 'PENDING' as const,
                schoolName: request.schoolName,
                coordinatorEmail: request.coordinatorEmail,
                emailSent,
            };
        }

        const challenge = createEmailVerificationChallenge(now);
        const request = await this.createSchoolRequest({
            ...baseData,
            emailVerificationTokenHash: challenge.tokenHash,
            emailVerificationTokenExpiresAt: challenge.expiresAt,
            emailVerificationSentAt: challenge.sentAt,
        });

        const emailSent =
            (await this.notifications.sendSchoolEmailVerification?.(request.coordinatorEmail, {
                coordinatorName: request.coordinatorName,
                schoolName: request.schoolName,
                token: challenge.rawToken,
            })) ?? false;

        return {
            status: 'EMAIL_VERIFICATION_REQUIRED' as const,
            schoolName: request.schoolName,
            coordinatorEmail: request.coordinatorEmail,
            emailSent,
        };
    }

    /**
     * PUBLIC — step 1 of self-service activation: send a 6-digit code to the
     * coordinator email before any school details are collected — the same
     * OTP shape as student registration, just by email instead of SMS. The
     * duplicate/claimed-email checks run here too, so a coordinator finds out
     * before typing anything else, not after.
     */
    async startVerification(emailAddress: string) {
        const coordinatorEmail = emailAddress.trim().toLowerCase();

        const existingRequest = await this.prisma.schoolRequest.findFirst({
            where: {
                coordinatorEmail: { equals: coordinatorEmail, mode: 'insensitive' },
            },
        });
        if (existingRequest) {
            throw new ConflictException(
                'A school application is already in the Innovation Olympiad review queue for this coordinator email. Check your email for an update, or contact Innovation Olympiad support.',
            );
        }
        const claimed = await this.prisma.user.findFirst({
            where: {
                email: { equals: coordinatorEmail, mode: 'insensitive' },
            },
        });
        if (claimed) {
            throw new ConflictException(
                'This email already has an Innovation Olympiad account. Use a different coordinator email, or sign in if this is your account.',
            );
        }

        return this.emailOtp.sendOtp('SCHOOL', coordinatorEmail);
    }

    /**
     * PUBLIC — step 2 of self-service activation: check the submitted code and,
     * on success, mint the short-lived `verificationTicket` that `apply()`
     * requires. There is no application yet to admit the coordinator to — that
     * only happens once they submit the full form.
     */
    async confirmVerification(emailAddress: string, code: string) {
        const coordinatorEmail = await this.emailOtp.verifyOtp('SCHOOL', emailAddress, code);
        return {
            status: 'CONTINUE_APPLICATION' as const,
            email: coordinatorEmail,
            submissionTicket: issueActivationTicket('SCHOOL', coordinatorEmail),
        };
    }

    /**
     * PUBLIC — confirm a coordinator email via the legacy link flow: only
     * reachable when a partner submitted the school on the coordinator's
     * behalf (`apply(dto, submittedByPartnerId)`), which still emails a
     * confirmation link afterwards since the partner cannot prove control of
     * someone else's inbox up front. A self-applying coordinator never reaches
     * this — they confirm inline with `confirmVerification` before submitting.
     */
    /**
     * PUBLIC — confirm a coordinator email via the legacy link flow: only
     * reachable when a partner submitted the school on the coordinator's
     * behalf. A self-applying coordinator never reaches this — they confirm
     * inline with `confirmVerification` before submitting.
     *
     * After a partner-submitted school verifies the email, if the coordinator
     * has not yet set a password, we hand back a short-lived set-password
     * ticket so the first sign-in can use the email too. Once a password is set,
     * the coordinator can sign in with either email + password or the access
     * token issued on approval.
     */
    async verifyEmail(rawToken: string) {
        const token = rawToken.trim();
        if (!token || token.length > 256) {
            throw new BadRequestException('This verification link is invalid or has expired. Request a new one.');
        }

        const request = await this.prisma.schoolRequest.findUnique({
            where: { emailVerificationTokenHash: hashEmailVerificationToken(token) },
        });
        if (!request) {
            throw new BadRequestException('This verification link is invalid or has expired. Request a new one.');
        }

        if (request.emailVerifiedAt) {
            if (!request.passwordHash) {
                return {
                    status: 'SET_PASSWORD' as const,
                    email: request.coordinatorEmail,
                    setPasswordTicket: issuePasswordResetTicket('SCHOOL', request.coordinatorEmail),
                };
            }
            return { status: 'ALREADY_VERIFIED' as const, email: request.coordinatorEmail };
        }
        if (
            !request.emailVerificationTokenExpiresAt ||
            request.emailVerificationTokenExpiresAt <= new Date()
        ) {
            throw new BadRequestException('This verification link is invalid or has expired. Request a new one.');
        }
        if (request.emailVerificationTokenUsedAt) {
            throw new BadRequestException('This verification link has already been used. Request a new one.');
        }

        const now = new Date();
        const claimed = await this.prisma.schoolRequest.updateMany({
            where: {
                id: request.id,
                emailVerifiedAt: null,
                emailVerificationTokenUsedAt: null,
            },
            data: { emailVerifiedAt: now, emailVerificationTokenUsedAt: now },
        });
        if (claimed.count === 0) {
            const current = await this.prisma.schoolRequest.findUnique({ where: { id: request.id } });
            if (current?.emailVerifiedAt) {
                if (!current.passwordHash) {
                    return {
                        status: 'SET_PASSWORD' as const,
                        email: current.coordinatorEmail,
                        setPasswordTicket: issuePasswordResetTicket('SCHOOL', current.coordinatorEmail),
                    };
                }
                return {
                    status: 'ALREADY_VERIFIED' as const,
                    email: current.coordinatorEmail,
                };
            }
            throw new BadRequestException('This verification link has already been used. Request a new one.');
        }

        await this.prisma.auditLog.create({
            data: {
                action: 'school.email.verified',
                resource: 'school-request',
                details: { schoolRequestId: request.id },
            },
        });
        const emailSent = await this.notifications.sendSchoolApplicationReceived(
            request.coordinatorEmail,
            request.coordinatorName,
            request.schoolName,
        );

        if (!request.passwordHash) {
            return {
                status: 'SET_PASSWORD' as const,
                email: request.coordinatorEmail,
                setPasswordTicket: issuePasswordResetTicket('SCHOOL', request.coordinatorEmail),
                emailSent,
            };
        }

        return { status: 'PENDING' as const, email: request.coordinatorEmail, emailSent };
    }

    /**
     * PUBLIC — resend on the legacy link flow (partner-submitted schools only).
     * A self-applying coordinator resends their OTP by calling
     * `startVerification` again instead — see its doc comment.
     */
    async resendVerification(emailAddress: string) {
        const email = emailAddress.trim().toLowerCase();

        const request = await this.prisma.schoolRequest.findUnique({
            where: { coordinatorEmail: email },
        });
        if (!request || request.emailVerifiedAt || request.status !== 'PENDING') {
            return { status: 'CHECK_INBOX' as const };
        }

        const now = new Date();
        if (cooldownRemainingSeconds(request.emailVerificationSentAt, now) > 0) {
            return { status: 'CHECK_INBOX' as const };
        }

        const challenge = createEmailVerificationChallenge(now);
        await this.prisma.schoolRequest.update({
            where: { id: request.id },
            data: {
                emailVerificationTokenHash: challenge.tokenHash,
                emailVerificationTokenExpiresAt: challenge.expiresAt,
                emailVerificationSentAt: challenge.sentAt,
                emailVerificationTokenUsedAt: null,
            },
        });
        await this.notifications.sendSchoolEmailVerification(request.coordinatorEmail, {
            coordinatorName: request.coordinatorName,
            schoolName: request.schoolName,
            token: challenge.rawToken,
        });
        return { status: 'CHECK_INBOX' as const };
    }

    async resendVerificationForAdmin(id: string, adminId: string) {
        const request = await this.prisma.schoolRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('School request not found.');
        if (request.emailVerifiedAt || request.status !== 'PENDING') {
            throw new ConflictException('This school does not need email verification.');
        }

        const now = new Date();
        const retryAfterSeconds = cooldownRemainingSeconds(request.emailVerificationSentAt, now);
        if (retryAfterSeconds > 0) {
            throw new HttpException(
                `A verification email was sent recently. Try again in ${retryAfterSeconds} seconds.`,
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        const challenge = createEmailVerificationChallenge(now);
        await this.prisma.schoolRequest.update({
            where: { id },
            data: {
                emailVerificationTokenHash: challenge.tokenHash,
                emailVerificationTokenExpiresAt: challenge.expiresAt,
                emailVerificationSentAt: challenge.sentAt,
                emailVerificationTokenUsedAt: null,
            },
        });
        const emailSent = await this.notifications.sendSchoolEmailVerification(request.coordinatorEmail, {
            coordinatorName: request.coordinatorName,
            schoolName: request.schoolName,
            token: challenge.rawToken,
        });
        await this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: 'school.email.verification.resent',
                resource: 'school-request',
                details: { schoolRequestId: id, emailSent },
            },
        });
        return { emailSent };
    }

    /**
     * PUBLIC — the access token staff issue on approval, or the coordinator
     * email + password. Every approved school supports both credentials; a
     * partner-submitted coordinator sets the password when confirming email or
     * later through the forgot-password flow.
     */
    async login(dto: SchoolLoginDto) {
        const request = dto.accessToken
            ? await this.findByAccessToken(dto.accessToken)
            : await this.findByPassword(dto);

        if (request.status !== 'APPROVED') {
            throw new ForbiddenException(
                request.status === 'PENDING' && !hasVerifiedEmail(request.status, request.emailVerifiedAt)
                    ? 'Confirm your coordinator email before your application can be reviewed.'
                    : `Your school's access has been ${request.status.toLowerCase()}.`,
            );
        }
        if (!hasVerifiedEmail(request.status, request.emailVerifiedAt)) {
            throw new ForbiddenException('Confirm your coordinator email before signing in.');
        }
        if (!request.school || !request.coordinatorUserId) {
            throw new ForbiddenException('This school is not fully provisioned yet.');
        }

        const coordinator = await this.prisma.user.findUnique({
            where: { id: request.coordinatorUserId },
            select: { isActive: true },
        });
        if (!coordinator?.isActive) {
            throw new ForbiddenException('This school coordinator account is not active. Contact Innovation Olympiad support.');
        }

        await this.prisma.schoolRequest.update({
            where: { id: request.id },
            data: { tokenLastUsedAt: new Date() },
        });

        // sub = the coordinator User id, so JwtAuthGuard resolves it like any
        // other account and a revoke (isActive=false) kills live sessions.
        const token = this.jwt.sign(
            {
                sub: request.coordinatorUserId,
                email: request.coordinatorEmail,
                role: 'SCHOOL',
                schoolId: request.school.id,
            },
            { expiresIn: '24h' },
        );

        return {
            accessToken: token,
            school: {
                id: request.school.id,
                name: request.school.name,
                code: request.school.code,
                city: request.school.city,
                state: request.school.state,
            },
            coordinator: { name: request.coordinatorName, email: request.coordinatorEmail },
        };
    }

    /**
     * The digest is uniquely indexed, so a token resolves to at most one school.
     * A token issued to one school can never sign another one in.
     */
    private async findByAccessToken(raw: string): Promise<SchoolRequestRecord> {
        if (!isValidAccessToken(raw, 'SCHOOL')) {
            throw new UnauthorizedException('That access token is not valid.');
        }
        const request = await this.prisma.schoolRequest.findUnique({
            where: { accessTokenHash: hashAccessToken(raw) },
            include: { school: true },
        });
        if (!request) {
            throw new UnauthorizedException('That access token is not valid.');
        }
        return request;
    }

    private async findByPassword(dto: SchoolLoginDto): Promise<SchoolRequestRecord> {
        const coordinatorEmail = (dto.coordinatorEmail ?? '').trim().toLowerCase();
        const request = await this.prisma.schoolRequest.findUnique({
            where: { coordinatorEmail },
            include: { school: true },
        });
        const ok = await bcrypt.compare(dto.password ?? '', request?.passwordHash ?? ABSENT_SCHOOL_HASH);
        if (!request || !ok) {
            throw new UnauthorizedException('Invalid email or password.');
        }
        return request;
    }

    /**
     * PUBLIC — forgot-password step 1: send a 6-digit code, same shape as the
     * verify-first step. This also covers a partner-submitted school that never
     * set a password; after the OTP is confirmed, `resetPassword` creates or
     * replaces the password so every school can sign in with email + password
     * as well as the access token.
     */
    async forgotPassword(rawEmail: string) {
        const coordinatorEmail = rawEmail.trim().toLowerCase();
        const request = await this.prisma.schoolRequest.findUnique({ where: { coordinatorEmail } });
        if (!request) {
            throw new BadRequestException('No school account found with that email.');
        }
        return this.emailOtp.sendOtp('SCHOOL_RESET', coordinatorEmail);
    }

    /**
     * PUBLIC — forgot-password step 2: check the code and hand back the
     * short-lived `resetTicket` that `resetPassword` requires.
     */
    async confirmPasswordReset(rawEmail: string, code: string) {
        const email = await this.emailOtp.verifyOtp('SCHOOL_RESET', rawEmail, code);
        return { status: 'CONTINUE_RESET' as const, email, resetTicket: issuePasswordResetTicket('SCHOOL', email) };
    }

    /** PUBLIC — forgot-password step 3: set the new password, proven by the step-2 ticket. */
    async resetPassword(rawEmail: string, resetTicket: string, newPassword: string) {
        const coordinatorEmail = rawEmail.trim().toLowerCase();
        const now = new Date();
        if (!verifyPasswordResetTicket(resetTicket, 'SCHOOL', coordinatorEmail, now)) {
            throw new BadRequestException('This reset code has expired. Request a new one.');
        }

        const request = await this.prisma.schoolRequest.findUnique({ where: { coordinatorEmail } });
        if (!request) {
            throw new BadRequestException('No school account found with that email.');
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await this.prisma.schoolRequest.update({ where: { id: request.id }, data: { passwordHash } });

        // Only notify "changed" when there was a previous password; the first-time
        // set path is silent because the school was just creating the password.
        if (request.passwordHash) {
            await this.notifications.sendSchoolPasswordChanged(request.coordinatorEmail, {
                coordinatorName: request.coordinatorName,
                schoolName: request.schoolName,
            });
        }

        return { status: 'PASSWORD_RESET' as const };
    }

    /**
     * PUBLIC — first-time password creation for a partner-submitted school, issued
     * immediately after `verifyEmail` succeeds and the school has no password yet.
     * Uses the same short-lived ticket shape as `resetPassword`.
     */
    async setPassword(rawEmail: string, setPasswordTicket: string, newPassword: string) {
        const coordinatorEmail = rawEmail.trim().toLowerCase();
        const now = new Date();
        if (!verifyPasswordResetTicket(setPasswordTicket, 'SCHOOL', coordinatorEmail, now)) {
            throw new BadRequestException('This set-password link has expired. Request a new one.');
        }

        const request = await this.prisma.schoolRequest.findUnique({ where: { coordinatorEmail } });
        if (!request) {
            throw new BadRequestException('No school account found with that email.');
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await this.prisma.schoolRequest.update({ where: { id: request.id }, data: { passwordHash } });

        return { status: 'PASSWORD_SET' as const };
    }

    /** ADMIN — the school half of the Access Management queue. */
    async list() {
        const rows = await this.prisma.schoolRequest.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                schoolName: true,
                board: true,
                udiseCode: true,
                pincode: true,
                city: true,
                state: true,
                coordinatorName: true,
                coordinatorEmail: true,
                coordinatorPhone: true,
                status: true,
                emailVerifiedAt: true,
                emailVerificationSentAt: true,
                schoolId: true,
                submittedByPartnerId: true,
                submittedViaReferralCode: true,
                decisionReason: true,
                decidedBy: true,
                decidedAt: true,
                createdAt: true,
                tokenIssuedAt: true,
                tokenLastUsedAt: true,
            },
        });

        // Which partner onboarded each school, resolved to a name for the admin
        // review card. A self-applied school carries no `submittedByPartnerId`
        // and shows nothing here.
        const partnerNames = await this.partnerDirectory.labelsFor(
            rows.map((r) => r.submittedByPartnerId ?? '').filter(Boolean),
        );
        for (const row of rows) {
            (row as { submittedByPartnerName?: string | null }).submittedByPartnerName =
                row.submittedByPartnerId ? partnerNames[row.submittedByPartnerId] ?? null : null;
        }
        return rows;
    }

    /** `SCH-XXXXXX` over the unambiguous alphabet; retried on the rare collision. */
    private async allocateSchoolCode(tx: SchoolTransactionStore): Promise<string> {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const code = `SCH-${randomCode(6)}`;
            const taken = await tx.school.findUnique({ where: { code } });
            if (!taken) return code;
        }
        throw new ConflictException('Could not allocate a unique school code. Try again.');
    }

    /** ADMIN — grant, reject, revoke, or re-grant a school request. */
    async decide(id: string, dto: DecideSchoolDto, adminId: string) {
        const request = await this.prisma.schoolRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('School request not found.');

        assertAccessTransition(request.status, dto.decision, 'school');
        if (dto.decision === 'APPROVED' && !hasVerifiedEmail(request.status, request.emailVerifiedAt)) {
            throw new BadRequestException(
                `The coordinator has not confirmed their email (${request.coordinatorEmail}). Ask them to click the verification link in their inbox before granting access.`,
            );
        }

        const now = new Date();
        const issuing = dto.decision === 'APPROVED' && !request.accessTokenHash;
        const plaintext = issuing ? generateAccessToken('SCHOOL') : null;
        let result: SchoolRequestRecord;
        try {
            result = await this.prisma.$transaction(async (tx) => {
                const provisioned =
                    dto.decision === 'APPROVED'
                        ? await this.provisionSchool(tx, request, now)
                        : { schoolId: request.schoolId, coordinatorUserId: request.coordinatorUserId };
                return this.persistDecision(tx, request, dto, adminId, provisioned, plaintext, issuing, now);
            });
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                const target = Array.isArray(e.meta?.target) ? (e.meta?.target as string[]).join(', ') : 'a unique field';
                throw new ConflictException(
                    `This school request conflicts with an existing record (${target}). Check for a duplicate school, email, or access token, then try again.`,
                );
            }
            throw e;
        }

        const emailSent = await this.notifyDecision(result, dto, plaintext);
        await this.notifyOnboardingPartner(result, dto);
        return { id: result.id, status: result.status, schoolId: result.schoolId, emailSent };
    }

    private async provisionSchool(
        tx: SchoolTransactionStore,
        request: SchoolRequestRecord,
        now: Date,
    ): Promise<{ schoolId: string; coordinatorUserId: string }> {
        const school = request.schoolId
            ? await tx.school.update({
                  where: { id: request.schoolId },
                  data: {
                      name: request.schoolName,
                      city: request.city,
                      state: request.state,
                      board: request.board,
                      udiseCode: request.udiseCode,
                      ...(request.submittedByPartnerId
                          ? { partnerId: request.submittedByPartnerId }
                          : {}),
                      onboardedAt: now,
                  },
              })
            : await this.findOrCreateSchool(tx, request, now);

        const coordinatorUserId = await this.provisionCoordinator(tx, request, school.id);

        return { schoolId: school.id, coordinatorUserId };
    }

    private async findOrCreateSchool(
        tx: SchoolTransactionStore,
        request: SchoolRequestRecord,
        now: Date,
    ) {
        const nameKey = schoolNameKey(request.schoolName);
        const existing = await tx.school.findUnique({
            where: { nameKey_pincode: { nameKey, pincode: request.pincode } },
        });
        if (existing) {
            const otherRequest = await tx.schoolRequest.findFirst({
                where: { schoolId: existing.id, id: { not: request.id } },
            });
            if (otherRequest) {
                throw new ConflictException(
                    `A school request for "${request.schoolName}" (${request.pincode}) is already linked to this school. Use or delete the existing request before granting a new one.`,
                );
            }
            return tx.school.update({
                where: { id: existing.id },
                data: {
                    name: request.schoolName,
                    code: existing.code ?? (await this.allocateSchoolCode(tx)),
                    city: request.city || existing.city,
                    state: request.state || existing.state,
                    board: request.board,
                    udiseCode: request.udiseCode,
                    ...(request.submittedByPartnerId
                        ? { partnerId: request.submittedByPartnerId }
                        : {}),
                    onboardedAt: now,
                },
            });
        }

        return tx.school.create({
            data: {
                name: request.schoolName,
                nameKey,
                code: await this.allocateSchoolCode(tx),
                city: request.city,
                state: request.state,
                pincode: request.pincode,
                board: request.board,
                udiseCode: request.udiseCode,
                partnerId: request.submittedByPartnerId,
                onboardedAt: now,
            },
        });
    }

    private async provisionCoordinator(
        tx: SchoolTransactionStore,
        request: SchoolRequestRecord,
        schoolId: string,
    ): Promise<string> {
        if (request.coordinatorUserId) {
            return request.coordinatorUserId;
        }

        const existing = await tx.user.findUnique({ where: { email: request.coordinatorEmail } });
        if (existing) {
            if (existing.role === Role.SCHOOL && (!existing.schoolId || existing.schoolId === schoolId)) {
                await tx.user.update({
                    where: { id: existing.id },
                    data: { schoolId, isActive: true },
                });
                return existing.id;
            }
            throw new ConflictException(
                `A user with email ${request.coordinatorEmail} already exists as a ${existing.role.toLowerCase()}. Use a different coordinator email or contact support.`,
            );
        }

        const created = await tx.user.create({
            data: {
                email: request.coordinatorEmail,
                firstName: request.coordinatorName.trim().split(/\s+/)[0] ?? request.coordinatorName,
                lastName: request.coordinatorName.trim().split(/\s+/).slice(1).join(' '),
                role: Role.SCHOOL,
                schoolId,
                isActive: true,
            },
        });
        return created.id;
    }

    private persistDecision(
        tx: SchoolTransactionStore,
        request: SchoolRequestRecord,
        dto: DecideSchoolDto,
        adminId: string,
        provisioned: { schoolId: string | null; coordinatorUserId: string | null },
        plaintext: string | null,
        issuing: boolean,
        now: Date,
    ) {
        const coordinatorUpdate = provisioned.coordinatorUserId
            ? tx.user.update({
                  where: { id: provisioned.coordinatorUserId },
                  data: { isActive: dto.decision === 'APPROVED' },
              })
            : null;
        const requestUpdate = tx.schoolRequest.update({
            where: { id: request.id },
            data: {
                status: dto.decision,
                decisionReason: dto.reason,
                decidedBy: adminId,
                decidedAt: now,
                schoolId: provisioned.schoolId,
                coordinatorUserId: provisioned.coordinatorUserId,
                ...(plaintext
                    ? {
                          accessTokenHash: hashAccessToken(plaintext),
                          accessTokenSealed: sealAccessToken(plaintext),
                          tokenIssuedAt: now,
                      }
                    : {}),
            },
        });
        const audit = tx.auditLog.create({
            data: {
                userId: adminId,
                action: `school.${dto.decision.toLowerCase()}`,
                resource: 'school-request',
                details: {
                    schoolRequestId: request.id,
                    schoolId: provisioned.schoolId,
                    reason: dto.reason,
                    tokenIssued: issuing,
                },
            },
        });
        return Promise.all([coordinatorUpdate, requestUpdate, audit]).then(([, updated]) => updated);
    }

    private notifyDecision(
        result: SchoolRequestRecord,
        dto: DecideSchoolDto,
        plaintext: string | null,
    ): Promise<boolean> {
        if (dto.decision === 'APPROVED') {
            const token = plaintext ?? openAccessToken(result.accessTokenSealed);
            if (!token) return Promise.resolve(false);
            return this.prisma.school.findUnique({
                where: { id: result.schoolId ?? '' },
                select: { code: true },
            }).then((school) =>
                this.notifications.sendSchoolApproved(result.coordinatorEmail, {
                    coordinatorName: result.coordinatorName,
                    schoolName: result.schoolName,
                    schoolCode: school?.code ?? null,
                    accessToken: token,
                }),
            );
        }
        if (dto.decision === 'REJECTED') {
            return this.notifications.sendSchoolRejected(result.coordinatorEmail, {
                coordinatorName: result.coordinatorName,
                schoolName: result.schoolName,
                reason: dto.reason,
            });
        }
        return this.notifications.sendSchoolRevoked(result.coordinatorEmail, {
            coordinatorName: result.coordinatorName,
            schoolName: result.schoolName,
            reason: dto.reason,
        });
    }

    private async notifyOnboardingPartner(result: SchoolRequestRecord, dto: DecideSchoolDto): Promise<void> {
        if (!result.submittedByPartnerId || (dto.decision !== 'APPROVED' && dto.decision !== 'REJECTED')) return;
        const partner = await this.partnerDirectory.detailsFor(result.submittedByPartnerId, false);
        await this.notifications.sendPartnerSchoolStatusChanged(partner.email, {
            contactPerson: partner.contactPerson,
            schoolName: result.schoolName,
            status: dto.decision,
        });
    }

    /**
     * ADMIN — the handover card: everything the school needs, including the
     * access token in the clear. Admin-only, and never part of the list payload.
     */
    async card(id: string) {
        const request = await this.prisma.schoolRequest.findUnique({
            where: { id },
            include: { school: true },
        });
        if (!request) throw new NotFoundException('School request not found.');
        if (request.status !== 'APPROVED') {
            throw new ForbiddenException('A handover card exists only for an approved school.');
        }

        return {
            kind: 'SCHOOL' as const,
            id: request.id,
            schoolName: request.schoolName,
            schoolCode: request.school?.code ?? null,
            board: request.board,
            udiseCode: request.udiseCode,
            pincode: request.pincode,
            city: request.city,
            state: request.state,
            submittedByPartnerId: request.submittedByPartnerId,
            coordinatorName: request.coordinatorName,
            coordinatorEmail: request.coordinatorEmail,
            coordinatorPhone: request.coordinatorPhone,
            status: request.status,
            accessToken: openAccessToken(request.accessTokenSealed),
            tokenIssuedAt: request.tokenIssuedAt,
            tokenLastUsedAt: request.tokenLastUsedAt,
            approvedAt: request.decidedAt,
            portalUrl: process.env.SCHOOL_PORTAL_URL || 'https://school.innovationolympiad.in/',
        };
    }

    /** ADMIN — replace the token, invalidating the old one immediately. */
    async rotateToken(id: string, adminId: string) {
        const request = await this.prisma.schoolRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('School request not found.');
        if (request.status !== 'APPROVED') {
            throw new ForbiddenException('Only an approved school has a token to rotate.');
        }

        const plaintext = generateAccessToken('SCHOOL');
        await this.prisma.schoolRequest.update({
            where: { id },
            data: {
                accessTokenHash: hashAccessToken(plaintext),
                accessTokenSealed: sealAccessToken(plaintext),
                tokenIssuedAt: new Date(),
                tokenLastUsedAt: null,
            },
        });
        await this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: 'school.token.rotated',
                resource: 'school-request',
                details: { schoolRequestId: id },
            },
        });

        const emailSent = await this.notifications.sendSchoolTokenRotated(request.coordinatorEmail, {
            coordinatorName: request.coordinatorName,
            schoolName: request.schoolName,
            accessToken: plaintext,
        });

        return { ...(await this.card(id)), emailSent };
    }

    /**
     * ADMIN — re-send the school's current access details, unprompted by any
     * new decision. For when a coordinator says the original mail never arrived.
     */
    async resendAccess(id: string, adminId: string) {
        const request = await this.prisma.schoolRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('School request not found.');
        if (request.status !== 'APPROVED') {
            throw new ForbiddenException('Only an approved school has access details to resend.');
        }
        const token = openAccessToken(request.accessTokenSealed);
        if (!token) {
            throw new ForbiddenException('No access token on file — rotate one instead of resending.');
        }

        const emailSent = await this.notifications.sendSchoolAccessResent(request.coordinatorEmail, {
            coordinatorName: request.coordinatorName,
            schoolName: request.schoolName,
            accessToken: token,
        });

        await this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: 'school.access.resent',
                resource: 'school-request',
                details: { schoolRequestId: id, emailSent },
            },
        });

        return { emailSent };
    }
}
