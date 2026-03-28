import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/jwt';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromRequest(request);
        if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { id: questionId } = await params;
        const body = await request.json();
        
        const question = await prisma.question.update({
            where: { id: questionId },
            data: {
                text: body.text,
                type: body.type,
                difficulty: body.difficulty,
                marks: body.marks,
                negativeMarks: body.negativeMarks,
                options: body.options,
                mediaUrl: body.mediaUrl || null,
                mediaType: body.mediaType || null,
            }
        });

        return NextResponse.json(question);
    } catch (error) {
        console.error('Update Question Error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromRequest(request);
        if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { id: questionId } = await params;
        
        await prisma.question.delete({
            where: { id: questionId }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete Question Error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
