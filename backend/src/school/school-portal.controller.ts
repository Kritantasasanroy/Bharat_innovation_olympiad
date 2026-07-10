import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RegisterStudentsDto } from './dto/school.dto';
import { SchoolPortalService } from './school-portal.service';

/**
 * The school coordinator's dashboard.
 *
 * Every route is scoped to the caller's own `schoolId`, taken from the JWT and
 * never from the request body — a coordinator cannot address another school.
 *
 * All reads. The single write is `POST /school/portal/students`: a school may
 * add students to its roster, and nothing else. Profile, slots, windows and
 * results are set by staff and by the exam, and a school can only look at them.
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

    @Get('overview')
    overview(@CurrentUser('schoolId') schoolId: string) {
        return this.portal.overview(this.schoolOf(schoolId));
    }

    @Get('students')
    students(@CurrentUser('schoolId') schoolId: string) {
        return this.portal.students(this.schoolOf(schoolId));
    }

    @Get('slots')
    slots(@CurrentUser('schoolId') schoolId: string) {
        return this.portal.slots(this.schoolOf(schoolId));
    }

    @Get('monitoring')
    monitoring(@CurrentUser('schoolId') schoolId: string) {
        return this.portal.monitoring(this.schoolOf(schoolId));
    }

    @Get('results')
    results(@CurrentUser('schoolId') schoolId: string) {
        return this.portal.results(this.schoolOf(schoolId));
    }

    /** The only write a school gets. */
    @Post('students')
    registerStudents(
        @CurrentUser('schoolId') schoolId: string,
        @Body() dto: RegisterStudentsDto,
    ) {
        return this.portal.registerStudents(this.schoolOf(schoolId), dto);
    }
}
