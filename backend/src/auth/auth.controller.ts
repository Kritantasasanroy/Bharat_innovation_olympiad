import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('register')
    async register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(@Body() dto: RefreshDto) {
        return this.authService.refresh(dto.refreshToken);
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    async logout(@Body() dto: RefreshDto) {
        await this.authService.logout(dto.refreshToken);
        return { success: true };
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async getMe(@CurrentUser('id') userId: string) {
        return this.authService.getMe(userId);
    }

    @Get('admin/users')
    @UseGuards(JwtAuthGuard)
    async getAllStudentsWithMarks(@CurrentUser('role') role: string) {
        if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
            throw new Error('Unauthorized role');
        }
        return this.authService.getAllStudentsWithMarks();
    }
}
