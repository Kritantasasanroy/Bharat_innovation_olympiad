import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { normalizeSchoolCode } from '../school/school-directory.helpers';
import { SchoolSlotService } from '../slot/school-slot.service';
import { RollNumberService } from '../user/roll-number.service';
import { SyncUserDto, UpdateProfileDto } from './dto/auth.dto';
import { PhoneOtpService } from './phone-otp.service';
import { normalizePhone } from './phone.helpers';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private schoolSlotService: SchoolSlotService,
        private notifications: NotificationService,
        private phoneOtpService: PhoneOtpService,
        private rollNumbers: RollNumberService,
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

    /**
     * A verified phone can only back one account, so reject a number already
     * held by someone else before writing — the unique index would otherwise
     * surface as an opaque 500 at the end of registration.
     */
    private async resolveVerifiedPhone(
        rawPhone: string | undefined,
        currentUserId?: string,
        otpCode?: string,
    ): Promise<string | undefined> {
        if (!rawPhone?.trim()) return undefined;

        // Ownership is proven server-side, always. Storing a client-supplied
        // number unchecked would let someone claim a stranger's number and
        // then sign in as them by phone OTP.
        if (!otpCode?.trim()) {
            throw new BadRequestException('Verify your mobile number with the code we sent you.');
        }
        const phone = await this.phoneOtpService.verifyOtp(rawPhone, otpCode);

        const holder = await this.prisma.user.findUnique({
            where: { phone },
            select: { id: true },
        });
        if (holder && holder.id !== currentUserId) {
            throw new BadRequestException(
                'That phone number is already registered to another account. Sign in with it instead.',
            );
        }
        return phone;
    }

    /**
     * School is now mandatory for students.
     *
     * "The school option in registration form needs clarity/detailing/enhancement"
     * and "Section of student needs to be captured for school level
     * tracking/mapping by teachers/school admin" — school-level tracking is only
     * as good as its worst row, and an optional school left it patchy.
     *
     * Enforced for `STUDENT` only: staff and partner accounts have no school, and
     * an invited roster row already carries the school that invited it.
     */
    private assertSchoolResolved(
        role: SyncUserDto['role'],
        schoolId: string | null | undefined,
    ): void {
        const isStudent = (role ?? 'STUDENT') === 'STUDENT';
        if (isStudent && !schoolId) {
            throw new BadRequestException(
                'Choose your school to continue. Search for it by name, city or pincode, enter your school code, or add it if it is not listed.',
            );
        }
    }

    /** A section only means something alongside a school, so it is stored with one. */
    private normaliseSection(raw: string | undefined, schoolId: string | null | undefined) {
        const section = raw?.trim();
        if (!section || !schoolId) return null;
        return section.slice(0, 10);
    }

    /**
     * Section is mandatory for students, alongside the school.
     *
     * Same reasoning as {@link assertSchoolResolved}: results are reported to a
     * school class by class, and rows with no section cannot be grouped into
     * classes at all. Students who genuinely have no section are told on the
     * form to write "NA", so there is no student for whom this is unanswerable.
     *
     * Only demanded when there is a school to attach it to — a staff or partner
     * account has neither.
     */
    private assertSectionResolved(
        role: SyncUserDto['role'],
        schoolId: string | null | undefined,
        section: string | null,
    ): void {
        const isStudent = (role ?? 'STUDENT') === 'STUDENT';
        if (isStudent && schoolId && !section) {
            throw new BadRequestException(
                'Enter your class section, exactly as your school writes it. If your school does not use sections, write NA.',
            );
        }
    }

    async syncUser(email: string, dto: SyncUserDto) {
        const existing = await this.prisma.user.findUnique({ where: { email } });

        // A coordinator may have put this student on their roster already. That
        // row has `invitedAt` and no account behind it; registering claims it,
        // keeping the school that invited them.
        if (existing) {
            // An email that already backs a live account cannot register a
            // second student — one mailbox, one student. This used to return
            // the existing account silently, which was fine when it really was
            // the same person retrying, but the common real case is a parent's
            // single email re-used for a second child: the form would appear to
            // "work" and quietly sign the parent into the first child's account
            // with none of the second child's details saved anywhere.
            if (existing.activatedAt) {
                throw new ConflictException(
                    'Wards must have unique email IDs for registration. One email can only be used for one ward.',
                );
            }

            // The inviting school wins — a student cannot register their way out
            // of the roster that invited them. But an invited row with no school
            // (or a student who picked one at registration) still needs linking,
            // otherwise they stay invisible to every school-scoped query.
            const schoolId =
                existing.schoolId ?? (await this.resolveSchoolId(dto.schoolCode)) ?? null;
            this.assertSchoolResolved(existing.role, schoolId);
            const phone = await this.resolveVerifiedPhone(dto.phone, existing.id, dto.phoneCode);
            const classBand = dto.classBand ?? existing.classBand;
            // An invited roster row may already carry a section the school set,
            // so the incoming value only has to satisfy this when there is
            // nothing on file to fall back to.
            const section = this.normaliseSection(dto.section, schoolId) ?? existing.section;
            this.assertSectionResolved(existing.role, schoolId, section);

            const claimed = await this.prisma.user.update({
                where: { id: existing.id },
                data: {
                    firstName: dto.firstName || existing.firstName,
                    lastName: dto.lastName || existing.lastName,
                    classBand,
                    schoolId,
                    section,
                    activatedAt: new Date(),
                    ...(phone ? { phone } : {}),
                    ...(existing.referralCode ? {} : { referralCode: dto.referralCode ?? null }),
                    // Only stamp acceptance we were actually told about, and never
                    // overwrite an earlier acceptance with nothing.
                    ...(dto.termsVersion
                        ? { termsAcceptedAt: new Date(), termsVersion: dto.termsVersion }
                        : {}),
                },
            });

            // Issued here too, not only for brand-new accounts: a student who
            // arrived through a school's roster is just as much a participant and
            // needs a roll number on their admit card. `ensureFor` is a no-op if
            // they somehow already have one.
            const rollNumber = await this.rollNumbers.ensureFor(claimed.id, claimed.classBand);

            // This was missing: only brand-new users were ever auto-allocated, so
            // a student who came in through a school's roster — the common case for
            // a school-run exam — was never booked into their school's slot, and the
            // admin slot page reported "0 student(s) auto-allocated" for a school
            // that plainly had students.
            if (schoolId) {
                await this.schoolSlotService.autoAllocateForNewStudent(claimed.id, schoolId);
            }

            // `claimed` was read before the roll number was written, so merge it
            // in rather than returning a row that says `rollNumber: null` to a
            // client that is about to display it.
            return { ...claimed, rollNumber };
        }

        const schoolId = (await this.resolveSchoolId(dto.schoolCode)) ?? null;
        this.assertSchoolResolved(dto.role, schoolId);
        const section = this.normaliseSection(dto.section, schoolId);
        this.assertSectionResolved(dto.role, schoolId, section);
        const phone = await this.resolveVerifiedPhone(dto.phone, undefined, dto.phoneCode);

        const user = await this.prisma.user.create({
            data: {
                email,
                phone,
                firstName: dto.firstName,
                lastName: dto.lastName,
                role: dto.role || 'STUDENT',
                classBand: dto.classBand,
                schoolId,
                section,
                activatedAt: new Date(),
                ...(dto.termsVersion
                    ? { termsAcceptedAt: new Date(), termsVersion: dto.termsVersion }
                    : {}),
                // Remembered so the later paid conversion can be credited to
                // the referring partner's campaign (PRD-046 attribution).
                referralCode: dto.referralCode ?? null,
            }
        });

        const rollNumber = await this.rollNumbers.ensureFor(user.id, user.classBand);

        // Same school -> same slot: if this student's school already has a
        // slot assignment for any exam instance, book them into it
        // immediately. No-ops when the school has no assignment yet, so
        // registration is unaffected for every exam that still uses manual
        // slot picking.
        if (schoolId) {
            await this.schoolSlotService.autoAllocateForNewStudent(user.id, schoolId);
        }

        // Only for genuinely new accounts — claiming an invited roster row
        // returns earlier, so a student is never welcomed twice.
        //
        // Milestone 1 of 4 (registration). The roll number rides along so the
        // student has it in writing from the first minute.
        await this.notifications.sendWelcome(user.email, user.firstName, rollNumber);

        return { ...user, rollNumber };
    }

    async getUserByEmail(email: string) {
        return this.prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                // Must stay in step with `getUserByPhone` and `getMe`: whichever
                // route signs a student in, the client caches this object as the
                // whole user. Omitting `phone` here blanks it in the UI until the
                // next profile load, and makes an unchanged number look new.
                phone: true,
                firstName: true,
                lastName: true,
                role: true,
                classBand: true,
                rollNumber: true,
                section: true,
                schoolId: true,
                school: { select: { name: true } },
                isActive: true,
            },
        });
    }

    /** Resolve an account from a verified phone OTP sign-in. */
    async getUserByPhone(phone: string) {
        return this.prisma.user.findUnique({
            where: { phone: normalizePhone(phone) },
            select: {
                id: true,
                email: true,
                phone: true,
                firstName: true,
                lastName: true,
                role: true,
                classBand: true,
                rollNumber: true,
                section: true,
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

    /**
     * The canonical "who am I" payload. It must select **exactly** what
     * `updateProfile` returns — the client replaces its cached user with
     * whichever of the two responded last, so a field present in one and absent
     * from the other appears to save and then vanish on the next page load.
     * That is precisely what happened to `phone`.
     */
    async getMe(userId: string) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                phone: true,
                firstName: true,
                lastName: true,
                role: true,
                classBand: true,
                rollNumber: true,
                section: true,
                schoolId: true,
                school: { select: { name: true } },
                profileImageUrl: true,
                isActive: true,
                createdAt: true,
            },
        });
    }

    async updateProfile(userId: string, dto: UpdateProfileDto) {
        // Normalised on the way in so a self-edited number stays in the same
        // E.164 form phone sign-in looks accounts up by, and cannot collide
        // with a number another account already holds.
        //
        // Verification (an SMS code) is only demanded when the number actually
        // *changes*. Otherwise every profile save — even one that only edits the
        // name — would fail for any student who already has a phone on file,
        // because there is nothing in the form to satisfy the code check.
        /**
         * Class is locked once it has been set.
         *
         * "Class selection for the Olympiad is final upon confirmation and
         * cannot be modified later." It decides which paper the student sits
         * and which cohort they are ranked against, and it is confirmed a
         * second time on the instructions screen immediately before the exam
         * opens — so a student who could still change it afterwards could sit
         * the Class 6 paper and be ranked as a Class 12 student.
         *
         * Refused here rather than only hidden in the profile form: the form is
         * a `<select>` on a public API, and "the UI doesn't offer it" is not a
         * rule. Support can still correct a genuine mistake through the admin
         * console, which is audited.
         *
         * A no-op resubmission of the same value is allowed, so a student
         * editing their name does not have to strip the field out.
         */
        let classBandUpdate: { classBand?: number } = {};
        if (dto.classBand !== undefined) {
            const current = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { classBand: true },
            });
            if (current?.classBand == null) {
                classBandUpdate = { classBand: dto.classBand };
            } else if (current.classBand !== dto.classBand) {
                throw new BadRequestException(
                    'Your class cannot be changed once it is set, because it decides which paper you sit and who you are ranked against. Raise a support ticket and we will correct it for you.',
                );
            }
        }

        let phoneUpdate: { phone?: string | null } = {};
        if (dto.phone !== undefined) {
            if (!dto.phone.trim()) {
                phoneUpdate = { phone: null };
            } else {
                const incoming = normalizePhone(dto.phone);
                const current = await this.prisma.user.findUnique({
                    where: { id: userId },
                    select: { phone: true },
                });
                if (current?.phone === incoming) {
                    // Unchanged — no re-verification, nothing to write.
                    phoneUpdate = {};
                } else {
                    phoneUpdate = {
                        phone: await this.resolveVerifiedPhone(dto.phone, userId, dto.phoneCode),
                    };
                }
            }
        }

        const user = await this.prisma.user.update({
            where: { id: userId },
            data: {
                firstName: dto.firstName,
                lastName: dto.lastName,
                ...phoneUpdate,
                ...classBandUpdate,
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                role: true,
                classBand: true,
                rollNumber: true,
                section: true,
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
                /**
                 * Parent / guardian details and the consent trail.
                 *
                 * Collected at registration part 2 and stored on `GuardianProfile`,
                 * but until now readable nowhere in the admin portal — so a
                 * question like "did this child's parent actually consent, and
                 * when were they told?" had to be answered from the database by
                 * hand. `approvalEmailSentAt` is when the confirmation mail went
                 * out and `parentalConsentAt` is when the parent accepted; both
                 * are shown on the student page.
                 *
                 * `ipAddress` is deliberately not selected — it is kept as part
                 * of the legal consent record, not as something to display next
                 * to a child's name.
                 */
                guardianProfile: {
                    select: {
                        guardianFirstName: true,
                        guardianLastName: true,
                        relationship: true,
                        guardianEmail: true,
                        guardianPhone: true,
                        studentDob: true,
                        gender: true,
                        city: true,
                        state: true,
                        idDocumentType: true,
                        idDocumentUrl: true,
                        parentalConsentAt: true,
                        dataConsentAt: true,
                        consentVersion: true,
                        approvalEmailSentAt: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                },
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
