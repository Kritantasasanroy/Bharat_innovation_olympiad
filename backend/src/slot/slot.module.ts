import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotController } from './slot.controller';
import { SlotService } from './slot.service';

@Module({
    imports: [PrismaModule],
    controllers: [SlotController],
    providers: [SlotService],
    exports: [SlotService],
})
export class SlotModule {}
