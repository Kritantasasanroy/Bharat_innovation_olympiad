import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { normalizePhone } from '../auth/phone.helpers';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SendAdminMailDto } from './dto/admin-mail.dto';
import { NotificationService } from './notification.service';

interface ChannelResult {
    total: number;
    sent: number;
    failed: number;
}

/**
 * Admin-only outbound messaging. Sends an announcement by email, SMS, or both,
 * to every student, one class, or a typed list — routed through the same
 * providers the transactional notifications use.
 */
@Controller('admin/mail')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminMailController {
    constructor(
        private prisma: PrismaService,
        private notifications: NotificationService,
    ) {}

    private static readonly EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    /** Deduplicated email recipients for the chosen audience. */
    private async resolveEmails(dto: SendAdminMailDto): Promise<string[]> {
        if (dto.audience === 'CUSTOM') {
            const cleaned = (dto.emails ?? [])
                .map((e) => e.trim().toLowerCase())
                .filter((e) => AdminMailController.EMAIL_RE.test(e));
            return Array.from(new Set(cleaned));
        }
        const students = await this.prisma.user.findMany({
            where: {
                role: Role.STUDENT,
                isActive: true,
                ...(dto.audience === 'CLASS' && dto.classBand ? { classBand: dto.classBand } : {}),
            },
            select: { email: true },
        });
        return Array.from(new Set(students.map((s) => s.email).filter(Boolean)));
    }

    /** Deduplicated, E.164-normalised phone recipients for the chosen audience. */
    private async resolvePhones(dto: SendAdminMailDto): Promise<string[]> {
        if (dto.audience === 'CUSTOM') {
            const cleaned = (dto.phones ?? [])
                .map((p) => normalizePhone(p))
                .filter((p) => p.replace(/\D/g, '').length >= 10);
            return Array.from(new Set(cleaned));
        }
        const students = await this.prisma.user.findMany({
            where: {
                role: Role.STUDENT,
                isActive: true,
                phone: { not: null },
                ...(dto.audience === 'CLASS' && dto.classBand ? { classBand: dto.classBand } : {}),
            },
            select: { phone: true },
        });
        return Array.from(new Set(students.map((s) => s.phone!).filter(Boolean)));
    }

    /** Send to a list in small concurrent batches, counting outcomes. */
    private async blast(
        recipients: string[],
        send: (to: string) => Promise<boolean>,
    ): Promise<ChannelResult> {
        const result: ChannelResult = { total: recipients.length, sent: 0, failed: 0 };
        const CHUNK = 5;
        for (let i = 0; i < recipients.length; i += CHUNK) {
            const batch = recipients.slice(i, i + CHUNK);
            const outcomes = await Promise.all(batch.map(send));
            for (const ok of outcomes) {
                if (ok) result.sent += 1;
                else result.failed += 1;
            }
        }
        return result;
    }

    /** How many students an audience resolves to, and how many have a phone. */
    @Get('audience-count')
    async audienceCount(
        @Query('audience') audience: string,
        @Query('classBand') classBand?: string,
    ) {
        const where = {
            role: Role.STUDENT,
            isActive: true,
            ...(audience === 'CLASS' && classBand ? { classBand: Number(classBand) } : {}),
        };
        const [total, withPhone] = await Promise.all([
            this.prisma.user.count({ where }),
            this.prisma.user.count({ where: { ...where, phone: { not: null } } }),
        ]);
        return { total, withPhone };
    }

    @Post('send')
    async send(@Body() dto: SendAdminMailDto) {
        const channel = dto.channel ?? 'EMAIL';
        const wantEmail = channel === 'EMAIL' || channel === 'BOTH';
        const wantSms = channel === 'SMS' || channel === 'BOTH';

        const out: { email?: ChannelResult; sms?: ChannelResult } = {};

        if (wantEmail) {
            const subject = dto.subject?.trim();
            if (!subject) throw new BadRequestException('A subject is required to send email.');
            const emails = await this.resolveEmails(dto);
            out.email = await this.blast(emails, (to) =>
                this.notifications.sendAdminBroadcast(to, subject, dto.message),
            );
        }

        if (wantSms) {
            const phones = await this.resolvePhones(dto);
            out.sms = await this.blast(phones, (to) => this.notifications.sendAdminSms(to, dto.message));
        }

        return out;
    }
}
