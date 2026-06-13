import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateSlotDto {
    @IsUUID()
    examInstanceId: string;

    @IsDateString()
    startsAt: string;

    @IsDateString()
    endsAt: string;

    @IsInt()
    @Min(1)
    capacity: number;

    @IsOptional()
    @IsString()
    label?: string;
}

export class BookSlotDto {
    @IsOptional()
    @IsString()
    couponCode?: string;
}
