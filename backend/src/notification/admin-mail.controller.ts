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
    /** First failure reason, surfaced to the admin so "failed" isn't a dead end. */
    note?: string;
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
        send: (to: string) => Promise<{ ok: boolean; error?: string }>,
    ): Promise<ChannelResult> {
        const result: ChannelResult = { total: recipients.length, sent: 0, failed: 0 };
        const CHUNK = 5;
        for (let i = 0; i < recipients.length; i += CHUNK) {
            const batch = recipients.slice(i, i + CHUNK);
            const outcomes = await Promise.all(batch.map(send));
            for (const o of outcomes) {
                if (o.ok) {
                    result.sent += 1;
                } else {
                    result.failed += 1;
                    if (!result.note && o.error) result.note = o.error;
                }
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
            out.email = await this.blast(emails, async (to) => ({
                ok: await this.notifications.sendAdminBroadcast(to, subject, dto.message),
                error: 'Email provider rejected the message.',
            }));
        }

        if (wantSms) {
            const phones = await this.resolvePhones(dto);
            // Free-text SMS in India needs a DLT sender id + template. If those
            // aren't set there's nothing to send through, so skip the doomed
            // requests and tell the admin exactly what to configure.
            if (!this.notifications.isAdminSmsConfigured()) {
                out.sms = {
                    total: phones.length,
                    sent: 0,
                    failed: phones.length,
                    note:
                        'SMS is not set up yet. Free-text SMS to Indian numbers needs a DLT sender ID ' +
                        'and a single-variable transactional template on the server — the OTP template ' +
                        'cannot carry announcements. Register a catch-all "{#var#}" template and set ' +
                        'TWOFACTOR_SENDER_ID + TWOFACTOR_SMS_TEMPLATE.',
                };
            } else {
                out.sms = await this.blast(phones, (to) =>
                    this.notifications.sendAdminSms(to, dto.message),
                );
            }
        }

        return out;
    }
}
