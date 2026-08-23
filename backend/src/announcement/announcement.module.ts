import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../common/jwt-secret';
import { PartnerJwtGuard } from '../partner/partner-jwt.guard';
import { PrismaModule } from '../prisma/prisma.module';
import {
    AdminAnnouncementController,
    PartnerAnnouncementController,
    SchoolAnnouncementController,
} from './announcement.controller';
import { AnnouncementService } from './announcement.service';

@Module({
    imports: [
        PrismaModule,
        JwtModule.register({ secret: getJwtSecret() }),
    ],
    controllers: [PartnerAnnouncementController, SchoolAnnouncementController, AdminAnnouncementController],
    providers: [AnnouncementService, PartnerJwtGuard],
})
export class AnnouncementModule {}
