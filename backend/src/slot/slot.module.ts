import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SchoolSlotService } from './school-slot.service';
import { SlotController } from './slot.controller';
import { SlotService } from './slot.service';

@Module({
    imports: [PrismaModule],
    controllers: [SlotController],
    providers: [SlotService, SchoolSlotService],
    exports: [SlotService, SchoolSlotService],
})
export class SlotModule {}
