import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import {
    generateAccessToken,
    hashAccessToken,
    isValidAccessToken,
    openAccessToken,
    randomCode,
    sealAccessToken,
} from '../common/access-token';
import { PrismaService } from '../prisma/prisma.service';
import { ApplySchoolDto, DecideSchoolDto, SchoolLoginDto } from './dto/school.dto';

/**
 * School access lifecycle (PRD-047), mirroring the partner loop: a school
 * self-applies (public, no credential), staff review it alongside partner
 * requests, and approval provisions the `School` row, a coordinator `User`
 * (role `SCHOOL`), and exactly one access token.
 *
 * Unlike partners there is no password: the access token *is* the credential.
 * Its digest is uniquely indexed, so a token resolves to at most one school and
 * can never sign a different one in.
 */
@Injectable()
export class SchoolService {
    constructor(
        private prisma: PrismaService,
        private jwt: JwtService,
    ) {}

    /** PUBLIC self-service application — no token, no side effects beyond the row. */
    async apply(dto: ApplySchoolDto) {
        const coordinatorEmail = dto.coordinatorEmail.trim().toLowerCase();

        const existing = await this.prisma.schoolRequest.findUnique({
            where: { coordinatorEmail },
        });
        if (existing) {
            throw new ConflictException('A school request already exists for this coordinator email.');
        }

        // Approval provisions a coordinator User under this address. Refusing here
        // rather than at approval keeps us from ever mutating someone's existing
        // account (a student's, say) into a school coordinator behind their back.
        const claimed = await this.prisma.user.findUnique({ where: { email: coordinatorEmail } });
        if (claimed) {
            throw new ConflictException(
                'That email already has a BIO account. Use a different coordinator email.',
            );
        }

        const request = await this.prisma.schoolRequest.create({
            data: {
                schoolName: dto.schoolName,
                board: dto.board,
                udiseCode: dto.udiseCode || null,
                city: dto.city,
                state: dto.state,
                coordinatorName: dto.coordinatorName,
                coordinatorEmail,
                coordinatorPhone: dto.coordinatorPhone,
                status: 'PENDING',
            },
        });

        return {
            status: request.status,
            schoolName: request.schoolName,
            coordinatorEmail: request.coordinatorEmail,
        };
    }

    /** PUBLIC — the access token issued on approval is the only way in. */
    async login(dto: SchoolLoginDto) {
        if (!isValidAccessToken(dto.accessToken, 'SCHOOL')) {
            throw new UnauthorizedException('That access token is not valid.');
        }

        const request = await this.prisma.schoolRequest.findUnique({
            where: { accessTokenHash: hashAccessToken(dto.accessToken) },
            include: { school: true },
        });
        if (!request) {
            throw new UnauthorizedException('That access token is not valid.');
        }
        if (request.status !== 'APPROVED') {
            throw new ForbiddenException(`Your school's access has been ${request.status.toLowerCase()}.`);
        }
        if (!request.school || !request.coordinatorUserId) {
            throw new ForbiddenException('This school is not fully provisioned yet.');
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

    /** ADMIN — the school half of the Access Management queue. */
    async list() {
        return this.prisma.schoolRequest.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                schoolName: true,
                board: true,
                udiseCode: true,
                city: true,
                state: true,
                coordinatorName: true,
                coordinatorEmail: true,
                coordinatorPhone: true,
                status: true,
                schoolId: true,
                decisionReason: true,
                decidedBy: true,
                decidedAt: true,
                createdAt: true,
                tokenIssuedAt: true,
                tokenLastUsedAt: true,
            },
        });
    }

    /** `SCH-XXXXXX` over the unambiguous alphabet; retried on the rare collision. */
    private async allocateSchoolCode(tx: Prisma.TransactionClient): Promise<string> {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const code = `SCH-${randomCode(6)}`;
            const taken = await tx.school.findUnique({ where: { code } });
            if (!taken) return code;
        }
        throw new ConflictException('Could not allocate a unique school code. Try again.');
    }

    /**
     * ADMIN — grant / reject / revoke / re-grant.
     *
     * Approving provisions the School + coordinator User the first time, and
     * mints the token the first time. Revoking deactivates the coordinator so
     * live sessions die on their next request, not when their JWT expires.
     */
    async decide(id: string, dto: DecideSchoolDto, adminId: string) {
        const request = await this.prisma.schoolRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('School request not found.');

        // A school keeps one token across a revoke/re-grant cycle, so the
        // handover card already in the coordinator's inbox stays valid.
        const issuing = dto.decision === 'APPROVED' && !request.accessTokenHash;
        const plaintext = issuing ? generateAccessToken('SCHOOL') : null;

        const result = await this.prisma.$transaction(async (tx) => {
            let schoolId = request.schoolId;
            let coordinatorUserId = request.coordinatorUserId;

            if (dto.decision === 'APPROVED' && (!schoolId || !coordinatorUserId)) {
                const school = await tx.school.create({
                    data: {
                        name: request.schoolName,
                        code: await this.allocateSchoolCode(tx),
                        city: request.city,
                        state: request.state,
                        board: request.board,
                        udiseCode: request.udiseCode,
                    },
                });

                const [firstName, ...rest] = request.coordinatorName.trim().split(/\s+/);
                const coordinator = await tx.user.create({
                    data: {
                        email: request.coordinatorEmail,
                        firstName: firstName || request.coordinatorName,
                        lastName: rest.join(' '),
                        role: Role.SCHOOL,
                        schoolId: school.id,
                        isActive: true,
                    },
                });

                schoolId = school.id;
                coordinatorUserId = coordinator.id;
            }

            // Deactivating the coordinator is what makes a revoke immediate:
            // JwtStrategy rejects an inactive user on the very next request.
            if (coordinatorUserId) {
                await tx.user.update({
                    where: { id: coordinatorUserId },
                    data: { isActive: dto.decision === 'APPROVED' },
                });
            }

            const updated = await tx.schoolRequest.update({
                where: { id },
                data: {
                    status: dto.decision,
                    decisionReason: dto.reason,
                    decidedBy: adminId,
                    decidedAt: new Date(),
                    schoolId,
                    coordinatorUserId,
                    ...(plaintext
                        ? {
                              accessTokenHash: hashAccessToken(plaintext),
                              accessTokenSealed: sealAccessToken(plaintext),
                              tokenIssuedAt: new Date(),
                          }
                        : {}),
                },
            });

            await tx.auditLog.create({
                data: {
                    userId: adminId,
                    action: `school.${dto.decision.toLowerCase()}`,
                    resource: 'school-request',
                    details: { schoolRequestId: id, schoolId, reason: dto.reason, tokenIssued: issuing },
                },
            });

            return updated;
        });

        return { id: result.id, status: result.status, schoolId: result.schoolId };
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
            city: request.city,
            state: request.state,
            coordinatorName: request.coordinatorName,
            coordinatorEmail: request.coordinatorEmail,
            coordinatorPhone: request.coordinatorPhone,
            status: request.status,
            accessToken: openAccessToken(request.accessTokenSealed),
            tokenIssuedAt: request.tokenIssuedAt,
            tokenLastUsedAt: request.tokenLastUsedAt,
            approvedAt: request.decidedAt,
            portalUrl: process.env.SCHOOL_PORTAL_URL || 'https://bio-school-portal.vercel.app',
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

        return this.card(id);
    }
}
