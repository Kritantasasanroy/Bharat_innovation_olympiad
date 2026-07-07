import { Module } from '@nestjs/common';
import { ProctorController } from './proctor.controller';
import { ProctorService } from './proctor.service';

@Module({
    controllers: [ProctorController],
    providers: [ProctorService],
    exports: [ProctorService],
})
export class ProctorModule { }
