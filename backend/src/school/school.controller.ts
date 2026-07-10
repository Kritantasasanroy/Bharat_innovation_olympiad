import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApplySchoolDto, DecideSchoolDto, SchoolLoginDto } from './dto/school.dto';
import { SchoolService } from './school.service';

@Controller()
export class SchoolController {
    constructor(private schoolService: SchoolService) {}

    /** PUBLIC — a school requests access (no credential yet). */
    @Post('school/apply')
    apply(@Body() dto: ApplySchoolDto) {
        return this.schoolService.apply(dto);
    }

    /** PUBLIC — an approved school signs in with its issued access token. */
    @Post('school/login')
    login(@Body() dto: SchoolLoginDto) {
        return this.schoolService.login(dto);
    }

    /** ADMIN — school review queue for the Access Management page. */
    @Get('admin/school-requests')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    list() {
        return this.schoolService.list();
    }

    /** ADMIN — grant / reject / revoke / re-grant a school's access. */
    @Patch('admin/school-requests/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    decide(
        @Param('id') id: string,
        @Body() dto: DecideSchoolDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.schoolService.decide(id, dto, adminId);
    }

    /** ADMIN — handover card, including the school's access token in the clear. */
    @Get('admin/school-requests/:id/card')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    card(@Param('id') id: string) {
        return this.schoolService.card(id);
    }

    /** ADMIN — issue a fresh token, invalidating the previous one immediately. */
    @Post('admin/school-requests/:id/rotate-token')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    rotate(@Param('id') id: string, @CurrentUser('id') adminId: string) {
        return this.schoolService.rotateToken(id, adminId);
    }
}
