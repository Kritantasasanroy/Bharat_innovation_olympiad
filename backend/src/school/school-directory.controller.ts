import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { AddSchoolDto } from './dto/school.dto';
import { SchoolDirectoryService } from './school-directory.service';

/**
 * PUBLIC. A student is choosing their school mid-registration and has no token
 * yet, so every route here is unauthenticated. Nothing exposes a coordinator's
 * contact details — only what a student needs to recognise their own school.
 */
@Controller('schools')
export class SchoolDirectoryController {
    constructor(private directory: SchoolDirectoryService) {}

    /** Search by name, city or pincode. Only onboarded schools are returned. */
    @Get()
    @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    search(
        @Query('q') q?: string,
        @Query('name') name?: string,
        @Query('pincode') pincode?: string,
    ) {
        return this.directory.search({ q, name, pincode });
    }

    /** Resolve the code from a school's handover card; forgiving about how it was typed. */
    @Get('by-code/:code')
    byCode(@Param('code') code: string) {
        return this.directory.findByCode(code);
    }

    /** "My school isn't listed" — add it by name + pincode. Never creates a duplicate. */
    @Post('add')
    add(@Body() dto: AddSchoolDto) {
        return this.directory.addToDirectory(dto);
    }
}
