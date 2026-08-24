import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
    AuthenticatedPartner,
    CurrentPartner,
    PartnerJwtGuard,
} from '../partner/partner-jwt.guard';
import { AnnouncementService, type CreateAnnouncementInput, type UpdateAnnouncementInput } from './announcement.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';

function toDateInput(dto: CreateAnnouncementDto): CreateAnnouncementInput {
    return {
        title: dto.title,
        body: dto.body,
        audience: dto.audience,
        publishedAt: new Date(dto.publishedAt),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        active: dto.active ?? true,
        targetSchoolId: dto.targetSchoolId || null,
    };
}

function toUpdateInput(dto: UpdateAnnouncementDto): UpdateAnnouncementInput {
    const input: UpdateAnnouncementInput = {};
    if (dto.title !== undefined) input.title = dto.title;
    if (dto.body !== undefined) input.body = dto.body;
    if (dto.audience !== undefined) input.audience = dto.audience;
    if (dto.publishedAt !== undefined) input.publishedAt = new Date(dto.publishedAt);
    if (dto.expiresAt !== undefined) input.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.active !== undefined) input.active = dto.active;
    if (dto.targetSchoolId !== undefined) input.targetSchoolId = dto.targetSchoolId || null;
    return input;
}

@Controller('partner/announcements')
@UseGuards(PartnerJwtGuard)
export class PartnerAnnouncementController {
    constructor(private service: AnnouncementService) {}

    @Get()
    list(@CurrentPartner() partner: AuthenticatedPartner) {
        return this.service.listForPartner(partner.partnerId);
    }
}

@Controller('school/portal/announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SCHOOL)
export class SchoolAnnouncementController {
    constructor(private service: AnnouncementService) {}

    @Get()
    list(@CurrentUser('schoolId') schoolId: string) {
        return this.service.listForSchool(schoolId ?? '');
    }
}

@Controller('admin/announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminAnnouncementController {
    constructor(private service: AnnouncementService) {}

    @Get()
    list() {
        return this.service.listAll();
    }

    @Post()
    create(
        @Body() dto: CreateAnnouncementDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.service.create({ ...toDateInput(dto), createdBy: adminId });
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateAnnouncementDto,
    ) {
        return this.service.update(id, toUpdateInput(dto));
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.delete(id);
    }
}
