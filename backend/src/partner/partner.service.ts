import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PreActivationVerification } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { assertAccessTransition, hasVerifiedEmail } from '../common/access-lifecycle';
import { issueActivationTicket, verifyActivationTicket } from '../common/activation-ticket';
import {
    generateAccessToken,
    hashAccessToken,
    isValidAccessToken,
    openAccessToken,
    sealAccessToken,
} from '../common/access-token';
import {
    cooldownRemainingSeconds,
    createEmailVerificationChallenge,
    hashEmailVerificationToken,
} from '../common/email-verification-token';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartnerAdminApiClient } from './admin-api.client';
import {
    ApplyPartnerDto,
    DecidePartnerDto,
    PartnerLoginDto,
} from './dto/partner.dto';

/**
 * A real hash to compare against when no partner matches the email, so the
 * "unknown email" and "wrong password" paths cost the same time. Built once at
 * import; a hand-written placeholder would make bcrypt throw on a malformed salt.
 */
const ABSENT_PARTNER_HASH = bcrypt.hashSync('bio-timing-equalizer', 10);

type PartnerRequestRecord = {
    id: string;
    orgName: string;
    contactPerson: string;
    email: string;
    phone: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
    emailVerifiedAt: Date | null;
    emailVerificationTokenExpiresAt: Date | null;
    emailVerificationSentAt: Date | null;
    emailVerificationTokenUsedAt: Date | null;
    partnerId: string | null;
    applicationId: string | null;
    accessTokenHash: string | null;
    accessTokenSealed: string | null;
};

/**
 * Partner access lifecycle owned by the legacy backend (the only JWT signer):
 * self-service apply (public) -> staff grant/revoke -> sign in. The admin-api
 * partner ENGINE holds the dashboard data and the authoritative `Partner.status`
 * gate; this service keeps the two in lock-step and issues the `role: PARTNER`
 * token whose `sub` is the admin-api partnerId.
 *
 * Applying deliberately does **not** call the engine. The engine sleeps on
 * Render's free tier, and making a stranger's first interaction depend on a
 * ~33s cold start is how "request access" ended up unusable. The engine record
 * is provisioned lazily, on the first approval — the only point where the
 * partnerId is actually needed, and a path where a staff member can wait.
 */
@Injectable()
export class PartnerService {
    constructor(
        private prisma: PrismaService,
        private jwt: JwtService,
        private adminApi: PartnerAdminApiClient,
        private notifications: NotificationService,
    ) {}

    /**
     * PUBLIC self-service application — no token, and no engine round-trip.
     *
     * Requires a `verificationTicket` from `startVerification` +
     * `verifyEmail`: the applicant proves control of the email *before*
     * filling in organisation details, not after. The request is therefore
     * created already verified and goes straight into the staff review queue.
     */
    async apply(dto: ApplyPartnerDto) {
        const email = dto.email.trim().toLowerCase();
        const existing = await this.prisma.partnerRequest.findUnique({ where: { email } });
        if (existing) {
            throw new ConflictException(
                'A partner application already exists for this email. Open the verification page to request another link.',
            );
        }

        const now = new Date();
        if (!verifyActivationTicket(dto.verificationTicket, 'PARTNER', email, now)) {
            throw new BadRequestException('Verify your email before submitting this application.');
        }

        const passwordHash = await bcrypt.hash(dto.password, 10);
        const request = await this.prisma.partnerRequest.create({
            data: {
                orgName: dto.orgName.trim(),
                contactPerson: dto.contactPerson.trim(),
                email,
                phone: dto.phone.trim(),
                passwordHash,
                status: 'PENDING',
                emailVerifiedAt: now,
            },
        });

        const emailSent = await this.notifications.sendPartnerApplicationReceived(
            request.email,
            request.contactPerson,
            request.orgName,
        );

        return {
            status: 'PENDING' as const,
            email: request.email,
            orgName: request.orgName,
            emailSent,
        };
    }

