import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TRAINING_MODULES } from './training.constants';
import { TrainingService } from './training.service';

export class SaveTrainingDto {
    /**
     * The complete set of modules the student says they attended.
     *
     * The whole set, not a delta — see `TrainingService.save`. Capped at the
     * catalogue size so a malformed client cannot post an unbounded array; the
     * service rejects unknown keys regardless.
     */
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(TRAINING_MODULES.length)
    moduleKeys: string[];
}

@Controller('training')
@UseGuards(JwtAuthGuard)
export class TrainingController {
    constructor(private trainingService: TrainingService) {}

    /** The checklist: every module, with this student's ticks applied. */
    @Get('me')
    async getMine(@CurrentUser('id') userId: string) {
        return this.trainingService.getForUser(userId);
    }

    @Post('me')
    @HttpCode(200)
    async saveMine(@CurrentUser('id') userId: string, @Body() dto: SaveTrainingDto) {
        return this.trainingService.save(userId, dto.moduleKeys);
    }
}
