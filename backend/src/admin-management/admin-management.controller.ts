import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminManagementService } from './admin-management.service';
import {
    DeleteEntityDto,
    MoveStudentsDto,
    UpdatePartnerDto,
    UpdateSchoolDto,
    UpdateUserDto,
} from './dto/admin-management.dto';

/**
 * Admin control over people and institutions. Every route is staff-only. Edits
 * and deletes are audited; deletes also archive the entity's details before the
 * row is permanently removed (see {@link AdminManagementService}).
 */
@Controller('admin/manage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminManagementController {
    constructor(private service: AdminManagementService) {}

    @Get('users')
    listUsers(
        @Query('role') role?: Role,
        @Query('q') q?: string,
        @Query('schoolId') schoolId?: string,
    ) {
        return this.service.listUsers({ role, q, schoolId });
    }

    @Patch('users/:id')
    updateUser(
        @Param('id') id: string,
        @Body() dto: UpdateUserDto,
        @CurrentUser('id') adminId: string,
        @CurrentUser('email') adminEmail: string,
    ) {
        return this.service.updateUser(id, dto, { id: adminId, email: adminEmail });
    }

    /** Move a batch of students between schools, or detach them (item 20). */
    @Post('students/move')
    moveStudents(
        @Body() dto: MoveStudentsDto,
        @CurrentUser('id') adminId: string,
        @CurrentUser('email') adminEmail: string,
    ) {
        return this.service.moveStudents(dto.userIds, dto.schoolId ?? null, {
            id: adminId,
            email: adminEmail,
        });
    }

    // ── Schools ──────────────────────────────────────────────────────────────

    @Get('schools')
    listSchools(@Query('q') q?: string, @Query('partnerId') partnerId?: string) {
        return this.service.listSchools({ q, partnerId });
    }

    /** Edit a school, including reassigning it to a different partner (item 20). */
    @Patch('schools/:id')
    updateSchool(
        @Param('id') id: string,
        @Body() dto: UpdateSchoolDto,
        @CurrentUser('id') adminId: string,
        @CurrentUser('email') adminEmail: string,
    ) {
        return this.service.updateSchool(id, dto, { id: adminId, email: adminEmail });
    }

    // ── Partners ─────────────────────────────────────────────────────────────

    @Get('partners')
    listPartners() {
        return this.service.listPartners();
    }

    @Patch('partners/:id')
    updatePartner(
        @Param('id') id: string,
        @Body() dto: UpdatePartnerDto,
        @CurrentUser('id') adminId: string,
        @CurrentUser('email') adminEmail: string,
    ) {
        return this.service.updatePartner(id, dto, { id: adminId, email: adminEmail });
    }

    // ── Deletes ──────────────────────────────────────────────────────────────

    @Delete('users/:id')
    deleteUser(
        @Param('id') id: string,
        @Body() dto: DeleteEntityDto,
        @CurrentUser('id') adminId: string,
        @CurrentUser('email') adminEmail: string,
    ) {
        return this.service.deleteUser(id, { id: adminId, email: adminEmail }, dto.reason);
    }

    @Delete('schools/:id')
    deleteSchool(
        @Param('id') id: string,
        @Body() dto: DeleteEntityDto,
        @CurrentUser('id') adminId: string,
        @CurrentUser('email') adminEmail: string,
    ) {
        return this.service.deleteSchool(id, { id: adminId, email: adminEmail }, dto.reason);
    }

    /** Delete by access-request id (what the Access queue lists) — removes the school too. */
    @Delete('school-requests/:id')
    deleteSchoolRequest(
        @Param('id') id: string,
        @Body() dto: DeleteEntityDto,
        @CurrentUser('id') adminId: string,
        @CurrentUser('email') adminEmail: string,
    ) {
        return this.service.deleteSchoolRequest(id, { id: adminId, email: adminEmail }, dto.reason);
    }

    @Delete('partners/:id')
    deletePartner(
        @Param('id') id: string,
        @Body() dto: DeleteEntityDto,
        @CurrentUser('id') adminId: string,
        @CurrentUser('email') adminEmail: string,
    ) {
        return this.service.deletePartner(id, { id: adminId, email: adminEmail }, dto.reason);
    }

    @Get('archive')
    listArchive(
        @Query('type') type?: 'STUDENT' | 'SCHOOL' | 'PARTNER',
        @Query('q') q?: string,
    ) {
        return this.service.listArchive({ type, q });
    }
}
