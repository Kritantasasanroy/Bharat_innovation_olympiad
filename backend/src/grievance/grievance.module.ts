import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GrievanceController } from './grievance.controller';
import { GrievanceService } from './grievance.service';

@Module({
    imports: [PrismaModule],
    controllers: [GrievanceController],
    providers: [GrievanceService],
    exports: [GrievanceService],
})
export class GrievanceModule {}
