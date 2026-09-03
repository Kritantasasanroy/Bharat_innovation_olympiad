import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotAssignmentService } from './slot-assignment.service';
import { SlotTimingService } from './slot-timing.service';
import { SlotController } from './slot.controller';
import { SlotService } from './slot.service';

@Module({
    imports: [PrismaModule],
    controllers: [SlotController],
    providers: [SlotService, SlotTimingService, SlotAssignmentService],
    exports: [SlotService, SlotTimingService, SlotAssignmentService],
})
export class SlotModule {}
