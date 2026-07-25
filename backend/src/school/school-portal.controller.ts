import {
    Body,
    Controller,
    ForbiddenException,
    Get,
    Param,
    Patch,
    Post,
    Res,
    UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PickSlotDto, RegisterStudentsDto, UpdateSchoolProfileDto } from './dto/school.dto';
import { SchoolPortalService } from './school-portal.service';

/**
 * The school coordinator's dashboard.
 *
 * Every route is scoped to the caller's own `schoolId`, taken from the JWT and
 * never from the request body — a coordinator cannot address another school.
 *
 * A school is trusted with three writes and no others: its own contact details,
 * its student roster, and picking one of the slots offered for an exam. Exam
 * windows, slot capacities and scores are set by staff and by the exam itself.
 */
@Controller('school/portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SCHOOL)
export class SchoolPortalController {
    constructor(private portal: SchoolPortalService) {}

    /** A coordinator without a school is a provisioning bug, not a 500. */
    private schoolOf(schoolId: string | null | undefined): string {
        if (!schoolId) {
            throw new ForbiddenException('Your account is not linked to a school.');
        }
        return schoolId;
    }

    @Get('me')
    profile(@CurrentUser('schoolId') schoolId: string) {
        return this.portal.profile(this.schoolOf(schoolId));
    }

    /** The school edits its own contact details (item 14). */
    @Patch('me')
    updateProfile(
        @CurrentUser('schoolId') schoolId: string,
        @Body() dto: UpdateSchoolProfileDto,
    ) {
        return this.portal.updateProfile(this.schoolOf(schoolId), dto);
    }

    /** Who this school's partner is — the house partner if it has none (item 10). */
    @Get('partner')
    partner(@CurrentUser('schoolId') schoolId: string) {
        return this.portal.partner(this.schoolOf(schoolId));
    }

    @Get('overview')
    overview(@CurrentUser('schoolId') schoolId: string) {
        return this.portal.overview(this.schoolOf(schoolId));
    }

    @Get('students')
    students(@CurrentUser('schoolId') schoolId: string) {
        return this.portal.students(this.schoolOf(schoolId));
    }

    /** Every exam's slots, how full each is, and which one this school holds (item 15). */
    @Get('slots')
    slots(@CurrentUser('schoolId') schoolId: string) {
        return this.portal.slots(this.schoolOf(schoolId));
    }

    /** The school picks (or changes) its slot for one exam (item 15). */
    @Post('slots')
    pickSlot(@CurrentUser('schoolId') schoolId: string, @Body() dto: PickSlotDto) {
        return this.portal.pickSlot(this.schoolOf(schoolId), dto.examInstanceId, dto.slotId);
    }

    @Get('monitoring')
    monitoring(@CurrentUser('schoolId') schoolId: string) {
        return this.portal.monitoring(this.schoolOf(schoolId));
    }

    /** Results, but only for instances released to schools (item 18). */
    @Get('results')
    results(@CurrentUser('schoolId') schoolId: string) {
        return this.portal.results(this.schoolOf(schoolId));
    }

    /** Which exams this school may download results for. */
    @Get('results/instances')
    releasedInstances(@CurrentUser('schoolId') schoolId: string) {
        return this.portal.releasedInstances(this.schoolOf(schoolId));
    }

    /** The school's own results for one exam, as an Excel workbook (item 16). */
    @Get('results/:examInstanceId/export.xlsx')
    async exportResults(
        @CurrentUser('schoolId') schoolId: string,
        @Param('examInstanceId') examInstanceId: string,
        @Res() res: Response,
    ) {
        const { buffer, filename } = await this.portal.resultsWorkbook(
            this.schoolOf(schoolId),
            examInstanceId,
        );

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    }

    /** A school adds students to its own roster. */
    @Post('students')
    registerStudents(
        @CurrentUser('schoolId') schoolId: string,
        @Body() dto: RegisterStudentsDto,
    ) {
        return this.portal.registerStudents(this.schoolOf(schoolId), dto);
    }
}
