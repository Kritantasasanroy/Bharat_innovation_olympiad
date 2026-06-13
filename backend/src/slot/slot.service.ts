import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookSlotDto, CreateSlotDto } from './dto/slot.dto';

@Injectable()
export class SlotService {
    constructor(private prisma: PrismaService) {}

    async createSlot(dto: CreateSlotDto) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: dto.examInstanceId },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        return this.prisma.examSlot.create({
            data: {
                examInstanceId: dto.examInstanceId,
                startsAt: new Date(dto.startsAt),
                endsAt: new Date(dto.endsAt),
                capacity: dto.capacity,
                label: dto.label,
            },
            include: { examInstance: { include: { exam: true } } },
        });
    }

    async listSlotsForInstance(examInstanceId: string) {
        return this.prisma.examSlot.findMany({
            where: { examInstanceId },
            orderBy: { startsAt: 'asc' },
            include: { examInstance: { include: { exam: true } } },
        });
    }

    async listSlotsForExam(examId: string) {
        return this.prisma.examSlot.findMany({
            where: { examInstance: { examId } },
            orderBy: { startsAt: 'asc' },
            include: { examInstance: { include: { exam: true } } },
        });
    }

    async updateSlot(slotId: string, data: Partial<CreateSlotDto>) {
        const slot = await this.prisma.examSlot.findUnique({ where: { id: slotId } });
        if (!slot) throw new NotFoundException('Slot not found');
        return this.prisma.examSlot.update({
            where: { id: slotId },
            data: {
                ...(data.startsAt && { startsAt: new Date(data.startsAt) }),
                ...(data.endsAt && { endsAt: new Date(data.endsAt) }),
                ...(data.capacity !== undefined && { capacity: data.capacity }),
                ...(data.label !== undefined && { label: data.label }),
            },
            include: { examInstance: { include: { exam: true } } },
        });
    }

    async deleteSlot(slotId: string) {
        const slot = await this.prisma.examSlot.findUnique({ where: { id: slotId } });
        if (!slot) throw new NotFoundException('Slot not found');
        if (slot.booked > 0) throw new BadRequestException('Cannot delete a slot that has bookings');
        await this.prisma.examSlot.delete({ where: { id: slotId } });
        return { success: true };
    }

    async bookSlot(slotId: string, userId: string, _dto: BookSlotDto) {
        const slot = await this.prisma.examSlot.findUnique({
            where: { id: slotId },
            include: { examInstance: { include: { exam: true } } },
        });
        if (!slot) throw new NotFoundException('Slot not found');

        const now = new Date();
        if (now > slot.endsAt) throw new BadRequestException('Slot has already ended');

        // One active booking per exam per user
        const existingBooking = await this.prisma.booking.findFirst({
            where: {
                userId,
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                slot: { examInstance: { examId: slot.examInstance.examId } },
            },
        });
        if (existingBooking) {
            throw new ConflictException('You already have an active booking for this exam');
        }

        const feeAmount = slot.examInstance.exam.feeAmount ?? 0;

        return this.prisma.$transaction(async (tx) => {
            const fresh = await tx.examSlot.findUnique({ where: { id: slotId } });
            if (!fresh || fresh.booked >= fresh.capacity) {
                throw new ConflictException('Slot is full');
            }
            await tx.examSlot.update({
                where: { id: slotId },
                data: { booked: { increment: 1 } },
            });

            // Free exam → confirm immediately
            if (feeAmount === 0) {
                const booking = await tx.booking.create({
                    data: { userId, slotId, status: BookingStatus.CONFIRMED },
                    include: { slot: { include: { examInstance: { include: { exam: true } } } } },
                });
                return { booking, requiresPayment: false, amount: 0 };
            }

            // Paid exam → PENDING booking; caller creates Razorpay order next
            const booking = await tx.booking.create({
                data: { userId, slotId, status: BookingStatus.PENDING },
                include: { slot: { include: { examInstance: { include: { exam: true } } } } },
            });
            return { booking, requiresPayment: true, amount: feeAmount };
        });
    }

    async cancelBooking(bookingId: string, userId: string) {
        const booking = await this.prisma.booking.findUnique({
            where: { id: bookingId },
            include: { slot: true },
        });
        if (!booking) throw new NotFoundException('Booking not found');
        if (booking.userId !== userId) throw new ForbiddenException();
        if (booking.status === BookingStatus.CANCELLED) {
            throw new BadRequestException('Booking already cancelled');
        }

        await this.prisma.$transaction([
            this.prisma.booking.update({
                where: { id: bookingId },
                data: { status: BookingStatus.CANCELLED },
            }),
            this.prisma.examSlot.update({
                where: { id: booking.slotId },
                data: { booked: { decrement: 1 } },
            }),
        ]);
        return { success: true };
    }

    async getMyBooking(userId: string, examId: string) {
        return this.prisma.booking.findFirst({
            where: {
                userId,
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                slot: { examInstance: { examId } },
            },
            include: {
                slot: { include: { examInstance: { include: { exam: true } } } },
                payment: true,
            },
        });
    }

    async adminListSlotBookings(slotId: string) {
        return this.prisma.booking.findMany({
            where: { slotId },
            include: {
                user: { select: { id: true, email: true, firstName: true, lastName: true } },
                payment: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async adminListAllSlots() {
        return this.prisma.examSlot.findMany({
            orderBy: { startsAt: 'asc' },
            include: { examInstance: { include: { exam: true } } },
        });
    }
}
