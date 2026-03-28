import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { signToken } from '@/lib/jwt';
import crypto from 'crypto';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { refreshToken } = body;

        if (!refreshToken) {
            return NextResponse.json({ message: 'Refresh token is required' }, { status: 400 });
        }

        const tokenRecord = await prisma.refreshToken.findUnique({
            where: { token: refreshToken },
            include: { user: true },
        });

        if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
            return NextResponse.json({ message: 'Invalid or expired refresh token' }, { status: 401 });
        }

        // Rotate token
        await prisma.refreshToken.delete({ where: { id: tokenRecord.id } });

        const accessToken = signToken({
            sub: tokenRecord.user.id,
            email: tokenRecord.user.email,
            role: tokenRecord.user.role,
        });

        const newRefreshToken = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.refreshToken.create({
            data: {
                token: newRefreshToken,
                userId: tokenRecord.user.id,
                expiresAt,
            },
        });

        return NextResponse.json({ accessToken, refreshToken: newRefreshToken });

    } catch (error) {
        console.error('Refresh Error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
