import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UpdateUserProfileDto } from './dto/user.dto';
import { UserService } from './user.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
    constructor(private userService: UserService) { }

    @Get('profile')
    async getProfile(@CurrentUser('id') userId: string) {
        return this.userService.findById(userId);
    }

    /**
     * A student edits their own contact details (item 14).
     *
     * The body is a **decorated DTO class**, not an inline type. That distinction
     * is load-bearing, not stylistic — see `UpdateUserProfileDto`.
     */
    @Put('profile')
    async updateProfile(
        @CurrentUser('id') userId: string,
        @Body() dto: UpdateUserProfileDto,
    ) {
        return this.userService.updateProfile(userId, dto);
    }
}
