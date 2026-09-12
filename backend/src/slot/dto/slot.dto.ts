import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    Max,
    Min,
} from 'class-validator';

/** `HH:mm` on a 24-hour clock, IST. */
const TIME_OF_DAY = /^([01]?\d|2[0-3]):[0-5]\d$/;

export class CreateSlotTimingDto {
    @IsUUID()
    examInstanceId: string;

    @IsOptional()
    @IsString()
    label?: string;

    @Matches(TIME_OF_DAY, { message: 'startTime must be HH:mm (24-hour, IST)' })
    startTime: string;

    @Matches(TIME_OF_DAY, { message: 'endTime must be HH:mm (24-hour, IST)' })
    endTime: string;

    /** Seats per sitting. The product default is 50; see `SlotTiming.capacity`. */
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100_000)
    capacity?: number;

    /** 0 = Sunday … 6 = Saturday. */
    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(7)
    @IsInt({ each: true })
    @Min(0, { each: true })
    @Max(6, { each: true })
    @Type(() => Number)
    weekdays?: number[];

    /** Calendar tier: 1 is filled before 2, and selects which dates run it. */
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(9)
    priority?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsInt()
    sortOrder?: number;
}

export class UpdateSlotTimingDto {
    @IsOptional()
    @IsString()
    label?: string;

    @IsOptional()
    @Matches(TIME_OF_DAY, { message: 'startTime must be HH:mm (24-hour, IST)' })
    startTime?: string;

    @IsOptional()
    @Matches(TIME_OF_DAY, { message: 'endTime must be HH:mm (24-hour, IST)' })
    endTime?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100_000)
    capacity?: number;

    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(7)
    @IsInt({ each: true })
    @Min(0, { each: true })
    @Max(6, { each: true })
    @Type(() => Number)
    weekdays?: number[];

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(9)
    priority?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsInt()
    sortOrder?: number;
}

/** Admin edits to one materialised sitting. Its date and timing are fixed. */
export class UpdateSlotDto {
    @IsOptional()
    @IsString()
    label?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100_000)
    capacity?: number;

    @IsOptional()
    @IsDateString()
    startsAt?: string;

    @IsOptional()
    @IsDateString()
    endsAt?: string;
}

/** Creating a one-off sitting by hand, outside the recurring timings. */
export class CreateSlotDto {
    @IsUUID()
    examInstanceId: string;

    @IsOptional()
    @IsString()
    label?: string;

    @IsDateString()
    startsAt: string;

    @IsDateString()
    endsAt: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100_000)
    capacity?: number;
}

/** Moving one student to a specific sitting. */
export class AssignSlotDto {
    @IsUUID()
    slotId: string;
}

/** The per-instance auto-assignment rules an admin can tune. */
export class UpdateAssignmentRulesDto {
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(365)
    slotLeadDays?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(730)
    slotHorizonDays?: number;

    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(7)
    @IsInt({ each: true })
    @Min(0, { each: true })
    @Max(6, { each: true })
    @Type(() => Number)
    slotDayPreference?: number[];
}

// ── The published calendar ────────────────────────────────────────────────────

/** One day added to an exam's published calendar. */
export class CreateScheduleDateDto {
    @IsUUID()
    examInstanceId: string;

    /** `YYYY-MM-DD`, read as an IST calendar day. */
    @IsDateString()
    date: string;

    /** 1 is filled before 2, and decides which timings the day runs. */
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(9)
    priority?: number;

    /** False marks a blackout — a day kept on the calendar but closed. */
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsString()
    note?: string;
}

export class UpdateScheduleDateDto {
    @IsOptional()
    @IsDateString()
    date?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(9)
    priority?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsString()
    note?: string;
}
