import { Body, Controller, Get, Post, Put, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginSyncDto, SyncUserDto, UpdateProfileDto } from './dto/auth.dto';

// Hardcoded admin credentials
const ADMIN_EMAIL = 'admin@bharatolympiad.in';
const ADMIN_PASSWORD = 'BIO@Admin2025';

@Controller('auth')
export class AuthController {
    constructor(
        private authService: AuthService,
        private jwtService: JwtService,
    ) { }

    /**
     * Admin login — validates hardcoded credentials, returns a signed JWT.
     */
    @Post('admin-login')
    async adminLogin(@Body() body: { email: string; password: string }) {
        if (body.email !== ADMIN_EMAIL || body.password !== ADMIN_PASSWORD) {
            throw new UnauthorizedException('Invalid admin credentials');
        }
        const user = await this.authService.getOrCreateAdmin(ADMIN_EMAIL);
        const token = this.jwtService.sign(
            { sub: user.id, email: user.email, role: user.role },
            { expiresIn: '8h' },
        );
        return { accessToken: token, user };
    }

    /**
     * PUBLIC — called after Neon Auth OTP verification (registration).
     * Accepts email + profile data in the body (Neon Auth already verified ownership via OTP).
     * Creates the user in our DB and returns our own signed JWT.
     */
    @Post('sync')
    async syncUser(@Body() dto: SyncUserDto) {
        const user = await this.authService.syncUser(dto.email, dto);
        // Issue our own HS256 JWT — used for all subsequent API calls
        const token = this.jwtService.sign(
            { sub: user.id, email: user.email, role: user.role },
            { expiresIn: '24h' },
        );
        return { accessToken: token, user };
    }

    /**
     * PUBLIC — called after Neon Auth OTP sign-in (login).
     * Looks up the user by email and returns our own signed JWT.
     */
    @Post('login-sync')
    async loginSync(@Body() dto: LoginSyncDto) {
        const user = await this.authService.getUserByEmail(dto.email);
        if (!user) {
            throw new UnauthorizedException('No account found for this email. Please register first.');
        }
        const token = this.jwtService.sign(
            { sub: user.id, email: user.email, role: user.role },
            { expiresIn: '24h' },
        );
        return { accessToken: token, user };
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async getMe(@CurrentUser('id') userId: string) {
        return this.authService.getMe(userId);
    }

    @Put('me')
    @UseGuards(JwtAuthGuard)
    async updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
        return this.authService.updateProfile(userId, dto);
    }

    @Get('admin/users')
    @UseGuards(JwtAuthGuard)
    async getAllStudentsWithMarks(@CurrentUser('role') role: string) {
        if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
            throw new UnauthorizedException('Admin access required');
        }
        return this.authService.getAllStudentsWithMarks();
    }
}
