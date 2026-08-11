/**
 * The training modules a student can record attendance for.
 *
 * The orientation session plus the five olympiad pillars — the same five the
 * paper is sectioned by and the same five the final report scores against, so a
 * student can see the line from "I attended this" to "I was marked on this".
 *
 * Order is the order they are shown in, and it matters: orientation first,
 * because that is the one that explains the rest.
 *
 * `key` is a stable slug stored in `TrainingRecord.moduleKey`. **Never rename a
 * key** — the label is what students read and can be reworded freely, but a
 * changed key silently orphans every row already recorded against the old one.
 */
export const TRAINING_MODULES = [
    { key: 'olympiad-orientation', label: 'Olympiad Orientation Session' },
    { key: 'entrepreneurship-mindset', label: 'Entrepreneurship Mindset' },
    { key: 'problem-solving-innovation', label: 'Problem Solving & Innovation' },
    {
        key: 'emerging-tech-digital-stem',
        label: 'Emerging Technologies, Digital Readiness & STEM',
    },
    { key: 'future-readiness-global', label: 'Future Readiness & Global Awareness' },
    { key: 'financial-readiness', label: 'Financial Readiness' },
] as const;

export type TrainingModuleKey = (typeof TRAINING_MODULES)[number]['key'];

export const TRAINING_MODULE_KEYS: readonly string[] = TRAINING_MODULES.map((m) => m.key);

export function isTrainingModuleKey(value: string): value is TrainingModuleKey {
    return TRAINING_MODULE_KEYS.includes(value);
}
