import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isTrainingModuleKey, TRAINING_MODULES } from './training.constants';

@Injectable()
export class TrainingService {
    constructor(private prisma: PrismaService) {}

    /**
     * The full checklist, with each module marked attended or not.
     *
     * Always returns every module, not only the recorded ones — the page is a
     * checklist, and a checklist that omits the unticked boxes is a list. The
     * catalogue lives in code (see `TRAINING_MODULES`), so this joins the fixed
     * list against whatever the student has saved.
     */
    async getForUser(userId: string) {
        const records = await this.prisma.trainingRecord.findMany({
            where: { userId },
            select: { moduleKey: true, attendedAt: true },
        });
        const attended = new Map(records.map((r) => [r.moduleKey, r.attendedAt]));

        return {
            modules: TRAINING_MODULES.map((m) => ({
                key: m.key,
                label: m.label,
                attended: attended.has(m.key),
                attendedAt: attended.get(m.key) ?? null,
            })),
        };
    }

    /**
     * Replace the student's whole checklist with `moduleKeys`.
     *
     * A whole-set replace rather than per-module toggles, because that is what
     * the form is: a student ticks several boxes and presses Save once. Sending
     * the resulting set means unticking works without a separate delete call and
     * the saved state cannot drift from what is on screen.
     *
     * Run in a transaction so a half-applied save is impossible — the failure
     * mode of the obvious implementation (delete-all, then insert) is a student
     * losing every tick they had because the insert failed.
     *
     * `attendedAt` is preserved for modules that were already ticked: it records
     * when the student first said they attended, and re-saving the form after
     * ticking one more box must not rewrite the history of the other five.
     */
    async save(userId: string, moduleKeys: string[]) {
        const unknown = moduleKeys.filter((k) => !isTrainingModuleKey(k));
        if (unknown.length > 0) {
            throw new BadRequestException(
                `Unknown training module: ${unknown.join(', ')}.`,
            );
        }

        const wanted = [...new Set(moduleKeys)];

        await this.prisma.$transaction(async (tx) => {
            await tx.trainingRecord.deleteMany({
                where: { userId, moduleKey: { notIn: wanted } },
            });
            for (const moduleKey of wanted) {
                await tx.trainingRecord.upsert({
                    where: { userId_moduleKey: { userId, moduleKey } },
                    // Nothing to change on a module that is already ticked —
                    // this is what keeps the original `attendedAt`.
                    update: {},
                    create: { userId, moduleKey },
                });
            }
        });

        return this.getForUser(userId);
    }
}