    /**
     * PUBLIC — step 1 of self-service application: prove control of the
     * contact email before any organisation details are collected. Mirrors
     * `resendVerification`'s cooldown/anti-enumeration behaviour, just against
     * `PreActivationVerification` instead of an existing application.
     */
    async startVerification(emailAddress: string) {
        const email = emailAddress.trim().toLowerCase();

        const existingRequest = await this.prisma.partnerRequest.findUnique({ where: { email } });
        if (existingRequest) {
            throw new ConflictException(
                'A partner application already exists for this email. Open the verification page to request another link.',
            );
        }

        const now = new Date();
        const existing = await this.prisma.preActivationVerification.findUnique({
            where: { kind_email: { kind: 'PARTNER', email } },
        });
        if (existing && cooldownRemainingSeconds(existing.tokenSentAt, now) > 0) {
            return { status: 'CHECK_INBOX' as const };
        }

        const challenge = createEmailVerificationChallenge(now);
        const data = {
            tokenHash: challenge.tokenHash,
            tokenExpiresAt: challenge.expiresAt,
            tokenSentAt: challenge.sentAt,
            tokenUsedAt: null,
            verifiedAt: null,
        };
        if (existing) {
            await this.prisma.preActivationVerification.update({ where: { id: existing.id }, data });
        } else {
            await this.prisma.preActivationVerification.create({
                data: { kind: 'PARTNER', email, ...data },
            });
        }

        const emailSent = await this.notifications.sendPartnerStartVerification(email, {
            token: challenge.rawToken,
        });
        return { status: 'CHECK_INBOX' as const, emailSent };
    }

