import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Roles } from '../../core/auth/auth.decorators.js';
import { VenueRolesService } from './venue-roles.service.js';

const roleBody = z.object({
  name: z.string().max(200).optional(),
  color: z.string().max(20).optional(),
  in_schedule: z.boolean().optional(),
  position: z.number().int().min(0).max(1000).optional(),
  permissions: z.array(z.string().max(64)).max(50).optional(),
});
const presetBody = z.object({ keys: z.array(z.string().max(64)).max(30).optional() });

/** Team roles of a venue (owner of the venue or admin). */
@Roles('restaurant', 'admin')
@Controller('api/v1/restaurant/venues/:venueId/roles')
export class VenueRolesController {
  constructor(private readonly roles: VenueRolesService) {}

  /** Roles (seeded from the venue type preset on first use) and preset roles the venue is missing. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Param('venueId') id: string) {
    return this.roles.list(user.id, id);
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Body({ schema: roleBody }) body: z.infer<typeof roleBody>) {
    return { role: await this.roles.create(user.id, id, body) };
  }

  /** Adds missing preset roles of the venue type (all or `keys`). */
  @Post('preset')
  @HttpCode(200)
  async preset(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Body({ schema: presetBody }) body: z.infer<typeof presetBody>) {
    return { roles: await this.roles.addPreset(user.id, id, body.keys) };
  }

  @Patch(':roleId')
  async update(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Param('roleId') roleId: string, @Body({ schema: roleBody }) body: z.infer<typeof roleBody>) {
    return { role: await this.roles.update(user.id, id, roleId, body) };
  }

  /** Custom roles only; `?reassign_to=<key>` moves members first (else 409 role_in_use). */
  @Delete(':roleId')
  remove(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Param('roleId') roleId: string, @Query('reassign_to') reassignTo?: string) {
    return this.roles.remove(user.id, id, roleId, reassignTo);
  }
}
