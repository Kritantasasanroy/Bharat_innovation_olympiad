import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/**
 * What a student may change about themselves (item 14).
 *
 * This class exists as much for what it *excludes* as what it allows. The route
 * used to take an inline-typed body (`@Body() data: { firstName?: string }`) and
 * hand it straight to `prisma.user.update`. An inline TypeScript type erases to
 * `Object` at runtime, and Nest's `ValidationPipe` skips any body whose metatype
 * is a native type — so `whitelist`/`forbidNonWhitelisted` never engaged, and the
 * **entire request body** reached Prisma. A student could have sent
 * `{"role": "SUPER_ADMIN"}` or `{"schoolId": "..."}` and escalated themselves.
 *
 * With a decorated DTO the pipe strips everything not listed here, so `role`,
 * `schoolId`, `isActive`, `faceEmbedding` and `email` are unreachable from this
 * endpoint regardless of what the client sends.
 */
export class UpdateUserProfileDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    firstName?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    lastName?: string;

    @IsOptional()
    @Matches(/^[0-9+\-\s()]{6,20}$/, { message: 'Enter a valid contact number.' })
    phone?: string;

    @IsOptional()
    @IsString()
    profileImageUrl?: string;
}