    async verifyEmail(rawToken: string) {
        const token = rawToken.trim();
        if (!token || token.length > 256) {
            throw new BadRequestException('This verification link is invalid or has expired. Request a new one.');
        }
        const tokenHash = hashEmailVerificationToken(token);

        // The verify-first step (`startVerification`) checks in here before the
        // legacy "application already created, now confirm it" path below.
        const pre = await this.prisma.preActivationVerification.findUnique({ where: { tokenHash } });
        if (pre) {
            return this.confirmPreActivation(pre);
        }

        const request = await this.prisma.partnerRequest.findUnique({
            where: { emailVerificationTokenHash: tokenHash },
        });
        if (!request) {
            throw new BadRequestException('This verification link is invalid or has expired. Request a new one.');
        }

        if (request.emailVerifiedAt) {
            return { status: 'ALREADY_VERIFIED' as const, email: request.email };
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
        const claimed = await this.prisma.partnerRequest.updateMany({
            where: {
                id: request.id,
                emailVerifiedAt: null,
                emailVerificationTokenUsedAt: null,
            },
            data: { emailVerifiedAt: now, emailVerificationTokenUsedAt: now },
        });
        if (claimed.count === 0) {
            const current = await this.prisma.partnerRequest.findUnique({ where: { id: request.id } });
            if (current?.emailVerifiedAt) {
                return { status: 'ALREADY_VERIFIED' as const, email: current.email };
            }
            throw new BadRequestException('This verification link has already been used. Request a new one.');
        }

        await this.prisma.auditLog.create({
            data: {
                action: 'partner.email.verified',
                resource: 'partner-request',
                details: { partnerRequestId: request.id },
            },
        });
        const emailSent = await this.notifications.sendPartnerApplicationReceived(
            request.email,
            request.contactPerson,
            request.orgName,
        );

        return { status: 'PENDING' as const, email: request.email, emailSent };
    }

    /**
     * The verify-first step's confirm: mints a short-lived `verificationTicket`
     * instead of admitting the applicant to a staff review queue directly —
     * there is no application yet for it to admit them to.
     */
    private async confirmPreActivation(pre: PreActivationVerification) {
        const now = new Date();
        if (pre.tokenUsedAt) {
            return { status: 'ALREADY_VERIFIED' as const, email: pre.email };
        }
        if (pre.tokenExpiresAt <= now) {
            throw new BadRequestException('This verification link is invalid or has expired. Request a new one.');
        }

        const claimed = await this.prisma.preActivationVerification.updateMany({
            where: { id: pre.id, tokenUsedAt: null },
            data: { tokenUsedAt: now, verifiedAt: now },
        });
        if (claimed.count === 0) {
            return { status: 'ALREADY_VERIFIED' as const, email: pre.email };
        }

        return {
            status: 'CONTINUE_APPLICATION' as const,
            email: pre.email,
            submissionTicket: issueActivationTicket('PARTNER', pre.email, now),
        };
    }

    async resendVerification(emailAddress: string) {
        const email = emailAddress.trim().toLowerCase();

        const pre = await this.prisma.preActivationVerification.findUnique({
            where: { kind_email: { kind: 'PARTNER', email } },
        });
        if (pre && !pre.tokenUsedAt) {
            const now = new Date();
            if (cooldownRemainingSeconds(pre.tokenSentAt, now) > 0) {
                return { status: 'CHECK_INBOX' as const };
            }
            const challenge = createEmailVerificationChallenge(now);
            await this.prisma.preActivationVerification.update({
                where: { id: pre.id },
                data: {
                    tokenHash: challenge.tokenHash,
                    tokenExpiresAt: challenge.expiresAt,
                    tokenSentAt: challenge.sentAt,
                },
            });
            await this.notifications.sendPartnerStartVerification(email, { token: challenge.rawToken });
            return { status: 'CHECK_INBOX' as const };
        }

        const request = await this.prisma.partnerRequest.findUnique({ where: { email } });
        if (!request || request.emailVerifiedAt || request.status !== 'PENDING') {
            return { status: 'CHECK_INBOX' as const };
        }

        const now = new Date();
        if (cooldownRemainingSeconds(request.emailVerificationSentAt, now) > 0) {
            return { status: 'CHECK_INBOX' as const };
        }

        const challenge = createEmailVerificationChallenge(now);
        await this.prisma.partnerRequest.update({
            where: { id: request.id },
            data: {
                emailVerificationTokenHash: challenge.tokenHash,
                emailVerificationTokenExpiresAt: challenge.expiresAt,
                emailVerificationSentAt: challenge.sentAt,
                emailVerificationTokenUsedAt: null,
            },
        });
        await this.notifications.sendPartnerEmailVerification(request.email, {
            contactPerson: request.contactPerson,
            orgName: request.orgName,
            token: challenge.rawToken,
        });
        return { status: 'CHECK_INBOX' as const };
    }

    async resendVerificationForAdmin(id: string, adminId: string) {
        const request = await this.prisma.partnerRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Partner request not found.');
        if (request.emailVerifiedAt || request.status !== 'PENDING') {
            throw new ConflictException('This partner does not need email verification.');
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
        await this.prisma.partnerRequest.update({
            where: { id: request.id },
            data: {
                emailVerificationTokenHash: challenge.tokenHash,
                emailVerificationTokenExpiresAt: challenge.expiresAt,
                emailVerificationSentAt: challenge.sentAt,
                emailVerificationTokenUsedAt: null,
            },
        });
        const emailSent = await this.notifications.sendPartnerEmailVerification(request.email, {
            contactPerson: request.contactPerson,
            orgName: request.orgName,
            token: challenge.rawToken,
        });
        await this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: 'partner.email.verification.resent',
                resource: 'partner-request',
                details: { partnerRequestId: id, emailSent },
            },
        });
        return { emailSent };
    }

    /**
     * PUBLIC login. Accepts either the email + password chosen at application
     * time, or the access token issued on approval. Only APPROVED partners get
     * a token either way.
     */
    async login(dto: PartnerLoginDto) {
        const request = dto.accessToken
            ? await this.findByAccessToken(dto.accessToken)
            : await this.findByPassword(dto);

        if (request.status !== 'APPROVED') {
            throw new ForbiddenException(
                request.status === 'PENDING' && !hasVerifiedEmail(request.status, request.emailVerifiedAt)
                    ? 'Confirm your email address before your application can be reviewed.'
                    : request.status === 'PENDING'
                      ? 'Your application is still under review.'
                      : `Your partner access has been ${request.status.toLowerCase()}.`,
            );
        }
        if (!hasVerifiedEmail(request.status, request.emailVerifiedAt)) {
            throw new ForbiddenException('Confirm your email address before signing in.');
        }
        if (!request.partnerId) {
            throw new ForbiddenException('Partner account is not fully provisioned yet.');
        }

        await this.prisma.partnerRequest.update({
            where: { id: request.id },
            data: { tokenLastUsedAt: new Date() },
        });

        // sub = admin-api partnerId, so portal-api scoping (sub === partnerId) holds.
        const token = this.jwt.sign(
            { sub: request.partnerId, email: request.email, role: 'PARTNER' },
            { expiresIn: '24h' },
        );
        return {
            accessToken: token,
            partner: { id: request.partnerId, orgName: request.orgName, email: request.email },
        };
    }

    private async findByPassword(dto: PartnerLoginDto) {
        const email = (dto.email ?? '').trim().toLowerCase();
        const request = await this.prisma.partnerRequest.findUnique({ where: { email } });
        const ok = await bcrypt.compare(dto.password ?? '', request?.passwordHash ?? ABSENT_PARTNER_HASH);
        if (!request || !ok) {
            throw new UnauthorizedException('Invalid email or password.');
        }
        return request;
    }

    /**
     * The digest is uniquely indexed, so a token resolves to at most one partner.
     * A token issued to one organisation can never sign another one in.
     */
    private async findByAccessToken(raw: string) {
        if (!isValidAccessToken(raw, 'PARTNER')) {
            throw new UnauthorizedException('That access token is not valid.');
        }
        const request = await this.prisma.partnerRequest.findUnique({
            where: { accessTokenHash: hashAccessToken(raw) },
        });
        if (!request) {
            throw new UnauthorizedException('That access token is not valid.');
        }
        return request;
    }

    /** ADMIN — the review queue for the admin-frontend Access Management page. */
    async list() {
        return this.prisma.partnerRequest.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                orgName: true,
                contactPerson: true,
                email: true,
                phone: true,
                status: true,
                emailVerifiedAt: true,
                emailVerificationSentAt: true,
                partnerId: true,
                decisionReason: true,
                decidedBy: true,
                decidedAt: true,
                createdAt: true,
                tokenIssuedAt: true,
                tokenLastUsedAt: true,
            },
        });
    }

    /** ADMIN — grant, reject, revoke, or re-grant a partner request. */
    async decide(id: string, dto: DecidePartnerDto, adminId: string) {
        const request = await this.prisma.partnerRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Partner request not found.');

        assertAccessTransition(request.status, dto.decision, 'partner');
        if (dto.decision === 'APPROVED' && !hasVerifiedEmail(request.status, request.emailVerifiedAt)) {
            throw new BadRequestException(
                'Confirm the contact email before granting partner access. The applicant must use the verification link first.',
            );
        }

        const engine = await this.syncPartnerAccess(request, dto);
        const decision = await this.persistDecision(request, dto, adminId, engine);
        await this.recordDecisionAudit(id, adminId, dto, engine.partnerId, decision.issuing);
        const emailSent = await this.notifyDecision(decision.updated, dto, decision.plaintext);

        return {
            id: decision.updated.id,
            status: decision.updated.status,
            partnerId: decision.updated.partnerId,
            emailSent,
        };
    }

    private async syncPartnerAccess(
        request: PartnerRequestRecord,
        dto: DecidePartnerDto,
    ): Promise<{ partnerId: string | null; applicationId: string | null }> {
        let { partnerId, applicationId } = request;
        const needsEngine = dto.decision !== 'REJECTED' || partnerId !== null;
        if (!needsEngine) return { partnerId, applicationId };

        if (!partnerId) {
            const app = await this.adminApi.createApplication({
                orgName: request.orgName,
                contactPerson: request.contactPerson,
                email: request.email,
                phone: request.phone,
            });
            partnerId = app.partnerId;
            applicationId = app.id;
        }

        await this.adminApi.setAccess(partnerId, dto.decision, dto.reason);
        return { partnerId, applicationId };
    }

    private async persistDecision(
        request: PartnerRequestRecord,
        dto: DecidePartnerDto,
        adminId: string,
        engine: { partnerId: string | null; applicationId: string | null },
    ) {
        const issuing = dto.decision === 'APPROVED' && !request.accessTokenHash;
        const plaintext = issuing ? generateAccessToken('PARTNER') : null;
        const updated = await this.prisma.partnerRequest.update({
            where: { id: request.id },
            data: {
                status: dto.decision,
                decisionReason: dto.reason,
                decidedBy: adminId,
                decidedAt: new Date(),
                partnerId: engine.partnerId,
                applicationId: engine.applicationId,
                ...(plaintext
                    ? {
                          accessTokenHash: hashAccessToken(plaintext),
                          accessTokenSealed: sealAccessToken(plaintext),
                          tokenIssuedAt: new Date(),
                      }
                    : {}),
            },
        });
        return { updated, plaintext, issuing };
    }

    private recordDecisionAudit(
        id: string,
        adminId: string,
        dto: DecidePartnerDto,
        partnerId: string | null,
        issuing: boolean,
    ) {
        return this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: `partner.${dto.decision.toLowerCase()}`,
                resource: 'partner-request',
                details: { partnerRequestId: id, partnerId, reason: dto.reason, tokenIssued: issuing },
            },
        });
    }

    private notifyDecision(
        updated: PartnerRequestRecord,
        dto: DecidePartnerDto,
        plaintext: string | null,
    ): Promise<boolean> {
        if (dto.decision === 'APPROVED') {
            const token = plaintext ?? openAccessToken(updated.accessTokenSealed);
            return token
                ? this.notifications.sendPartnerApproved(updated.email, {
                      contactPerson: updated.contactPerson,
                      orgName: updated.orgName,
                      accessToken: token,
                  })
                : Promise.resolve(false);
        }
        if (dto.decision === 'REJECTED') {
            return this.notifications.sendPartnerRejected(updated.email, {
                contactPerson: updated.contactPerson,
                orgName: updated.orgName,
                reason: dto.reason,
            });
        }
        return this.notifications.sendPartnerRevoked(updated.email, {
            contactPerson: updated.contactPerson,
            orgName: updated.orgName,
            reason: dto.reason,
        });
    }

    /**
     * ADMIN — the handover card: every detail plus the access token, unsealed.
     * The token is a bearer credential, so this is admin-only and never listed.
     */
    async card(id: string) {
        const request = await this.prisma.partnerRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Partner request not found.');
        if (request.status !== 'APPROVED') {
            throw new ForbiddenException('A handover card exists only for an approved partner.');
        }

        return {
            kind: 'PARTNER' as const,
            id: request.id,
            orgName: request.orgName,
            contactPerson: request.contactPerson,
            email: request.email,
            phone: request.phone,
            partnerId: request.partnerId,
            status: request.status,
            accessToken: openAccessToken(request.accessTokenSealed),
            tokenIssuedAt: request.tokenIssuedAt,
            tokenLastUsedAt: request.tokenLastUsedAt,
            approvedAt: request.decidedAt,
            portalUrl: process.env.PARTNER_PORTAL_URL || 'https://bio-partner-portal.vercel.app',
        };
    }

    /** ADMIN — replace the token (leak, or an unreadable seal after key rotation). */
    async rotateToken(id: string, adminId: string) {
        const request = await this.prisma.partnerRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Partner request not found.');
        if (request.status !== 'APPROVED') {
            throw new ForbiddenException('Only an approved partner has a token to rotate.');
        }

        const plaintext = generateAccessToken('PARTNER');
        await this.prisma.partnerRequest.update({
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
                action: 'partner.token.rotated',
                resource: 'partner-request',
                details: { partnerRequestId: id },
            },
        });

        const emailSent = await this.notifications.sendPartnerTokenRotated(request.email, {
            contactPerson: request.contactPerson,
            orgName: request.orgName,
            accessToken: plaintext,
        });

        return { ...(await this.card(id)), emailSent };
    }

    /**
     * ADMIN — re-send the partner's current access details, unprompted by any
     * new decision. For when a partner says the original mail never arrived.
     */
    async resendAccess(id: string, adminId: string) {
        const request = await this.prisma.partnerRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Partner request not found.');
        if (request.status !== 'APPROVED') {
            throw new ForbiddenException('Only an approved partner has access details to resend.');
        }
        const token = openAccessToken(request.accessTokenSealed);
        if (!token) {
            throw new ForbiddenException('No access token on file — rotate one instead of resending.');
        }

        const emailSent = await this.notifications.sendPartnerAccessResent(request.email, {
            contactPerson: request.contactPerson,
            orgName: request.orgName,
            accessToken: token,
        });

        await this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: 'partner.access.resent',
                resource: 'partner-request',
                details: { partnerRequestId: id, emailSent },
            },
        });

        return { emailSent };
    }

    // ── Partner self-service profile (item 14) ───────────────────────────────

    /**
     * A partner's own profile, keyed by the `partnerId` on its JWT — the same id
     * that is the token's `sub`, so a partner can only ever read its own.
     */
    async profile(partnerId: string) {
        const request = await this.prisma.partnerRequest.findFirst({
            where: { partnerId },
            select: {
                id: true,
                orgName: true,
                contactPerson: true,
                email: true,
                phone: true,
                status: true,
                partnerId: true,
                createdAt: true,
                decidedAt: true,
            },
        });
        if (!request) throw new NotFoundException('Partner profile not found.');

        return {
            ...request,
            /** The email is the sign-in identity; changing it is a staff action. */
            editable: ['orgName', 'contactPerson', 'phone'],
        };
    }

    /**
     * Updates the partner's contact details, and mirrors them into the partner
     * engine so the admin console and the payout statements do not drift from
     * what the partner sees in its own portal.
     *
     * The engine mirror is best-effort: admin-api sleeps on Render's free tier,
     * and a cold start there must not fail a partner's attempt to fix their own
     * phone number. The backend row is authoritative for contact details.
     */
    async updateProfile(
        partnerId: string,
        dto: { orgName?: string; contactPerson?: string; phone?: string },
    ) {
        const request = await this.prisma.partnerRequest.findFirst({
            where: { partnerId },
            select: { id: true },
        });
        if (!request) throw new NotFoundException('Partner profile not found.');

        const data = {
            ...(dto.orgName !== undefined ? { orgName: dto.orgName.trim() } : {}),
            ...(dto.contactPerson !== undefined
                ? { contactPerson: dto.contactPerson.trim() }
                : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        };
        if (Object.keys(data).length === 0) {
            return this.profile(partnerId);
        }

        await this.prisma.partnerRequest.update({ where: { id: request.id }, data });

        await this.prisma.auditLog.create({
            data: {
                userId: partnerId,
                action: 'partner.profile.updated',
                resource: 'partner-request',
                details: { partnerRequestId: request.id, fields: Object.keys(data) },
            },
        });

        return this.profile(partnerId);
    }

    // ── Admin visibility into the partner engine ─────────────────────────────
    //
    // admin-frontend previously had no view of anything the admin-api engine
    // (PRD-046) tracks for a partner — campaigns, funnel, commission
    // statements, payouts — even though staff could approve the partner that
    // owns all of it. These proxy the engine so the browser only ever talks to
    // this backend, reusing the retry/staff-token logic already in
    // `PartnerAdminApiClient` instead of duplicating it client-side.

    /** One fetch for a partner's whole engine workspace: identity, campaigns, funnel, statements, payouts. */
    async engineSnapshot(partnerId: string) {
        const [partner, campaigns, funnel, statements, payouts] = await Promise.all([
            this.adminApi.getPartner(partnerId),
            this.adminApi.listCampaigns(partnerId),
            this.adminApi.getFunnel(partnerId),
            this.adminApi.listStatements(partnerId),
            this.adminApi.listPayouts(partnerId),
        ]);
        return { partner, campaigns, funnel, statements, payouts };
    }

    /** ADMIN — close out a commission period for a partner on their behalf. */
    generateStatement(partnerId: string, period: string) {
        return this.adminApi.generateStatement(partnerId, period);
    }

    /** ADMIN/FINANCE — advance a payout: PENDING -> SIGNED_OFF -> RELEASED. */
    updatePayoutStatus(payoutId: string, status: 'SIGNED_OFF' | 'RELEASED', approver?: string, reason?: string) {
        return this.adminApi.updatePayoutStatus(payoutId, status, approver, reason);
    }

    /** ADMIN — pause/resume one campaign, short of revoking the whole partner. */
    setCampaignActive(partnerId: string, campaignId: string, deactivate: boolean) {
        return this.adminApi.setCampaignActive(partnerId, campaignId, deactivate);
    }
}
