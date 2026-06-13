import { getUserFromRequest } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        if (!code) return NextResponse.json({ message: 'code required' }, { status: 400 });

        const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
        if (!coupon) return NextResponse.json({ valid: false, reason: 'Coupon not found' });
        if (coupon.usedCount >= coupon.maxUses) return NextResponse.json({ valid: false, reason: 'Usage limit reached' });
        if (coupon.expiresAt && new Date() > coupon.expiresAt) return NextResponse.json({ valid: false, reason: 'Expired' });

        return NextResponse.json({ valid: true, discountPct: coupon.discountPct, code: coupon.code });
    } catch (error) {
        console.error('Validate coupon error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
