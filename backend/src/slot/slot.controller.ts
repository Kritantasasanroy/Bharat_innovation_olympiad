import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
    AssignSlotDto,
    CreateScheduleDateDto,
    CreateSlotDto,
    CreateSlotTimingDto,
    UpdateAssignmentRulesDto,
    UpdateScheduleDateDto,
    UpdateSlotDto,
    UpdateSlotTimingDto,
} from './dto/slot.dto';
import { SlotAnalyticsService } from './slot-analytics.service';
import { SlotAssignmentService } from './slot-assignment.service';
import { CALENDAR_TIMES, DEFAULT_SITTING_CAPACITY, DEFAULT_SITTING_MINUTES } from './slot-calendar';
import { SlotScheduleDateService } from './slot-schedule-date.service';
import { SlotTimingService } from './slot-timing.service';
import { SlotService } from './slot.service';

const ADMIN = [Role.ADMIN, Role.SUPER_ADMIN] as const;

@Controller()
export class SlotController {
    constructor(
        private slots: SlotService,
        private timings: SlotTimingService,
        private assignment: SlotAssignmentService,
        private scheduleDates: SlotScheduleDateService,
        private analytics: SlotAnalyticsService,
        private prisma: PrismaService,
    ) {}

    // ── Student ───────────────────────────────────────────────────────────────

    /**
     * The student's own sitting for an exam.
     *
     * Ensures an assignment first, then returns it. That ordering is deliberate:
     * a student who registered before an admin configured any timings — or when
     * every sitting was full — picks one up the moment one exists, instead of
     * being stranded because their single chance was at signup. The call is a
     * cheap no-op once they hold a seat.
     */
    @Get('my-schedule')
    @UseGuards(JwtAuthGuard)
    async getMySchedule(@CurrentUser('id') userId: string, @Query('examId') examId: string) {
        const instances = await this.prisma.examInstance.findMany({
            where: { examId },
            select: { id: true },
        });
        for (const instance of instances) {
            await this.assignment.ensureAssignment(userId, instance.id).catch(() => undefined);
        }
        return this.slots.getMySchedule(userId, examId);
    }

    @Get('bookings/:id')
    @UseGuards(JwtAuthGuard)
    async getBooking(@Param('id') bookingId: string, @CurrentUser('id') userId: string) {
        return this.slots.getBookingById(bookingId, userId);
    }

    // ── Admin: slot timings (the recurring schedule) ──────────────────────────

    @Get('admin/exams/instances/:instanceId/slot-timings')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async listTimings(@Param('instanceId') instanceId: string) {
        return this.timings.list(instanceId);
    }

    @Post('admin/slot-timings')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async createTiming(@Body() dto: CreateSlotTimingDto) {
        return this.timings.create(dto);
    }

    @Put('admin/slot-timings/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async updateTiming(@Param('id') id: string, @Body() dto: UpdateSlotTimingDto) {
        return this.timings.update(id, dto);
    }

    @Delete('admin/slot-timings/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async deleteTiming(@Param('id') id: string) {
        return this.timings.remove(id);
    }

    // ── Admin: materialised sittings ──────────────────────────────────────────

    @Get('admin/slots')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async listAllSittings(
        @Query('examInstanceId') examInstanceId?: string,
        @Query('includePast') includePast?: string,
    ) {
        const opts = { includePast: includePast === 'true' };
        return examInstanceId
            ? this.slots.listSittings(examInstanceId, opts)
            : this.slots.listAllSittings(opts);
    }

    @Post('admin/slots')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async createSitting(@Body() dto: CreateSlotDto) {
        return this.slots.createSitting(dto);
    }

    @Put('admin/slots/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async updateSitting(@Param('id') id: string, @Body() dto: UpdateSlotDto) {
        return this.slots.updateSitting(id, dto);
    }

    @Delete('admin/slots/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async deleteSitting(@Param('id') id: string) {
        return this.slots.deleteSitting(id);
    }

    @Get('admin/slots/:id/students')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async listSittingStudents(@Param('id') id: string) {
        return this.slots.listSittingStudents(id);
    }

    // ── Admin: the published calendar ──────────────────────────────────────

