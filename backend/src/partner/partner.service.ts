import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
    generateAccessToken,
    hashAccessToken,
    isValidAccessToken,
    openAccessToken,
    sealAccessToken,
} from '../common/access-token';
import { PrismaService } from '../prisma/prisma.service';
import { PartnerAdminApiClient } from './admin-api.client';
import { ApplyPartnerDto, DecidePartnerDto, PartnerLoginDto } from './dto/partner.dto';

/**
 * A real hash to compare against when no partner matches the email, so the
 * "unknown email" and "wrong password" paths cost the same time. Built once at
 * import; a hand-written placeholder would make bcrypt throw on a malformed salt.
 */
const ABSENT_PARTNER_HASH = bcrypt.hashSync('bio-timing-equalizer', 10);

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
    ) {}

    /** PUBLIC self-service application — no token, and no engine round-trip. */
    async apply(dto: ApplyPartnerDto) {
        const email = dto.email.trim().toLowerCase();
        const existing = await this.prisma.partnerRequest.findUnique({ where: { email } });
        if (existing) {
            throw new ConflictException('A partner application already exists for this email.');
        }

        const passwordHash = await bcrypt.hash(dto.password, 10);
        const request = await this.prisma.partnerRequest.create({
            data: {
                orgName: dto.orgName,
                contactPerson: dto.contactPerson,
                email,
                phone: dto.phone,
                passwordHash,
                status: 'PENDING',
            },
        });

        return { status: request.status, email: request.email, orgName: request.orgName };
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
                request.status === 'PENDING'
                    ? 'Your application is still under review.'
                    : `Your partner access has been ${request.status.toLowerCase()}.`,
            );
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

    /**
     * ADMIN — grant / reject / revoke / re-grant. Mirrors the decision into the
     * engine, provisioning the engine partner on first approval.
     */
    async decide(id: string, dto: DecidePartnerDto, adminId: string) {
        const request = await this.prisma.partnerRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Partner request not found.');

        let { partnerId, applicationId } = request;

        // Rejecting an application that was never provisioned needs no engine call.
        const needsEngine = dto.decision !== 'REJECTED' || partnerId !== null;

        if (needsEngine && !partnerId) {
            const app = await this.adminApi.createApplication({
                orgName: request.orgName,
                contactPerson: request.contactPerson,
                email: request.email,
                phone: request.phone,
            });
            partnerId = app.partnerId;
            applicationId = app.id;
        }

        // Drive the engine gate first; if it fails we don't record a false local state.
        if (needsEngine && partnerId) {
            await this.adminApi.setAccess(partnerId, dto.decision, dto.reason);
        }

        // A partner gets exactly one access token, minted at first approval and
        // kept across a revoke/re-grant cycle so the handover card stays valid.
        const issuing = dto.decision === 'APPROVED' && !request.accessTokenHash;
        const plaintext = issuing ? generateAccessToken('PARTNER') : null;

        const updated = await this.prisma.partnerRequest.update({
            where: { id },
            data: {
                status: dto.decision,
                decisionReason: dto.reason,
                decidedBy: adminId,
                decidedAt: new Date(),
                partnerId,
                applicationId,
                ...(plaintext
                    ? {
                          accessTokenHash: hashAccessToken(plaintext),
                          accessTokenSealed: sealAccessToken(plaintext),
                          tokenIssuedAt: new Date(),
                      }
                    : {}),
            },
        });

        await this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: `partner.${dto.decision.toLowerCase()}`,
                resource: 'partner-request',
                details: { partnerRequestId: id, partnerId, reason: dto.reason, tokenIssued: issuing },
            },
        });

        return { id: updated.id, status: updated.status, partnerId: updated.partnerId };
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

        return this.card(id);
    }
}
