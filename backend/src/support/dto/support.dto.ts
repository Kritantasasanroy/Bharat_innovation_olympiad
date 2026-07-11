import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** A partner or school raising a support ticket. */
export class CreateSupportTicketDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(60)
    category: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    subject: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(4000)
    message: string;
}

/** An admin responding to / resolving a ticket. */
export class DecideSupportTicketDto {
    @IsIn(['IN_REVIEW', 'RESOLVED'])
    status: 'IN_REVIEW' | 'RESOLVED';

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    response?: string;
}
