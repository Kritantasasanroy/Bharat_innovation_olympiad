import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotAnalyticsService } from './slot-analytics.service';
import { SlotAssignmentService } from './slot-assignment.service';
import { SlotScheduleDateService } from './slot-schedule-date.service';
import { SlotTimingService } from './slot-timing.service';
import { SlotController } from './slot.controller';
import { SlotService } from './slot.service';

@Module({
    imports: [PrismaModule],
    controllers: [SlotController],
    providers: [
        SlotService,
        SlotTimingService,
        SlotAssignmentService,
        SlotScheduleDateService,
        SlotAnalyticsService,
    ],
    exports: [
        SlotService,
        SlotTimingService,
        SlotAssignmentService,
        SlotScheduleDateService,
        SlotAnalyticsService,
    ],
})
export class SlotModule {}
