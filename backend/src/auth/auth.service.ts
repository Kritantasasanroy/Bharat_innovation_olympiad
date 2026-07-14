import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeSchoolCode } from '../school/school-directory.helpers';
import { SchoolSlotService } from '../slot/school-slot.service';
import { SyncUserDto, UpdateProfileDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private schoolSlotService: SchoolSlotService,
    ) { }

    /**
     * Resolve the school code a student typed or picked. Codes come off printed
     * cards and forwarded messages, so matching tolerates case, spacing and a
     * missing hyphen.
     */
    private async resolveSchoolId(schoolCode?: string): Promise<string | undefined> {
        if (!schoolCode?.trim()) return undefined;
        const school = await this.prisma.school.findUnique({
            where: { code: normalizeSchoolCode(schoolCode) },
            select: { id: true },
        });
        if (!school) {
            throw new BadRequestException(
                'We could not find a school with that code. Check it, or search for your school by name.',
            );
        }
        return school.id;
    }

    async syncUser(email: string, dto: SyncUserDto) {
        const existing = await this.prisma.user.findUnique({ where: { email } });

        // A coordinator may have put this student on their roster already. That
        // row has `invitedAt` and no account behind it; registering claims it,
        // keeping the school that invited them.
        if (existing) {
            if (existing.activatedAt) return existing;

            // The inviting school wins — a student cannot register their way out
            // of the roster that invited them. But an invited row with no school
            // (or a student who picked one at registration) still needs linking,
            // otherwise they stay invisible to every school-scoped query.
            const schoolId =
                existing.schoolId ?? (await this.resolveSchoolId(dto.schoolCode)) ?? null;

            const claimed = await this.prisma.user.update({
                where: { id: existing.id },
                data: {
                    firstName: dto.firstName || existing.firstName,
                    lastName: dto.lastName || existing.lastName,
                    classBand: dto.classBand ?? existing.classBand,
                    schoolId,
                    activatedAt: new Date(),
                    ...(existing.referralCode ? {} : { referralCode: dto.referralCode ?? null }),
                },
            });

            // This was missing: only brand-new users were ever auto-allocated, so
            // a student who came in through a school's roster — the common case for
            // a school-run exam — was never booked into their school's slot, and the
            // admin slot page reported "0 student(s) auto-allocated" for a school
            // that plainly had students.
            if (schoolId) {
                await this.schoolSlotService.autoAllocateForNewStudent(claimed.id, schoolId);
            }

            return claimed;
        }

        const schoolId = await this.resolveSchoolId(dto.schoolCode);

        const user = await this.prisma.user.create({
            data: {
                email,
                firstName: dto.firstName,
                lastName: dto.lastName,
                role: dto.role || 'STUDENT',
                classBand: dto.classBand,
                schoolId,
                activatedAt: new Date(),
                // Remembered so the later paid conversion can be credited to
                // the referring partner's campaign (PRD-046 attribution).
                referralCode: dto.referralCode ?? null,
            }
        });

        // Same school -> same slot: if this student's school already has a
        // slot assignment for any exam instance, book them into it
        // immediately. No-ops when the school has no assignment yet, so
        // registration is unaffected for every exam that still uses manual
        // slot picking.
        if (schoolId) {
            await this.schoolSlotService.autoAllocateForNewStudent(user.id, schoolId);
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
                // An empty string clears the number rather than storing "".
                ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
                classBand: dto.classBand,
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
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
