import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { PartnerAdminApiClient } from './admin-api.client';
import { ApplyPartnerDto, DecidePartnerDto, PartnerLoginDto } from './dto/partner.dto';

/**
 * Partner access lifecycle owned by the legacy backend (the only JWT signer):
 * self-service apply (public) -> staff grant/revoke -> email+password login.
 * The admin-api partner ENGINE holds the dashboard data and the authoritative
 * `Partner.status` gate; this service keeps the two in lock-step and issues the
 * `role: PARTNER` token whose `sub` is the admin-api partnerId.
 */
@Injectable()
export class PartnerService {
    constructor(
        private prisma: PrismaService,
        private jwt: JwtService,
        private adminApi: PartnerAdminApiClient,
    ) {}

    /** PUBLIC self-service application — no token required (fixes the catch-22). */
    async apply(dto: ApplyPartnerDto) {
        const email = dto.email.trim().toLowerCase();
        const existing = await this.prisma.partnerRequest.findUnique({ where: { email } });
        if (existing) {
            throw new ConflictException('A partner application already exists for this email.');
        }

        // Engine record first: admin-api mints the partnerId + applicationId we adopt.
        const app = await this.adminApi.createApplication({
            orgName: dto.orgName,
            contactPerson: dto.contactPerson,
            email,
            phone: dto.phone,
        });

        const passwordHash = await bcrypt.hash(dto.password, 10);
        const request = await this.prisma.partnerRequest.create({
            data: {
                orgName: dto.orgName,
                contactPerson: dto.contactPerson,
                email,
                phone: dto.phone,
                passwordHash,
                partnerId: app.partnerId,
                applicationId: app.id,
                status: 'PENDING',
            },
        });

        return { status: request.status, email: request.email, orgName: request.orgName };
    }

    /** PUBLIC login — email + password; only APPROVED partners get a token. */
    async login(dto: PartnerLoginDto) {
        const email = dto.email.trim().toLowerCase();
        const request = await this.prisma.partnerRequest.findUnique({ where: { email } });
        if (!request) {
            throw new UnauthorizedException('No partner account found for this email.');
        }
        const ok = await bcrypt.compare(dto.password, request.passwordHash);
        if (!ok) {
            throw new UnauthorizedException('Invalid email or password.');
        }
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

    /** ADMIN — the review queue for the admin-frontend Partner Management page. */
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
            },
        });
    }

    /** ADMIN — grant / reject / revoke / re-grant. Mirrors the decision to the engine. */
    async decide(id: string, dto: DecidePartnerDto, adminId: string) {
        const request = await this.prisma.partnerRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Partner request not found.');
        if (!request.partnerId) {
            throw new BadRequestException('Partner request is missing its engine partner id.');
        }

        // Drive the engine gate first; if it fails we don't record a false local state.
        await this.adminApi.setAccess(request.partnerId, dto.decision, dto.reason);

        const updated = await this.prisma.partnerRequest.update({
            where: { id },
            data: {
                status: dto.decision,
                decisionReason: dto.reason,
                decidedBy: adminId,
                decidedAt: new Date(),
            },
        });

        await this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: `partner.${dto.decision.toLowerCase()}`,
                resource: 'partner-request',
                details: { partnerRequestId: id, partnerId: request.partnerId, reason: dto.reason },
            },
        });

        return { id: updated.id, status: updated.status };
    }
}
