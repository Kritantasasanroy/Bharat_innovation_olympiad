import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ResultsExportService } from './results-export.service';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';

@Module({
    imports: [PrismaModule],
    controllers: [ResultsController],
    providers: [ResultsService, ResultsExportService],
    // The school and partner portals build their own result views on top of these,
    // scoped to the caller — see SchoolModule / PartnerModule.
    exports: [ResultsService, ResultsExportService],
})
export class ResultsModule {}
