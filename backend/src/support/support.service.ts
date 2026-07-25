import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupportTicketSource, SupportTicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupportTicketDto, DecideSupportTicketDto } from './dto/support.dto';

interface Submitter {
    id: string;
    name: string;
    email: string;
}

/**
 * Support tickets raised by partners and schools, and reviewed by admins. These
 * are free-form help requests — kept separate from the student `Grievance`
 * (which is bound to an exam attempt) because a partner isn't a `User` and the
 * subject matter is different. Before this, partner "support" posted to an
 * in-memory store in portal-api that never reached anyone.
 */
@Injectable()
export class SupportService {
    constructor(private prisma: PrismaService) {}

    create(source: SupportTicketSource, submitter: Submitter, dto: CreateSupportTicketDto) {
        return this.prisma.supportTicket.create({
            data: {
                source,
                submitterId: submitter.id,
                submitterName: submitter.name,
                submitterEmail: submitter.email,
                category: dto.category,
                subject: dto.subject,
                message: dto.message,
            },
        });
    }

    /** A raiser's own tickets (partner by partnerId, school by coordinator user id). */
    listForSubmitter(submitterId: string) {
        return this.prisma.supportTicket.findMany({
            where: { submitterId },
            orderBy: { createdAt: 'desc' },
        });
    }

    /** ADMIN — every ticket, newest first, optionally filtered. */
    listAll(filters: { status?: SupportTicketStatus; source?: SupportTicketSource } = {}) {
        const where: Prisma.SupportTicketWhereInput = {};
        if (filters.status) where.status = filters.status;
        if (filters.source) where.source = filters.source;
        return this.prisma.supportTicket.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
    }

    /** ADMIN — mark under review or resolved, optionally with a response. */
    async decide(id: string, dto: DecideSupportTicketDto, adminId: string) {
        const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
        if (!ticket) throw new NotFoundException('Support ticket not found.');

        return this.prisma.supportTicket.update({
            where: { id },
            data: {
                status: dto.status as SupportTicketStatus,
                ...(dto.response !== undefined ? { response: dto.response } : {}),
                decidedBy: adminId,
                decidedAt: new Date(),
            },
        });
    }
}
