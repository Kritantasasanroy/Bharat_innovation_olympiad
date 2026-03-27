import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) { }

    async register(dto: RegisterDto) {
        // Check if user exists
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existing) {
            throw new ConflictException('Email already registered');
        }

        // Resolve school by code
        let schoolId: string | undefined;
        if (dto.schoolCode) {
            const school = await this.prisma.school.findUnique({ where: { code: dto.schoolCode } });
            if (school) {
                schoolId = school.id;
            } else {
                throw new BadRequestException('Invalid school code');
            }
        }

        // Hash password
        const passwordHash = await bcrypt.hash(dto.password, 12);

        // Create user
        const user = await this.prisma.user.create({
            data: {
                email: dto.email,
                passwordHash,
                firstName: dto.firstName,
                lastName: dto.lastName,
                role: dto.role || 'STUDENT',
                classBand: dto.classBand,
                schoolId,
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                classBand: true,
                schoolId: true,
                createdAt: true,
            },
        });

        // Generate tokens
        const tokens = await this.generateTokens(user.id, user.email, user.role);

        return { user, tokens };
    }

    async login(dto: LoginDto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
            select: {
                id: true,
                email: true,
                passwordHash: true,
                firstName: true,
                lastName: true,
                role: true,
                classBand: true,
                schoolId: true,
                isActive: true,
            },
        });

        if (!user || !user.isActive) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const valid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!valid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const { passwordHash, ...userData } = user;
        const tokens = await this.generateTokens(user.id, user.email, user.role);

        return { user: userData, tokens };
    }

    async refresh(refreshToken: string) {
        const tokenRecord = await this.prisma.refreshToken.findUnique({
            where: { token: refreshToken },
            include: { user: true },
        });

        if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }

        // Delete old refresh token (rotation)
        await this.prisma.refreshToken.delete({ where: { id: tokenRecord.id } });

        // Generate new tokens
        const tokens = await this.generateTokens(
            tokenRecord.user.id,
            tokenRecord.user.email,
            tokenRecord.user.role,
        );

        return tokens;
    }

    async logout(refreshToken: string) {
        await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }

    async getMe(userId: string) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                classBand: true,
                schoolId: true,
                school: { select: { name: true } },
                profileImageUrl: true,
                isActive: true,
                createdAt: true,
            },
        });
    }

    async getAllStudentsWithMarks() {
        return this.prisma.user.findMany({
            where: { role: 'STUDENT' },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                classBand: true,
                school: { select: { name: true } },
                createdAt: true,
                attempts: {
                    select: {
                        id: true,
                        status: true,
                        totalScore: true,
                        maxScore: true,
                        submittedAt: true,
                        examInstance: {
                            select: {
                                exam: { select: { title: true } }
                            }
                        }
                    },
                    orderBy: { submittedAt: 'desc' },
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    private async generateTokens(userId: string, email: string, role: string) {
        const payload: JwtPayload = { sub: userId, email, role };

        const accessToken = this.jwtService.sign(payload, {
            secret: process.env.JWT_SECRET || 'dev-jwt-secret',
            expiresIn: '15m',
        });

        const refreshToken = uuid();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        await this.prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId,
                expiresAt,
            },
        });

        return { accessToken, refreshToken };
    }
}
