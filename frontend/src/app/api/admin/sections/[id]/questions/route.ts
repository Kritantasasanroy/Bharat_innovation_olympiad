import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/jwt';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromRequest(request);
        if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { id: sectionId } = await params;
        const body = await request.json();
        
        const question = await prisma.question.create({
            data: {
                sectionId,
                text: body.text,
                type: body.type,
                difficulty: body.difficulty,
                marks: body.marks || 1,
                negativeMarks: body.negativeMarks || 0,
                options: body.options,
                mediaUrl: body.mediaUrl || null,
                mediaType: body.mediaType || null,
            }
        });

        return NextResponse.json(question);
    } catch (error) {
        console.error('Add Question Error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
