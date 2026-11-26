import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Roles } from '../../core/auth/auth.decorators.js';
import { StaffTeamService } from './staff-team.service.js';

const inviteBody = z.object({ email: z.string().min(1), name: z.string().optional(), role: z.string().optional() });
const shiftBody = z.object({ staff_id: z.string().optional(), date: z.string().optional(), start_time: z.string().optional(), end_time: z.string().optional(), note: z.string().optional() });
const batchBody = z.object({
  staff_ids: z.array(z.string()).optional(),
  dates: z.array(z.string()).optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  note: z.string().optional(),
});
const copyBody = z.object({ source_start_date: z.string().default(''), target_start_date: z.string().default('') });
const swapBody = z.object({ new_staff_id: z.string().min(1) });
const respondBody = z.object({ status: z.string().min(1), reason: z.string().optional() });
const roleBody = z.object({ role: z.string().min(1).max(64) });
const onShiftBody = z.object({ on_shift: z.boolean().optional() });

/** Team and schedule in the restaurant cabinet (roles restaurant, admin). */
@Roles('restaurant', 'admin')
@Controller('api/v1/restaurant/venues/:venueId')
export class StaffTeamController {
  constructor(private readonly team: StaffTeamService) {}

  @Post('staff/invite')
  async invite(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Body({ schema: inviteBody }) body: z.infer<typeof inviteBody>) {
    return { staff: await this.team.invite(user.id, id, body.email, body.name, body.role) };
  }

  @Get('staff')
  async list(@CurrentUser() user: AuthUser, @Param('venueId') id: string) {
    return { staff: await this.team.team(user.id, id) };
  }

  @Delete('staff/:staffId')
  remove(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Param('staffId') staffId: string) {
    return this.team.remove(user.id, id, staffId);
  }

  /** Assigns a venue role (key from GET roles). */
  @Patch('staff/:staffId')
  async assign(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Param('staffId') staffId: string, @Body({ schema: roleBody }) body: z.infer<typeof roleBody>) {
    return { staff: await this.team.assignRole(user.id, id, staffId, body.role) };
  }

  /** Body optional: {on_shift} sets it, without it the flag flips. */
  @Post('staff/:staffId/shift')
  @HttpCode(200)
  async onShift(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Param('staffId') staffId: string, @Req() req: Request) {
    const body = onShiftBody.safeParse(req.body ?? {});
    return { staff: await this.team.toggleShift(user.id, id, staffId, body.success ? body.data.on_shift : undefined) };
  }

  @Get('shifts')
  async shifts(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Query('role') role?: string) {
    return { shifts: await this.team.shifts(user.id, id, role) };
  }

  @Post('shifts')
  async create(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Body({ schema: shiftBody }) body: z.infer<typeof shiftBody>) {
    return { shift: await this.team.createShift(user.id, id, body) };
  }

  @Post('shifts/batch')
  async batch(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Body({ schema: batchBody }) body: z.infer<typeof batchBody>) {
    return { shifts: await this.team.batch(user.id, id, body) };
  }

  @Post('shifts/copy-week')
  copyWeek(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Body({ schema: copyBody }) body: z.infer<typeof copyBody>) {
    return this.team.copyWeek(user.id, id, body.source_start_date.trim(), body.target_start_date.trim());
  }

  @Post('shifts/:shiftId/swap')
  @HttpCode(200)
  async swap(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Param('shiftId') shiftId: string, @Body({ schema: swapBody }) body: z.infer<typeof swapBody>) {
    return { shift: await this.team.swap(user.id, id, shiftId, body.new_staff_id) };
  }

  @Delete('shifts/:shiftId')
  deleteShift(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Param('shiftId') shiftId: string) {
    return this.team.deleteShift(user.id, id, shiftId);
  }
}

/** The staff member's side: invites and own shifts. */
@Controller('api/v1/staff')
export class StaffSelfController {
  constructor(private readonly team: StaffTeamService) {}

  /** Any signed-in user may accept an invite sent to their email. */
  @Post('invites/:id/accept')
  @HttpCode(200)
  async accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { staff: await this.team.accept(user.id, id) };
  }

  @Roles('staff', 'restaurant', 'admin')
  @Get('shifts')
  async mine(@CurrentUser() user: AuthUser) {
    return { shifts: await this.team.myShifts(user.id) };
  }

  @Roles('staff', 'restaurant', 'admin')
  @Post('shifts/:shiftId/respond')
  @HttpCode(200)
  async respond(@CurrentUser() user: AuthUser, @Param('shiftId') shiftId: string, @Body({ schema: respondBody }) body: z.infer<typeof respondBody>) {
    return { shift: await this.team.respond(user.id, shiftId, body.status, body.reason) };
  }
}
