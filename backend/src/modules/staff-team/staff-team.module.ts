import { Module } from '@nestjs/common';
import { StaffSelfController, StaffTeamController } from './staff-team.controller.js';
import { StaffTeamRepository } from './staff-team.repository.js';
import { StaffTeamService } from './staff-team.service.js';

/** Venue team (invites, on shift) and work shifts. */
@Module({
  controllers: [StaffTeamController, StaffSelfController],
  providers: [StaffTeamRepository, StaffTeamService],
})
export class StaffTeamModule {}
