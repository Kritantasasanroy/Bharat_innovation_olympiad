import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';

/**
 * The validated shape of a bulk question import.
 *
 * The pre-existing bulk endpoints (`POST /admin/questions/bulk`,
 * `POST /admin/sections/:id/questions/bulk`) take `any[]` and hand it straight
 * to `prisma.question.create`. That was survivable while the payload was nine
 * columns produced by our own parser; it is not survivable now that an
 * admin-uploaded spreadsheet decides how a live exam is *structured* — an
 * unexpected key becomes a Prisma error halfway through a 50-row transaction,
 * and a missing one becomes a question nobody can answer.
 */

export class ImportOptionDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    text: string;

    @IsBoolean()
    isCorrect: boolean;
}

export class ImportQuestionDto {
    // `@IsNotEmpty` as well as `@IsString`: the global pipe runs with
    // `enableImplicitConversion`, so a bare `@IsString()` accepts an empty
    // string — and a blank spreadsheet cell is by far the likeliest bad input.
    @IsString()
    @IsNotEmpty()
    @MaxLength(8000)
    text: string;

    /**
     * Always four options for this format, exactly one of them correct. The
     * "exactly one" part is checked in the service, where a violation can be
     * reported against a row number the admin can actually find.
     */
    @IsArray()
    @ArrayMinSize(2)
    @ArrayMaxSize(6)
    @ValidateNested({ each: true })
    @Type(() => ImportOptionDto)
    options: ImportOptionDto[];

    @IsIn(['EASY', 'MEDIUM', 'HARD'])
    @IsOptional()
    difficulty?: 'EASY' | 'MEDIUM' | 'HARD';

    @IsInt()
    @Min(0)
    @Max(100)
    @IsOptional()
    marks?: number;

    @IsNumber()
    @Min(0)
    @Max(100)
    @IsOptional()
    negativeMarks?: number;

    @IsString()
    @MaxLength(8000)
    @IsOptional()
    explanation?: string;

    // ── Olympiad question-database format ──

    @IsString() @MaxLength(120) @IsOptional() externalId?: string;
    @IsInt() @Min(1) @Max(12) @IsOptional() grade?: number;
    /** Becomes an ExamSection. The one field the import genuinely depends on. */
    @IsString() @MaxLength(120) @IsOptional() partCode?: string;
    @IsString() @MaxLength(200) @IsOptional() partName?: string;
    @IsString() @MaxLength(120) @IsOptional() sectionCode?: string;
    @IsString() @MaxLength(200) @IsOptional() sectionName?: string;
    @IsString() @MaxLength(300) @IsOptional() topic?: string;
    @IsString() @MaxLength(1000) @IsOptional() learningObjective?: string;
    @IsString() @MaxLength(200) @IsOptional() questionCategory?: string;
    @IsString() @MaxLength(100) @IsOptional() bloomLevel?: string;
    @IsString() @MaxLength(300) @IsOptional() competency?: string;
    @IsString() @MaxLength(200) @IsOptional() questionFormat?: string;
    @IsString() @MaxLength(2000) @IsOptional() futureReadyInsight?: string;

    /** Matched against `MediaAsset.filename` when the row carries no link. */
    @IsString() @MaxLength(300) @IsOptional() imageFilename?: string;
    /** A Google Drive URL. Never fetched as given — the file id is extracted. */
    @IsString() @MaxLength(2000) @IsOptional() imageSourceUrl?: string;

    /**
     * Authoring leftovers. Never sent to students.
     *
     * `@IsObject` is load-bearing, not decoration: the global pipe runs with
     * `whitelist: true`, which strips any property the DTO does not explicitly
     * validate. Without a real constraint here the whole metadata blob would be
     * silently dropped on the way in.
     */
    @IsObject()
    @IsOptional()
    metadata?: Record<string, unknown>;
}

export class ImportQuestionsDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(500)
    @ValidateNested({ each: true })
    @Type(() => ImportQuestionDto)
    questions: ImportQuestionDto[];

    /**
     * Replace the exam's existing sections and questions rather than appending.
     * Re-importing a corrected workbook is the common case, and appending would
     * silently double the paper.
     */
    @IsBoolean()
    @IsOptional()
    replaceExisting?: boolean;
}
