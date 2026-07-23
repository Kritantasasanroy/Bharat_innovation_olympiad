import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SendAdminMailDto } from './dto/admin-mail.dto';
import { NotificationService } from './notification.service';

/**
 * Admin-only outbound email. Lets staff send an announcement to every student,
 * to one class, or to a typed list of addresses — routed through the same
 * Resend provider the transactional mails use.
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

    /** Resolve the deduplicated recipient list for the chosen audience. */
    private async resolveRecipients(dto: SendAdminMailDto): Promise<string[]> {
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

    /** How many students a broadcast audience resolves to — shown before sending. */
    @Get('audience-count')
    async audienceCount(
        @Query('audience') audience: string,
        @Query('classBand') classBand?: string,
    ) {
        const total = await this.prisma.user.count({
            where: {
                role: Role.STUDENT,
                isActive: true,
                ...(audience === 'CLASS' && classBand ? { classBand: Number(classBand) } : {}),
            },
        });
        return { total };
    }

    @Post('send')
    async send(@Body() dto: SendAdminMailDto) {
        const recipients = await this.resolveRecipients(dto);

        const result = { total: recipients.length, sent: 0, failed: 0 };
        // Send in small concurrent batches: fast enough for a class-sized list,
        // gentle enough to stay under the provider's per-second rate limit.
        const CHUNK = 5;
        for (let i = 0; i < recipients.length; i += CHUNK) {
            const batch = recipients.slice(i, i + CHUNK);
            const outcomes = await Promise.all(
                batch.map((to) => this.notifications.sendAdminBroadcast(to, dto.subject, dto.message)),
            );
            for (const ok of outcomes) {
                if (ok) result.sent += 1;
                else result.failed += 1;
            }
        }
        return result;
    }
}
