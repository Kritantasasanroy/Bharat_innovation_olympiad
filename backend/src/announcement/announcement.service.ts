import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CreateAnnouncementInput = {
    title: string;
    body: string;
    audience: 'PARTNER' | 'SCHOOL' | 'ALL';
    publishedAt: Date;
    expiresAt?: Date | null;
    active?: boolean;
    targetSchoolId?: string | null;
};

export type UpdateAnnouncementInput = Partial<CreateAnnouncementInput>;

@Injectable()
export class AnnouncementService {
    constructor(private prisma: PrismaService) {}

    private now() {
        return new Date();
    }

    async listForPartner(partnerId: string) {
        return this.listVisible('PARTNER');
    }

    /** Sees broadcasts (targetSchoolId null) plus posts targeted at this school specifically. */
    async listForSchool(schoolId: string) {
        return this.listVisible('SCHOOL', schoolId);
    }

    private async listVisible(audience: 'PARTNER' | 'SCHOOL', schoolId?: string) {
        const now = this.now();
        return this.prisma.announcement.findMany({
            where: {
                AND: [
                    { active: true },
                    { publishedAt: { lte: now } },
                    { audience: { in: [audience, 'ALL'] } },
                    {
                        OR: [
                            { expiresAt: null },
                            { expiresAt: { gt: now } },
                        ],
                    },
                    ...(schoolId
                        ? [{ OR: [{ targetSchoolId: null }, { targetSchoolId: schoolId }] }]
                        : []),
                ],
            },
            orderBy: { publishedAt: 'desc' },
            select: {
                id: true,
                title: true,
                body: true,
                audience: true,
                publishedAt: true,
                expiresAt: true,
            },
        });
    }

    /** Admin's own list, decorated with the target school's name for narrowed posts. */
    async listAll() {
        const items = await this.prisma.announcement.findMany({
            orderBy: { publishedAt: 'desc' },
        });
        const schoolIds = [...new Set(items.map((a) => a.targetSchoolId).filter((id): id is string => !!id))];
        if (schoolIds.length === 0) return items.map((a) => ({ ...a, targetSchoolName: null as string | null }));
        const schools = await this.prisma.school.findMany({
            where: { id: { in: schoolIds } },
            select: { id: true, name: true },
        });
        const nameById = new Map(schools.map((s) => [s.id, s.name]));
        return items.map((a) => ({
            ...a,
            targetSchoolName: a.targetSchoolId ? nameById.get(a.targetSchoolId) ?? null : null,
        }));
    }

    async create(data: CreateAnnouncementInput & { createdBy: string }) {
        return this.prisma.announcement.create({ data });
    }

    async update(id: string, data: UpdateAnnouncementInput) {
        try {
            return await this.prisma.announcement.update({ where: { id }, data });
        } catch (e) {
            if ((e as { code?: string }).code === 'P2025') {
                throw new NotFoundException('Announcement not found.');
            }
            throw e;
        }
    }

    async delete(id: string) {
        try {
            return await this.prisma.announcement.delete({ where: { id } });
        } catch (e) {
            if ((e as { code?: string }).code === 'P2025') {
                throw new NotFoundException('Announcement not found.');
            }
            throw e;
        }
    }
}