    /**
     * The sitting times the season publishes.
     *
     * Served rather than hard-coded in the admin bundle so the dropdown an admin
     * picks from and the times the seeder writes can never drift apart.
     */
    @Get('admin/slot-calendar/options')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    calendarOptions() {
        return {
            times: CALENDAR_TIMES,
            defaultDurationMinutes: DEFAULT_SITTING_MINUTES,
            defaultCapacity: DEFAULT_SITTING_CAPACITY,
        };
    }

    @Get('admin/exams/instances/:instanceId/schedule-dates')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async listScheduleDates(@Param('instanceId') instanceId: string) {
        return this.scheduleDates.list(instanceId);
    }

    @Post('admin/schedule-dates')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async createScheduleDate(@Body() dto: CreateScheduleDateDto) {
        return this.scheduleDates.create(dto);
    }

    @Put('admin/schedule-dates/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async updateScheduleDate(@Param('id') id: string, @Body() dto: UpdateScheduleDateDto) {
        return this.scheduleDates.update(id, dto);
    }

    @Delete('admin/schedule-dates/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async deleteScheduleDate(@Param('id') id: string) {
        return this.scheduleDates.remove(id);
    }

    /** Creates the whole published season -- dates and their timings -- at once. */
    @Post('admin/exams/instances/:instanceId/schedule-dates/seed-standard')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async seedCalendar(@Param('instanceId') instanceId: string) {
        return this.scheduleDates.seedStandardCalendar(instanceId);
    }

    // ── Admin: slot management dashboard ────────────────────────────────

    @Get('admin/exams/instances/:instanceId/slot-analytics')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async slotAnalytics(@Param('instanceId') instanceId: string) {
        return this.analytics.forInstance(instanceId);
    }

    // ── Admin: assignment rules ───────────────────────────────────────────────

    @Get('admin/exams/instances/:instanceId/assignment-rules')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async getRules(@Param('instanceId') instanceId: string) {
        return this.prisma.examInstance.findUnique({
            where: { id: instanceId },
            select: {
                id: true,
                startsAt: true,
                endsAt: true,
                slotLeadDays: true,
                slotHorizonDays: true,
                slotDayPreference: true,
            },
        });
    }

    @Put('admin/exams/instances/:instanceId/assignment-rules')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async updateRules(
        @Param('instanceId') instanceId: string,
        @Body() dto: UpdateAssignmentRulesDto,
    ) {
        return this.prisma.examInstance.update({
            where: { id: instanceId },
            data: {
                ...(dto.slotLeadDays !== undefined && { slotLeadDays: dto.slotLeadDays }),
                ...(dto.slotHorizonDays !== undefined && { slotHorizonDays: dto.slotHorizonDays }),
                ...(dto.slotDayPreference !== undefined && {
                    slotDayPreference: dto.slotDayPreference,
                }),
            },
            select: {
                id: true,
                slotLeadDays: true,
                slotHorizonDays: true,
                slotDayPreference: true,
            },
        });
    }

    // ── Admin: student placement ──────────────────────────────────────────────

    /** Every sitting one student holds — the admin student-detail panel. */
    @Get('admin/students/:userId/schedule')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async getStudentSchedule(@Param('userId') userId: string) {
        return this.slots.getStudentSchedule(userId);
    }

    /** Moves a student to a specific sitting, or seats one who had none. */
    @Put('admin/students/:userId/schedule')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async reassignStudent(
        @Param('userId') userId: string,
        @Body() dto: AssignSlotDto,
        @CurrentUser('id') adminId: string,
    ) {
        const booking = await this.assignment.reassign(userId, dto, adminId);
        // The student's date has changed and the message already in their inbox
        // is now wrong, so this is one of the few paths that must re-notify.
        await this.slots.notifySchedule(booking.id);
        return booking;
    }

    @Delete('admin/students/:userId/schedule/:instanceId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async releaseStudent(
        @Param('userId') userId: string,
        @Param('instanceId') instanceId: string,
    ) {
        return this.assignment.release(userId, instanceId);
    }

    /** Why this student got the date they did — the list of dates that were tried. */
    @Get('admin/students/:userId/schedule/:instanceId/explain')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN)
    async explain(@Param('userId') userId: string, @Param('instanceId') instanceId: string) {
        return this.assignment.explain(userId, instanceId);
    }
}
