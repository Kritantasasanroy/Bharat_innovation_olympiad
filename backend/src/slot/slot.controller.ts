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
import { AssignSlotDto, BookSlotDto, CreateSlotDto } from './dto/slot.dto';
import { SchoolSlotService } from './school-slot.service';
import { SlotService } from './slot.service';

@Controller()
export class SlotController {
    constructor(
        private slotService: SlotService,
        private schoolSlotService: SchoolSlotService,
    ) {}

    // ── Student routes ────────────────────────────────────────────────────────

    @Get('slots')
    @UseGuards(JwtAuthGuard)
    async listSlots(
        @Query('examInstanceId') examInstanceId?: string,
        @Query('examId') examId?: string,
    ) {
        if (examInstanceId) return this.slotService.listSlotsForInstance(examInstanceId);
        if (examId) return this.slotService.listSlotsForExam(examId);
        return [];
    }

    @Post('slots/:id/book')
    @UseGuards(JwtAuthGuard)
    async bookSlot(
        @Param('id') slotId: string,
        @CurrentUser('id') userId: string,
        @Body() dto: BookSlotDto,
    ) {
        return this.slotService.bookSlot(slotId, userId, dto);
    }

    @Delete('bookings/:id')
    @UseGuards(JwtAuthGuard)
    async cancelBooking(
        @Param('id') bookingId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.slotService.cancelBooking(bookingId, userId);
    }

    @Get('bookings/me')
    @UseGuards(JwtAuthGuard)
    async getMyBooking(
        @CurrentUser('id') userId: string,
        @Query('examId') examId: string,
    ) {
        return this.slotService.getMyBooking(userId, examId);
    }

    // ── Admin routes ──────────────────────────────────────────────────────────

    @Post('admin/slots')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async createSlot(@Body() dto: CreateSlotDto) {
        return this.slotService.createSlot(dto);
    }

    @Put('admin/slots/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async updateSlot(@Param('id') slotId: string, @Body() dto: Partial<CreateSlotDto>) {
        return this.slotService.updateSlot(slotId, dto);
    }

    @Delete('admin/slots/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async deleteSlot(@Param('id') slotId: string) {
        return this.slotService.deleteSlot(slotId);
    }

    @Get('admin/slots')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async adminListAllSlots() {
        return this.slotService.adminListAllSlots();
    }

    @Get('admin/slots/:id/bookings')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async adminListSlotBookings(@Param('id') slotId: string) {
        return this.slotService.adminListSlotBookings(slotId);
    }

    // ── School slot assignment / reassignment (auto-allocation) ────────────────

    @Get('admin/schools')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async listSchools() {
        return this.schoolSlotService.listSchools();
    }

    @Put('admin/exams/instances/:instanceId/schools/:schoolId/slot')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async setSchoolSlotAssignment(
        @Param('instanceId') instanceId: string,
        @Param('schoolId') schoolId: string,
        @Body() dto: AssignSlotDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.schoolSlotService.setSchoolSlotAssignment(
            schoolId,
            instanceId,
            dto.slotId,
            adminId,
        );
    }

    @Get('admin/exams/instances/:instanceId/school-slot-assignments')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async listSchoolSlotAssignments(@Param('instanceId') instanceId: string) {
        return this.schoolSlotService.listAssignmentsForInstance(instanceId);
    }

    @Post('admin/bookings/:id/reassign')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async reassignBooking(@Param('id') bookingId: string, @Body() dto: AssignSlotDto) {
        return this.schoolSlotService.reassignBooking(bookingId, dto.slotId);
    }

    @Post('admin/schools/:schoolId/instances/:instanceId/reassign-all')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async reassignSchool(
        @Param('schoolId') schoolId: string,
        @Param('instanceId') instanceId: string,
        @Body() dto: AssignSlotDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.schoolSlotService.reassignSchool(schoolId, instanceId, dto.slotId, adminId);
    }

    /**
     * Auto-assign every eligible student across this instance's slots:
     * same-school-together, balanced, overflowing when a slot fills. Run by the
     * exam-creation wizard, and re-runnable afterwards (already-booked students
     * are left alone).
     */
    @Post('admin/exams/instances/:instanceId/auto-distribute')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async autoDistribute(@Param('instanceId') instanceId: string) {
        return this.schoolSlotService.autoDistributeInstance(instanceId);
    }
}
