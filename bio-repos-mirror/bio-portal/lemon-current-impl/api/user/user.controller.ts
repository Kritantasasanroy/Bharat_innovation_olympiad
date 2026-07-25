import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserService } from './user.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
    constructor(private userService: UserService) { }

    @Get('profile')
    async getProfile(@CurrentUser('id') userId: string) {
        return this.userService.findById(userId);
    }

    @Put('profile')
    async updateProfile(
        @CurrentUser('id') userId: string,
        @Body() data: { firstName?: string; lastName?: string },
    ) {
        return this.userService.updateProfile(userId, data);
    }
}
