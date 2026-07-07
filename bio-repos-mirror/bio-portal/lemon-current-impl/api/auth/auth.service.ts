import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncUserDto, UpdateProfileDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
    constructor(private prisma: PrismaService) { }

    async syncUser(email: string, dto: SyncUserDto) {
        let user = await this.prisma.user.findUnique({ where: { email } });

        if (!user) {
            let schoolId: string | undefined;
            if (dto.schoolCode) {
                const school = await this.prisma.school.findUnique({ where: { code: dto.schoolCode } });
                if (school) {
                    schoolId = school.id;
                } else {
                    throw new BadRequestException('Invalid school code');
                }
            }

            user = await this.prisma.user.create({
                data: {
                    email,
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    role: dto.role || 'STUDENT',
                    classBand: dto.classBand,
                    schoolId,
                }
            });
        }

        return user;
    }

    async getUserByEmail(email: string) {
        return this.prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                classBand: true,
                schoolId: true,
                school: { select: { name: true } },
                isActive: true,
            },
        });
    }

    async getOrCreateAdmin(email: string) {
        let user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            user = await this.prisma.user.create({
                data: {
                    email,
                    firstName: 'Admin',
                    lastName: 'BIO',
                    role: 'ADMIN',
                },
            });
        }
        return user;
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

    async updateProfile(userId: string, dto: UpdateProfileDto) {
        const user = await this.prisma.user.update({
            where: { id: userId },
            data: {
                firstName: dto.firstName,
                lastName: dto.lastName,
                classBand: dto.classBand,
            },
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
        return user;
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
                faceEmbedding: true,
                attempts: {
                    select: {
                        id: true,
                        status: true,
                        totalScore: true,
                        maxScore: true,
                        submittedAt: true,
                        riskScore: true,
                        examInstance: {
                            select: {
                                exam: { select: { title: true } }
                            }
                        }
                    },
                    orderBy: { submittedAt: 'desc' },
                },
                payments: {
                    select: { id: true, amount: true, status: true, createdAt: true },
                },
            },
            orderBy: { createdAt: 'desc' }
        }).then((students) =>
            students.map(({ faceEmbedding, ...s }) => ({ ...s, faceEnrolled: !!faceEmbedding })),
        );
    }

    async getStudentDetail(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                classBand: true,
                isActive: true,
                createdAt: true,
                faceEmbedding: true,
                school: { select: { id: true, name: true, code: true, city: true, state: true } },
                attempts: {
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        status: true,
                        startedAt: true,
                        submittedAt: true,
                        totalScore: true,
                        maxScore: true,
                        riskScore: true,
                        ipAddress: true,
                        examInstance: {
                            select: {
                                id: true,
                                startsAt: true,
                                endsAt: true,
                                exam: { select: { id: true, title: true, durationMinutes: true } },
                            },
                        },
                        proctorEvents: { select: { type: true } },
                    },
                },
                payments: {
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        razorpayOrderId: true,
                        razorpayPaymentId: true,
                        amount: true,
                        currency: true,
                        status: true,
                        createdAt: true,
                        coupon: { select: { code: true, discountPct: true } },
                        booking: {
                            select: {
                                id: true,
                                status: true,
                                slot: {
                                    select: {
                                        label: true,
                                        startsAt: true,
                                        examInstance: { select: { exam: { select: { title: true } } } },
                                    },
                                },
                            },
                        },
                    },
                },
                bookings: {
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        status: true,
                        createdAt: true,
                        slot: {
                            select: {
                                label: true,
                                startsAt: true,
                                endsAt: true,
                                examInstance: { select: { exam: { select: { title: true } } } },
                            },
                        },
                    },
                },
            },
        });

        if (!user) return null;

        const { faceEmbedding, attempts, ...rest } = user;

        const attemptsWithEventCounts = attempts.map(({ proctorEvents, ...a }) => {
            const eventCounts: Record<string, number> = {};
            for (const e of proctorEvents) eventCounts[e.type] = (eventCounts[e.type] ?? 0) + 1;
            return { ...a, totalViolations: proctorEvents.length, eventCounts };
        });

        const totalViolations = attemptsWithEventCounts.reduce((sum, a) => sum + a.totalViolations, 0);
        const highestRisk = attempts.reduce((max, a) => Math.max(max, a.riskScore ?? 0), 0);
        const totalSpend = user.payments
            .filter((p) => p.status === 'PAID')
            .reduce((sum, p) => sum + p.amount, 0);

        return {
            ...rest,
            faceEnrolled: !!faceEmbedding,
            attempts: attemptsWithEventCounts,
            summary: {
                totalAttempts: attempts.length,
                totalViolations,
                highestRiskScore: highestRisk,
                totalSpend,
                totalPayments: user.payments.length,
            },
        };
    }

}
