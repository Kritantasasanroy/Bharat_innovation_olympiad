import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttemptStatus, BookingStatus, Prisma } from '@prisma/client';
import { isDemoExam } from '../common/demo-exams';
import { MediaKind, ObjectStorageService } from '../common/services/object-storage.service';
import { ConfigService } from '@nestjs/config';
import {
    canPublish,
    canReleaseResults,
    examPhase,
    isStartable,
    startRefusalReason,
    validateSlotWindow,
} from './exam-lifecycle';

// ── Deterministic seeded shuffle (Fisher-Yates) ──
// Uses a simple mulberry32 PRNG seeded from the userId hash so each
// student gets a unique but repeatable question order.
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash);
}

function mulberry32(seed: number) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function seededShuffle<T>(array: T[], seed: number): T[] {
    const shuffled = [...array];
    const rng = mulberry32(seed);
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Project SectionQuestion rows into the legacy `section.questions` shape
// so admin UI doesn't need to know about the join model.
function flattenSection(section: any, includeAnswer = true) {
    const questions = (section.sectionQuestions || [])
        .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
        .map((sq: any) => ({
            ...sq.question,
            sortOrder: sq.sortOrder,
            ...(includeAnswer ? {} : { correctAnswer: undefined }),
        }));
    const { sectionQuestions, ...rest } = section;
    return { ...rest, questions };
}

@Injectable()
export class ExamService {
    constructor(
        private prisma: PrismaService,
        private storage: ObjectStorageService,
        private config: ConfigService,
    ) { }

    // ── Student-facing ──

    /**
     * The exams a student may see, each stamped with the phase it is in *for that
     * student* (see `exam-lifecycle.ts`).
     *
     * Two rules this query is responsible for, and previously enforced neither of:
     *
     *  - **Unpublished exams are never returned.** There is no `isPublished`
     *    filter to forget further down the stack; a draft exam simply is not in
     *    this result set.
     *  - **A scheduled exam is returned, but marked `SCHEDULED`, not startable.**
     *    Students should be able to see what is coming (and which slot they hold)
     *    without being able to walk into it early — the `phase` says which, and
     *    the start gate independently re-checks it server-side.
     */
    async findAvailableExams(classBand: number, userId: string) {
        const now = new Date();

        const exams = await this.prisma.exam.findMany({
            where: {
                isPublished: true,
                classBands: { has: classBand },
                instances: { some: { endsAt: { gte: now } } },
            },
            include: {
                sections: { select: { id: true, title: true, sortOrder: true } },
                instances: {
                    where: { endsAt: { gte: now } },
                    orderBy: { startsAt: 'asc' },
                    include: {
                        attempts: { where: { userId } },
                        _count: { select: { slots: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const instanceIds = exams.flatMap((e) => e.instances.map((i) => i.id));

        // The student's slot for each instance — the thing item 11 asks us to show
        // them, and the thing the start gate actually turns on.
        const bookings = await this.prisma.booking.findMany({
            where: {
                userId,
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                slot: { examInstanceId: { in: instanceIds } },
            },
            include: { slot: true },
        });
        const slotByInstance = new Map(bookings.map((b) => [b.slot.examInstanceId, b]));

        const completedAttempts = await this.prisma.attempt.findMany({
            where: {
                userId,
                status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] },
                examInstance: { examId: { in: exams.map((e) => e.id) } },
            },
            include: { examInstance: { select: { examId: true } } },
        });
        const completedExamIds = new Set(completedAttempts.map((a) => a.examInstance.examId));

        return exams.map((exam) => {
            const demo = isDemoExam(exam.id);

            const instances = exam.instances.map((instance) => {
                const booking = slotByInstance.get(instance.id);
                // A demo/practice exam is always open inside its window — it runs no
                // slots and exists precisely to be taken at will.
                const phase = demo
                    ? examPhase({
                          isPublished: exam.isPublished,
                          instance,
                          hasSlots: false,
                          now,
                      })
                    : examPhase({
                          isPublished: exam.isPublished,
                          instance,
                          slot: booking?.slot ?? null,
                          hasSlots: instance._count.slots > 0,
                          now,
                      });

                return {
                    ...instance,
                    phase,
                    canStart: isStartable(phase),
                    startBlockedReason: startRefusalReason(phase),
                    /** The student's own slot, so the UI can say when their turn is. */
                    mySlot: booking
                        ? {
                              bookingId: booking.id,
                              bookingStatus: booking.status,
                              slotId: booking.slot.id,
                              label: booking.slot.label,
                              startsAt: booking.slot.startsAt,
                              endsAt: booking.slot.endsAt,
                          }
                        : null,
                };
            });

            // The exam as a whole is startable if any of its instances is.
            const phase = instances.find((i) => i.canStart)?.phase ?? instances[0]?.phase ?? 'ENDED';

            return {
                ...exam,
                instances,
                phase,
                canStart: instances.some((i) => i.canStart),
                isCompleted: demo ? false : completedExamIds.has(exam.id),
            };
        });
    }

    async findExamById(id: string, userId?: string) {
        const exam = await this.prisma.exam.findUnique({
            where: { id },
            include: {
                instances: {
                    where: { endsAt: { gte: new Date() } },
                    orderBy: { startsAt: 'asc' },
                },
                sections: {
                    orderBy: { sortOrder: 'asc' },
                    include: {
                        sectionQuestions: {
                            orderBy: { sortOrder: 'asc' },
                            include: {
                                question: {
                                    select: {
                                        id: true,
                                        type: true,
                                        difficulty: true,
                                        text: true,
                                        options: true,
                                        marks: true,
                                        negativeMarks: true,
                                        timeLimitSecs: true,
                                        mediaUrl: true,
                                        mediaType: true,
                                        imageUrl: true,
                                        videoUrl: true,
                                        tags: true,
                                        explanation: true,
                                        // correctAnswer always excluded at the
                                        // student-facing layer; admin reads it via
                                        // GET /admin/questions
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!exam) throw new NotFoundException('Exam not found');

        const flattenedSections = exam.sections.map(s => flattenSection(s));

        if (userId) {
            const allQuestions = flattenedSections.flatMap(s => s.questions);
            const seed = hashString(userId + exam.id);
            const shuffledQuestions = seededShuffle(allQuestions, seed);
            return {
                ...exam,
                sections: [{
                    id: 'shuffled',
                    title: 'All Questions',
                    sortOrder: 0,
                    examId: exam.id,
                    questions: shuffledQuestions,
                }],
            };
        }

        return { ...exam, sections: flattenedSections };
    }

    async findInstanceById(instanceId: string) {
        return this.prisma.examInstance.findUnique({
            where: { id: instanceId },
            include: { exam: true },
        });
    }

    // ── Admin: exams ──

    /**
     * The admin exam list, each row carrying **why** it can or cannot be published
     * and released. The buttons were previously always enabled and simply failed
     * with a server error; now the page can disable them and say what is missing.
     */
    async findAllExamsForAdmin() {
        const exams = await this.prisma.exam.findMany({
            include: {
                _count: { select: { sections: true, instances: true } },
                instances: { orderBy: { startsAt: 'asc' } },
            },
            orderBy: { createdAt: 'desc' },
        });

        // One grouped count rather than one query per exam.
        const counts = await this.prisma.sectionQuestion.groupBy({
            by: ['sectionId'],
            _count: { _all: true },
        });
        const sections = await this.prisma.examSection.findMany({
            select: { id: true, examId: true },
        });
        const examOfSection = new Map(sections.map((s) => [s.id, s.examId]));

        const questionCount = new Map<string, number>();
        for (const row of counts) {
            const examId = examOfSection.get(row.sectionId);
            if (!examId) continue;
            questionCount.set(examId, (questionCount.get(examId) ?? 0) + row._count._all);
        }

        const now = new Date();

        return exams.map((exam) => {
            const questions = questionCount.get(exam.id) ?? 0;
            const publish = canPublish({
                questionCount: questions,
                instanceCount: exam._count.instances,
            });

            // The latest-ending sitting decides whether the exam is over.
            const last = [...exam.instances].sort((a, b) => +b.endsAt - +a.endsAt)[0];
            const release = last
                ? canReleaseResults({
                      instance: last,
                      normalizedAt: last.resultsNormalizedAt ?? new Date(0),
                      now,
                  })
                : { ok: false, reason: 'This exam has no schedule, so it has no results to release.' };

            return {
                ...exam,
                questionCount: questions,
                canPublish: publish.ok,
                publishBlockedReason: publish.ok ? null : publish.reason,
                canReleaseResults: release.ok,
                releaseBlockedReason: release.ok ? null : release.reason,
                hasEnded: last ? now > last.endsAt : false,
            };
        });
    }

    async createExam(data: {
        title: string;
        description?: string;
        classBands: number[];
        totalMarks: number;
        durationMinutes: number;
        feeAmount?: number;
        easyPct?: number;
        mediumPct?: number;
        hardPct?: number;
    }) {
        // A new exam starts as a DRAFT with results hidden. It used to be created
        // published *and* results-released, which is why an exam with no paper and
        // no schedule was immediately visible to students.
        return this.prisma.exam.create({
            data: { ...data, isPublished: false, isResultReleased: false },
        });
    }

    /**
     * Create an exam, one scheduled instance, and its slots in a single step —
     * the shape the admin "new exam" wizard collects. Unlike {@link createExam}
     * this does **not** force-publish: the wizard passes explicit flags, so an
     * exam can be drafted with its schedule and slots before it goes live.
     *
     * Slot auto-distribution (same-school-together, balance + overflow) is a
     * separate call the wizard makes afterwards, so the admin can review the
     * slots first — see `SchoolSlotService.autoDistributeInstance`.
     */
    async createFull(input: {
        title: string;
        description?: string;
        classBands: number[];
        totalMarks: number;
        durationMinutes: number;
        feeAmount?: number;
        easyPct?: number;
        mediumPct?: number;
        hardPct?: number;
        isPublished?: boolean;
        isResultReleased?: boolean;
        instance: {
            startsAt: string | Date;
            endsAt: string | Date;
            requireSeb?: boolean;
            browserExamKey?: string;
            configKey?: string;
            quitUrl?: string;
        };
        slots: {
            label?: string;
            startsAt: string | Date;
            endsAt: string | Date;
            capacity: number;
        }[];
    }) {
        if (!input.slots?.length) {
            throw new BadRequestException('Add at least one slot.');
        }

        const { instance, slots, isPublished, isResultReleased, ...examData } = input;

        // Slots must sit inside the exam window. A slot scheduled before the exam
        // opens can never be sat: the attempt gate refuses every start before
        // `instance.startsAt`, so its students would watch the slot expire against
        // a Start button that never enables.
        const instanceWindow = {
            startsAt: new Date(instance.startsAt),
            endsAt: new Date(instance.endsAt),
        };
        if (instanceWindow.endsAt <= instanceWindow.startsAt) {
            throw new BadRequestException('The exam window must end after it starts.');
        }
        slots.forEach((s, i) => {
            const check = validateSlotWindow(
                { startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt) },
                instanceWindow,
            );
            if (!check.ok) {
                throw new BadRequestException(`Slot ${i + 1} (${s.label ?? 'unnamed'}): ${check.reason}`);
            }
        });

        return this.prisma.$transaction(async (tx) => {
            const exam = await tx.exam.create({
                data: {
                    ...examData,
                    isPublished: isPublished ?? true,
                    isResultReleased: isResultReleased ?? false,
                },
            });

            const examInstance = await tx.examInstance.create({
                data: {
                    examId: exam.id,
                    startsAt: new Date(instance.startsAt),
                    endsAt: new Date(instance.endsAt),
                    requireSeb: instance.requireSeb ?? false,
                    browserExamKey: instance.browserExamKey,
                    configKey: instance.configKey,
                    quitUrl: instance.quitUrl,
                },
            });

            await tx.examSlot.createMany({
                data: slots.map((s) => ({
                    examInstanceId: examInstance.id,
                    label: s.label,
                    startsAt: new Date(s.startsAt),
                    endsAt: new Date(s.endsAt),
                    capacity: s.capacity,
                })),
            });

            const createdSlots = await tx.examSlot.findMany({
                where: { examInstanceId: examInstance.id },
                orderBy: { startsAt: 'asc' },
            });

            return { exam, instance: examInstance, slots: createdSlots };
        });
    }

    async deleteExam(id: string) {
        await this.prisma.exam.delete({ where: { id } });
    }

    /**
     * The general exam edit. It is also where the admin UI flips `isPublished` and
     * `isResultReleased` from the exam cards, so **the publish and release gates
     * are enforced here**, not only on the dedicated `/publish` and
     * `/release-results` routes.
     *
     * That distinction is the whole point: putting the checks only on the named
     * routes left this one as an unguarded side door, and it is the door the UI
     * actually used. A rule that lives on one of two write paths is not a rule.
     */
    async updateExam(id: string, data: {
        title?: string;
        description?: string | null;
        classBands?: number[];
        totalMarks?: number;
        durationMinutes?: number;
        feeAmount?: number | null;
        easyPct?: number;
        mediumPct?: number;
        hardPct?: number;
        isPublished?: boolean;
        isResultReleased?: boolean;
    }) {
        // Turning a flag ON is gated; turning it OFF is always allowed — taking a
        // bad exam down or pulling back a wrong result must never be blocked.
        if (data.isPublished === true) {
            const exam = await this.prisma.exam.findUnique({
                where: { id },
                select: { _count: { select: { instances: true } } },
            });
            if (!exam) throw new NotFoundException('Exam not found');

            const check = canPublish({
                questionCount: await this.questionCountFor(id),
                instanceCount: exam._count.instances,
            });
            if (!check.ok) throw new BadRequestException(check.reason);
        }

        if (data.isResultReleased === true) {
            await this.assertExamIsOver(id);
        }

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.exam.update({ where: { id }, data });
            if (data.totalMarks !== undefined) {
                await tx.attempt.updateMany({
                    where: { examInstance: { examId: id } },
                    data: { maxScore: data.totalMarks },
                });
            }
            return updated;
        });
    }

    /** Throws unless every sitting of this exam has finished. */
    private async assertExamIsOver(examId: string) {
        const instances = await this.prisma.examInstance.findMany({
            where: { examId },
            orderBy: { endsAt: 'desc' },
            take: 1,
        });
        if (instances.length === 0) {
            throw new BadRequestException(
                'This exam has no schedule, so it has no results to release.',
            );
        }

        // The latest-ending instance decides: while any sitting is still open, the
        // cohort is incomplete and a rank or percentile would be meaningless.
        const check = canReleaseResults({
            instance: instances[0],
            // The exam-level switch predates normalization and does not require it —
            // only that the exam is genuinely over.
            normalizedAt: instances[0].resultsNormalizedAt ?? new Date(0),
            now: new Date(),
        });
        if (!check.ok) throw new BadRequestException(check.reason);
    }

    // ── Admin: sections ──

    async createSection(examId: string, data: { title: string; sortOrder: number; questionsToAssign?: number }) {
        return this.prisma.examSection.create({ data: { ...data, examId } });
    }

    /**
     * Authorises a direct browser → storage upload for a question's picture or
     * video, and returns the ticket that permits it.
     *
     * The file never passes through the API — see `ObjectStorageService` for why
     * (Render's 512 MB would not survive a video). The admin uploads with the
     * ticket, then saves the resulting URL onto the question's `imageUrl` /
     * `videoUrl`.
     */
    async getQuestionMediaUploadUrl(
        kind: MediaKind,
        filename: string,
        contentType: string,
        contentLength: number,
    ) {
        if (kind !== 'image' && kind !== 'video') {
            throw new BadRequestException('kind must be "image" or "video".');
        }
        return this.storage.createUploadTicket(kind, filename, contentType, contentLength);
    }

    async updateSection(id: string, data: any) {
        return this.prisma.examSection.update({ where: { id }, data });
    }

    async deleteSection(id: string) {
        return this.prisma.examSection.delete({ where: { id } });
    }

    // ── Admin: questions (bank + section) ──

    async createBankQuestion(data: any) {
        const { sortOrder: _a, sectionId: _b, ...payload } = data;
        return this.prisma.question.create({ data: payload });
    }

    async bulkCreateBankQuestions(items: any[]) {
        const created: { id: string }[] = [];
        await this.prisma.$transaction(async (tx) => {
            for (const item of items) {
                const { sortOrder: _a, sectionId: _b, ...payload } = item;
                const q = await tx.question.create({ data: payload, select: { id: true } });
                created.push(q);
            }
        }, { timeout: 30_000 });
        return { count: created.length };
    }

    async createQuestion(sectionId: string, data: any) {
        // Create a new bank question AND attach it to this section.
        const { sortOrder: _ignored, sectionId: _ignored2, ...questionData } = data;
        const existingCount = await this.prisma.sectionQuestion.count({ where: { sectionId } });
        return this.prisma.$transaction(async (tx) => {
            const question = await tx.question.create({ data: questionData });
            await tx.sectionQuestion.create({
                data: { sectionId, questionId: question.id, sortOrder: existingCount },
            });
            return question;
        });
    }

    async bulkCreateQuestions(sectionId: string, items: any[]) {
        const existingCount = await this.prisma.sectionQuestion.count({ where: { sectionId } });
        const created: { id: string }[] = [];
        // createMany doesn't return rows; loop so we can wire up SectionQuestion.
        await this.prisma.$transaction(async (tx) => {
            for (let i = 0; i < items.length; i++) {
                const { sortOrder: _a, sectionId: _b, ...payload } = items[i];
                const q = await tx.question.create({ data: payload, select: { id: true } });
                await tx.sectionQuestion.create({
                    data: { sectionId, questionId: q.id, sortOrder: existingCount + i },
                });
                created.push(q);
            }
        }, { timeout: 30_000 });
        return { count: created.length };
    }

    async updateQuestion(id: string, data: any) {
        // Editing a question edits the bank entry. sortOrder/sectionId are
        // ignored here — those live on SectionQuestion.
        const { sortOrder: _a, sectionId: _b, ...payload } = data;
        return this.prisma.question.update({ where: { id }, data: payload });
    }

    async deleteQuestion(id: string) {
        // Cascades to SectionQuestion rows.
        return this.prisma.question.delete({ where: { id } });
    }

    async listBankQuestions(filters: { q?: string; difficulty?: string; examId?: string }) {
        const where: Prisma.QuestionWhereInput = {};
        if (filters.q) where.text = { contains: filters.q, mode: 'insensitive' };
        if (filters.difficulty && ['EASY', 'MEDIUM', 'HARD'].includes(filters.difficulty)) {
            where.difficulty = filters.difficulty as any;
        }
        if (filters.examId) {
            where.sectionLinks = { some: { section: { examId: filters.examId } } };
        }
        return this.prisma.question.findMany({
            where,
            include: {
                sectionLinks: {
                    select: {
                        sectionId: true,
                        sortOrder: true,
                        section: { select: { id: true, title: true, examId: true, exam: { select: { id: true, title: true } } } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
    }

    async attachQuestionToSection(sectionId: string, questionId: string) {
        const existing = await this.prisma.sectionQuestion.findUnique({
            where: { sectionId_questionId: { sectionId, questionId } },
        });
        if (existing) throw new BadRequestException('Question already attached to this section');
        const count = await this.prisma.sectionQuestion.count({ where: { sectionId } });
        return this.prisma.sectionQuestion.create({
            data: { sectionId, questionId, sortOrder: count },
        });
    }

    async detachQuestionFromSection(sectionId: string, questionId: string) {
        return this.prisma.sectionQuestion.delete({
            where: { sectionId_questionId: { sectionId, questionId } },
        });
    }

    async reorderSectionQuestion(sectionId: string, questionId: string, sortOrder: number) {
        return this.prisma.sectionQuestion.update({
            where: { sectionId_questionId: { sectionId, questionId } },
            data: { sortOrder },
        });
    }

    async moveQuestionAcrossSections(
        sourceSectionId: string,
        questionId: string,
        targetSectionId: string,
    ) {
        if (sourceSectionId === targetSectionId) return { moved: false };
        return this.prisma.$transaction(async (tx) => {
            await tx.sectionQuestion.delete({
                where: { sectionId_questionId: { sectionId: sourceSectionId, questionId } },
            });
            const existing = await tx.sectionQuestion.findUnique({
                where: { sectionId_questionId: { sectionId: targetSectionId, questionId } },
            });
            if (existing) return { moved: true, alreadyAttached: true };
            const count = await tx.sectionQuestion.count({ where: { sectionId: targetSectionId } });
            await tx.sectionQuestion.create({
                data: { sectionId: targetSectionId, questionId, sortOrder: count },
            });
            return { moved: true };
        });
    }

    // ── Admin: instances ──

    async listInstances(examId: string) {
        return this.prisma.examInstance.findMany({
            where: { examId },
            orderBy: { startsAt: 'asc' },
            include: { _count: { select: { attempts: true } } },
        });
    }

    async createInstance(examId: string, data: {
        startsAt: Date;
        endsAt: Date;
        requireSeb?: boolean;
        browserExamKey?: string;
        configKey?: string;
        quitUrl?: string;
    }) {
        return this.prisma.examInstance.create({ data: { ...data, examId } });
    }

    /**
     * Edits an instance's window (item 6 — this is what the admin "edit exam"
     * screen now writes to).
     *
     * Moving the window can strand slots outside it, so the new window is checked
     * against every existing slot first. We refuse rather than silently dragging
     * the slots along: a slot is a commitment students have already been booked
     * into, and moving one under them is not a decision this endpoint should make
     * on its own.
     */
    async updateInstance(id: string, data: {
        startsAt?: Date;
        endsAt?: Date;
        requireSeb?: boolean;
        browserExamKey?: string;
        configKey?: string;
        quitUrl?: string;
    }) {
        if (data.startsAt || data.endsAt) {
            const current = await this.prisma.examInstance.findUnique({
                where: { id },
                include: { slots: { orderBy: { startsAt: 'asc' } } },
            });
            if (!current) throw new NotFoundException('Exam instance not found');

            const next = {
                startsAt: data.startsAt ?? current.startsAt,
                endsAt: data.endsAt ?? current.endsAt,
            };
            if (next.endsAt <= next.startsAt) {
                throw new BadRequestException('The exam window must end after it starts.');
            }

            const stranded = current.slots
                .map((s) => ({ slot: s, check: validateSlotWindow(s, next) }))
                .filter((r) => !r.check.ok);

            if (stranded.length > 0) {
                const names = stranded.map((r) => r.slot.label ?? 'unnamed').join(', ');
                throw new BadRequestException(
                    `This window would leave ${stranded.length} slot(s) outside the exam: ${names}. Move those slots first, or widen the window.`,
                );
            }
        }

        return this.prisma.examInstance.update({ where: { id }, data });
    }

    async deleteInstance(id: string) {
        return this.prisma.examInstance.delete({ where: { id } });
    }

    /**
     * Counts the questions actually attached to an exam's sections. This is the
     * number that decides whether there is a paper to publish — a bank question
     * that no section links to would never be served to a student.
     */
    private async questionCountFor(examId: string): Promise<number> {
        return this.prisma.sectionQuestion.count({ where: { section: { examId } } });
    }

    /** Publishing is refused for an exam with no paper or no schedule. */
    async publishExam(id: string) {
        const exam = await this.prisma.exam.findUnique({
            where: { id },
            select: { id: true, _count: { select: { instances: true } } },
        });
        if (!exam) throw new NotFoundException('Exam not found');

        const check = canPublish({
            questionCount: await this.questionCountFor(id),
            instanceCount: exam._count.instances,
        });
        if (!check.ok) throw new BadRequestException(check.reason);

        return this.prisma.exam.update({ where: { id }, data: { isPublished: true } });
    }

    /** Un-publishes an exam, taking it straight back out of every student's list. */
    async unpublishExam(id: string) {
        return this.prisma.exam.update({ where: { id }, data: { isPublished: false } });
    }

    async releaseQuestionPaper(id: string) {
        return this.publishExam(id);
    }

    /**
     * The legacy exam-level release switch (`Exam.isResultReleased`). It is gated
     * on the same rule as the per-instance release: **every** instance of the exam
     * must have finished. Releasing a result for an exam nobody has sat yet was
     * the defect this closes.
     *
     * The richer per-audience release lives in `ResultsService.release`.
     */
    async releaseResults(id: string) {
        const exam = await this.prisma.exam.findUnique({ where: { id }, select: { id: true } });
        if (!exam) throw new NotFoundException('Exam not found');

        await this.assertExamIsOver(id);

        return this.prisma.exam.update({ where: { id }, data: { isResultReleased: true } });
    }

    // ── Admin analytics ──

    async getExamAnalytics(examId: string) {
        const attempts = await this.prisma.attempt.findMany({
            where: {
                examInstance: { examId },
                status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
            },
            select: { totalScore: true, maxScore: true, submittedAt: true },
        });

        const scores = attempts.map((a) => a.totalScore || 0);
        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

        return {
            totalAttempts: attempts.length,
            averageScore: Math.round(avgScore * 100) / 100,
            highestScore: Math.max(...scores, 0),
            lowestScore: Math.min(...scores, 0),
        };
    }
}
