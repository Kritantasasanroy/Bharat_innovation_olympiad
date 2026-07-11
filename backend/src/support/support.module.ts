import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PartnerJwtGuard } from '../partner/partner-jwt.guard';
import { PrismaModule } from '../prisma/prisma.module';
import {
    AdminSupportController,
    PartnerSupportController,
    SchoolSupportController,
} from './support.controller';
import { SupportService } from './support.service';

@Module({
    imports: [
        PrismaModule,
        // PartnerJwtGuard verifies the partner JWT itself (partner `sub` is a
        // Partner.id, not a User), so it needs the shared secret.
        JwtModule.register({ secret: process.env.JWT_SECRET || 'dev-jwt-secret' }),
    ],
    controllers: [PartnerSupportController, SchoolSupportController, AdminSupportController],
    providers: [SupportService, PartnerJwtGuard],
})
export class SupportModule {}
