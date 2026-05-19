import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
    sub: string;
    email?: string;
    role?: string; // present in admin tokens
}

// URL for Neon Auth JWKS (used to verify student tokens)
const NEON_JWKS_URI = 'https://ep-quiet-tooth-aowdimi1.neonauth.c-2.ap-southeast-1.aws.neon.tech/neondb/auth/.well-known/jwks.json';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private prisma: PrismaService) {
        super({
            // Try Neon Auth JWKS first; admin tokens use local secret (handled by algorithm fallback)
            secretOrKeyProvider: (request: any, rawJwtToken: any, done: any) => {
                // Peek at the JWT header to determine which key to use
                try {
                    const header = JSON.parse(
                        Buffer.from(rawJwtToken.split('.')[0], 'base64').toString()
                    );
                    // Admin tokens are HS256 (signed with local secret)
                    if (header.alg === 'HS256') {
                        return done(null, process.env.JWT_SECRET || 'dev-jwt-secret');
                    }
                    // Neon Auth tokens are RS256 — use JWKS
                    passportJwtSecret({
                        cache: true,
                        rateLimit: true,
                        jwksRequestsPerMinute: 5,
                        jwksUri: NEON_JWKS_URI,
                    })(request, rawJwtToken, done);
                } catch (err) {
                    done(err);
                }
            },
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            algorithms: ['RS256', 'HS256'],
        });
    }

    async validate(payload: JwtPayload) {
        if (!payload.email && !payload.sub) {
            throw new UnauthorizedException('Invalid token');
        }

        // If the token has a role embedded (admin token), look up by id
        if (payload.role && payload.sub) {
            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
                select: { id: true, email: true, firstName: true, lastName: true, role: true, classBand: true, schoolId: true, isActive: true },
            });
            if (user && !user.isActive) throw new UnauthorizedException('User is inactive');
            return user;
        }

        // Neon Auth token — look up by email
        if (payload.email) {
            const user = await this.prisma.user.findUnique({
                where: { email: payload.email },
                select: { id: true, email: true, firstName: true, lastName: true, role: true, classBand: true, schoolId: true, isActive: true },
            });
            if (user && !user.isActive) throw new UnauthorizedException('User is inactive');
            return user || { email: payload.email, isNew: true };
        }

        throw new UnauthorizedException('Token does not contain email or role');
    }
}
