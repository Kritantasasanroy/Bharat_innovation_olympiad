import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttemptStatus, BookingStatus, Prisma } from '@prisma/client';
import { isDemoExam } from '../common/demo-exams';
import { GoogleDriveService } from '../common/services/google-drive.service';
import { MediaKind, ObjectStorageService } from '../common/services/object-storage.service';
import { ImportQuestionDto, ImportQuestionsDto } from './dto/import-questions.dto';
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
    private readonly logger = new Logger(ExamService.name);

    constructor(
        private prisma: PrismaService,
        private storage: ObjectStorageService,
        private config: ConfigService,
        private drive: GoogleDriveService,
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
                // Retired exams stay in the database for their attempts and
                // certificates but must not reappear in the catalogue.
                isArchived: false,
                // The rehearsal paper is reached through the exam it gates, not
                // by picking it out of the list.
                isTrial: false,
                classBands: { has: classBand },
                instances: { some: { endsAt: { gte: now } } },
            },
            include: {
                sections: {
                    select: {
                        id: true,
                        title: true,
                        sortOrder: true,
                        _count: { select: { sectionQuestions: true } },
                    },
                    orderBy: { sortOrder: 'asc' },
                },
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

    /**
     * The rehearsal paper: a trial exam that runs the full proctored
     * environment but is never scored or ranked.
     *
     * Returns the newest non-archived one, so replacing the trial is a matter
     * of creating and publishing a new one rather than finding and editing the
     * old. Returns null rather than throwing — "no trial configured" is a valid
     * state that must not strand every student behind a paper that does not
     * exist, and the caller decides what to do about it.
     */
    async findActiveTrialExam() {
        return this.prisma.exam.findFirst({
            where: { isTrial: true, isArchived: false },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                description: true,
                durationMinutes: true,
                totalMarks: true,
                isTrial: true,
                instances: {
                    orderBy: { startsAt: 'asc' },
                    take: 1,
                    select: { id: true, startsAt: true, endsAt: true },
                },
                _count: { select: { sections: true } },
            },
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
                                        // Olympiad-format fields the student is
                                        // meant to see. Authoring-only columns
                                        // (learningObjective, competency,
                                        // metadata) are deliberately absent.
                                        externalId: true,
                                        partCode: true,
                                        partName: true,
                                        sectionCode: true,
                                        sectionName: true,
                                        topic: true,
                                        questionCategory: true,
                                        bloomLevel: true,
                                        futureReadyInsight: true,
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

        // A `userId` means this is the student-facing read. The list query
        // filters archived exams out, so this route must too — otherwise a
        // retired exam stays fully readable to anyone who kept its URL, which
        // would defeat the point of archiving it. Trial exams are exempt: they
        // are fetched by id on purpose, from the exam they gate.
        if (userId && exam.isArchived && !exam.isTrial) {
            throw new NotFoundException('Exam not found');
        }

        const flattenedSections = exam.sections.map(s => flattenSection(s));

        // Mirrors the paywall in `AttemptService.startAttempt` so the device-check
        // page can warn about a locked pass up front. Advisory only — the server
        // gate is what actually enforces it.
        const requiresAccessPass = !isDemoExam(exam.id);

        if (userId) {
            // Sections are preserved, not collapsed. Each pillar is sat as a
            // block with its name on screen, so shuffling happens *within* a
            // section only — a cross-section shuffle used to run here and made
            // the headings meaningless. The per-section seed still gives every
            // student a different order.
            return {
                ...exam,
                requiresAccessPass,
                sections: flattenedSections.map((section) => ({
                    ...section,
                    questions: seededShuffle(
                        section.questions,
                        hashString(`${userId}:${exam.id}:${section.id}`),
                    ),
                })),
            };
        }

        return { ...exam, requiresAccessPass, sections: flattenedSections };
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
    async findAllExamsForAdmin(includeArchived = false) {
        const exams = await this.prisma.exam.findMany({
            // Archived exams are hidden by default but never deleted — the admin
            // page has a "Show archived" toggle to bring them back into view.
            where: includeArchived ? {} : { isArchived: false },
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
        isTrial?: boolean;
        requiresTrial?: boolean;
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
        isTrial?: boolean;
        requiresTrial?: boolean;
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

    // ── Admin: media gallery ─────────────────────────────────────────────────
    //
    // The upload ticket above only gets a file to the storage provider. These
    // three methods are the gallery on top of it: every finished upload is
    // recorded here so it can be reused across questions (not just the one it
    // was uploaded for) and permanently deleted independent of any question.

    /** Called once the browser's direct upload to the provider has finished. */
    async recordMediaAsset(data: {
        kind: 'IMAGE' | 'VIDEO';
        provider: 'cloudinary' | 's3';
        url: string;
        publicId: string;
        filename?: string;
        bytes?: number;
    }) {
        return this.prisma.mediaAsset.create({ data });
    }

    /** Every gallery item, newest first, flagged with which questions still use it. */
    async listMediaAssets(kind?: 'IMAGE' | 'VIDEO') {
        const [assets, questions] = await Promise.all([
            this.prisma.mediaAsset.findMany({
                where: kind ? { kind } : undefined,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.question.findMany({ select: { imageUrl: true, videoUrl: true } }),
        ]);
        const inUse = new Set<string>();
        for (const q of questions) {
            if (q.imageUrl) inUse.add(q.imageUrl);
            if (q.videoUrl) inUse.add(q.videoUrl);
        }
        return assets.map((asset) => ({ ...asset, inUse: inUse.has(asset.url) }));
    }

    /** Whether the Drive gallery is reachable, and where it is. */
    driveGalleryStatus() {
        const folderId = this.drive.defaultFolderId;
        return {
            configured: this.drive.isConfigured && Boolean(folderId),
            hasApiKey: this.drive.isConfigured,
            folderId: folderId || null,
            folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : null,
            hint: !this.drive.isConfigured
                ? 'Set GOOGLE_DRIVE_API_KEY (Drive API enabled) to sync from Drive.'
                : !folderId
                  ? 'Set GOOGLE_DRIVE_GALLERY_FOLDER_ID to the shared gallery folder.'
                  : 'The folder must be shared "Anyone with the link — Viewer".',
        };
    }

    /**
     * Mirrors every image in the shared Google Drive gallery folder into object
     * storage and records each one in the media gallery.
     *
     * Files already mirrored (matched on `MediaAsset.filename`) are skipped, so
     * this is safe to run repeatedly — an admin re-runs it after adding images
     * to the folder and only the new ones move.
     *
     * One failing image never fails the run. A folder of fifty where three are
     * not shared should import forty-seven and *say* which three did not, not
     * roll everything back over an authoring mistake.
     */
    async syncDriveGallery(folderId?: string) {
        const files = await this.drive.listFolder(folderId);

        const existing = await this.prisma.mediaAsset.findMany({
            where: { kind: 'IMAGE' },
            select: { filename: true },
        });
        const alreadyMirrored = new Set(
            existing.map((a) => a.filename).filter((f): f is string => Boolean(f)),
        );

        const imported: { filename: string; url: string }[] = [];
        const skipped: string[] = [];
        const failed: { filename: string; reason: string }[] = [];

        for (const file of files) {
            if (alreadyMirrored.has(file.name)) {
                skipped.push(file.name);
                continue;
            }
            try {
                const { buffer, contentType } = await this.drive.fetchImage(file.id);
                const uploaded = await this.storage.uploadImageBuffer(
                    buffer,
                    file.name,
                    contentType,
                );
                await this.prisma.mediaAsset.create({
                    data: {
                        kind: 'IMAGE',
                        provider: uploaded.provider,
                        url: uploaded.url,
                        publicId: uploaded.publicId,
                        filename: file.name,
                        bytes: buffer.byteLength,
                    },
                });
                imported.push({ filename: file.name, url: uploaded.url });
            } catch (err) {
                failed.push({ filename: file.name, reason: (err as Error).message });
            }
        }

        this.logger.log(
            `Drive gallery sync: ${imported.length} imported, ${skipped.length} already present, ${failed.length} failed.`,
        );
        return { total: files.length, imported, skipped, failed };
    }

    /** Permanently deletes at the storage provider, then drops the gallery row. Refuses while a question still points at it. */
    async deleteMediaAsset(id: string) {
        const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
        if (!asset) throw new NotFoundException('Media asset not found.');

        const inUse = await this.prisma.question.findFirst({
            where: { OR: [{ imageUrl: asset.url }, { videoUrl: asset.url }] },
            select: { id: true, text: true },
        });
        if (inUse) {
            throw new BadRequestException(
                `Still attached to a question ("${inUse.text.slice(0, 60)}"). Remove it from that question first.`,
            );
        }

        await this.storage.deleteAsset(
            asset.kind === 'VIDEO' ? 'video' : 'image',
            asset.provider as 'cloudinary' | 's3',
            asset.publicId,
        );
        await this.prisma.mediaAsset.delete({ where: { id } });
        return { deleted: true };
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

    /**
     * Imports a whole Olympiad question paper into one exam, building the
     * section structure out of the questions themselves.
     *
     * The workbook groups questions by **Part Name** — the five pillars
     * (Entrepreneurship Mindset, Problem Solving & Innovation, …) — and that
     * grouping *is* the exam's section structure. So rather than making an
     * admin create five sections by hand and then import five times, one upload
     * creates or reuses a section per distinct part, in the order the parts
     * first appear in the file, and attaches each question in file order.
     *
     * Images resolve in a fixed order, and a row that cannot resolve one is
     * imported anyway and *reported*, never silently left blank:
     *   1. `imageSourceUrl` → Drive file id → an already-mirrored gallery asset
     *   2. `imageFilename`  → a gallery asset with that filename
     *   3. unresolved       → listed in `imagesUnresolved`
     */
    async importExamQuestions(examId: string, dto: ImportQuestionsDto) {
        const exam = await this.prisma.exam.findUnique({
            where: { id: examId },
            select: { id: true, title: true },
        });
        if (!exam) throw new NotFoundException('Exam not found');

        const { questions, replaceExisting = false } = dto;

        // ── Validate before writing anything ──
        // A 50-row paper that fails on row 37 must not leave 36 questions
        // behind, and the admin needs the row number, not a Prisma error.
        const problems: string[] = [];
        questions.forEach((q, i) => {
            const row = i + 2; // +1 for zero-index, +1 for the header row
            const correct = q.options.filter((o) => o.isCorrect).length;
            if (correct !== 1) {
                problems.push(`Row ${row}: ${correct} options marked correct, expected exactly 1.`);
            }
            if (q.options.some((o) => !o.text.trim())) {
                problems.push(`Row ${row}: at least one option is blank.`);
            }
            if (!q.text.trim()) problems.push(`Row ${row}: question text is empty.`);
        });
        if (problems.length) {
            throw new BadRequestException(
                `Import refused — nothing was written.\n${problems.slice(0, 20).join('\n')}` +
                    (problems.length > 20 ? `\n…and ${problems.length - 20} more.` : ''),
            );
        }

        // ── Resolve images against the gallery ──
        const gallery = await this.prisma.mediaAsset.findMany({
            where: { kind: 'IMAGE' },
            select: { url: true, filename: true },
        });
        const byFilename = new Map(
            gallery
                .filter((a): a is { url: string; filename: string } => Boolean(a.filename))
                .map((a) => [a.filename.toLowerCase(), a.url]),
        );

        const imagesUnresolved: { externalId?: string; wanted: string }[] = [];
        const resolveImage = (q: ImportQuestionDto): string | null => {
            if (q.imageFilename) {
                const hit = byFilename.get(q.imageFilename.toLowerCase());
                if (hit) return hit;
            }
            // A Drive link resolves through the mirror, never by hot-linking:
            // the sync names each mirrored asset after its Drive filename.
            const wanted = q.imageFilename || q.imageSourceUrl;
            if (wanted) imagesUnresolved.push({ externalId: q.externalId, wanted });
            return null;
        };

        // ── Group into sections by Part Name, preserving first-appearance order ──
        const sectionOrder: string[] = [];
        const bySection = new Map<string, ImportQuestionDto[]>();
        for (const q of questions) {
            const title = (q.partName || q.partCode || 'General').trim();
            if (!bySection.has(title)) {
                bySection.set(title, []);
                sectionOrder.push(title);
            }
            bySection.get(title)!.push(q);
        }

        const created = await this.prisma.$transaction(
            async (tx) => {
                if (replaceExisting) {
                    // Sections cascade to SectionQuestion, which detaches the old
                    // questions. The Question rows themselves stay in the bank.
                    await tx.examSection.deleteMany({ where: { examId } });
                }

                const existingSections = await tx.examSection.findMany({
                    where: { examId },
                    select: { id: true, title: true, sortOrder: true },
                });
                const sectionByTitle = new Map(existingSections.map((s) => [s.title, s]));
                let nextOrder = existingSections.length;

                let questionCount = 0;
                const sections: { title: string; questions: number }[] = [];

                for (const title of sectionOrder) {
                    let section = sectionByTitle.get(title);
                    if (!section) {
                        section = await tx.examSection.create({
                            data: {
                                examId,
                                title,
                                sortOrder: nextOrder++,
                                // 0 = every question in the pool is assigned.
                                questionsToAssign: 0,
                            },
                            select: { id: true, title: true, sortOrder: true },
                        });
                        sectionByTitle.set(title, section);
                    }

                    const startAt = await tx.sectionQuestion.count({
                        where: { sectionId: section.id },
                    });
                    const rows = bySection.get(title)!;

                    for (const [i, q] of rows.entries()) {
                        const question = await tx.question.create({
                            data: {
                                type: 'MCQ',
                                difficulty: q.difficulty ?? 'EASY',
                                text: q.text.trim(),
                                options: q.options.map((o, idx) => ({
                                    id: String(idx),
                                    text: o.text.trim(),
                                    isCorrect: o.isCorrect,
                                })),
                                marks: q.marks ?? 1,
                                negativeMarks: q.negativeMarks ?? 0,
                                explanation: q.explanation ?? null,
                                imageUrl: resolveImage(q),
                                externalId: q.externalId ?? null,
                                grade: q.grade ?? null,
                                partCode: q.partCode ?? null,
                                partName: q.partName ?? null,
                                sectionCode: q.sectionCode ?? null,
                                sectionName: q.sectionName ?? null,
                                topic: q.topic ?? null,
                                learningObjective: q.learningObjective ?? null,
                                questionCategory: q.questionCategory ?? null,
                                bloomLevel: q.bloomLevel ?? null,
                                competency: q.competency ?? null,
                                questionFormat: q.questionFormat ?? null,
                                futureReadyInsight: q.futureReadyInsight ?? null,
                                imageFilename: q.imageFilename ?? null,
                                imageSourceUrl: q.imageSourceUrl ?? null,
                                metadata: (q.metadata ?? undefined) as Prisma.InputJsonValue,
                            },
                            select: { id: true },
                        });
                        await tx.sectionQuestion.create({
                            data: {
                                sectionId: section.id,
                                questionId: question.id,
                                sortOrder: startAt + i,
                            },
                        });
                        questionCount++;
                    }
                    sections.push({ title, questions: rows.length });
                }

                return { questionCount, sections };
            },
            // 50 questions × 2 inserts each, against Neon over the public
            // internet. The 5s default is not enough.
            { timeout: 120_000 },
        );

        this.logger.log(
            `Imported ${created.questionCount} questions into "${exam.title}" across ${created.sections.length} sections.`,
        );

        return {
            ...created,
            imagesUnresolved,
            note: imagesUnresolved.length
                ? `${imagesUnresolved.length} question(s) expect an image that is not in the gallery yet. ` +
                  'Run "Sync from Drive" on the Media Gallery, then re-import to attach them.'
                : undefined,
        };
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

    /**
     * Archive or restore an exam.
     *
     * Archiving also unpublishes, because the two must not disagree: an exam
     * that is `isPublished: true, isArchived: true` is invisible in the list but
     * would still satisfy the publication check in the start gate.
     */
    async setExamArchived(id: string, archived: boolean) {
        const exam = await this.prisma.exam.findUnique({ where: { id }, select: { id: true } });
        if (!exam) throw new NotFoundException('Exam not found');
        return this.prisma.exam.update({
            where: { id },
            data: archived ? { isArchived: true, isPublished: false } : { isArchived: false },
        });
    }

    /**
     * Retire every exam except those named, plus the practice and trial papers.
     *
     * Practice exams are exempt because students are told they stay free and
     * available; the trial paper is exempt because every real exam depends on
     * it. Nothing is deleted — see `setExamArchived`.
     */
    async archiveAllExcept(keepExamIds: string[]) {
        const keep = new Set(keepExamIds);
        const candidates = await this.prisma.exam.findMany({
            where: { isArchived: false, isTrial: false },
            select: { id: true, title: true },
        });

        const toArchive = candidates.filter((e) => !keep.has(e.id) && !isDemoExam(e.id));
        if (toArchive.length === 0) return { archived: 0, exams: [] };

        await this.prisma.exam.updateMany({
            where: { id: { in: toArchive.map((e) => e.id) } },
            data: { isArchived: true, isPublished: false },
        });
        return { archived: toArchive.length, exams: toArchive };
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
