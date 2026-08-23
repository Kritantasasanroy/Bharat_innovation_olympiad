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

    async listForSchool(schoolId: string) {
        return this.listVisible('SCHOOL');
    }

    private async listVisible(audience: 'PARTNER' | 'SCHOOL') {
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

    async listAll() {
        return this.prisma.announcement.findMany({
            orderBy: { publishedAt: 'desc' },
        });
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
