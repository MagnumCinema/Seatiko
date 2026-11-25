import { Module } from '@nestjs/common';
import { AdminReportsRepository } from './admin-reports.repository.js';
import { AdminController } from './admin.controller.js';

/** Admin console reports. */
@Module({ controllers: [AdminController], providers: [AdminReportsRepository] })
export class AdminModule {}
