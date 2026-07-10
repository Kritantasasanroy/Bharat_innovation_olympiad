import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminManagementController } from './admin-management.controller';
import { AdminManagementService } from './admin-management.service';

@Module({
    imports: [PrismaModule],
    controllers: [AdminManagementController],
    providers: [AdminManagementService],
})
export class AdminManagementModule {}
