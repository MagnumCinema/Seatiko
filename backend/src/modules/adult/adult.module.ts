import { Controller, Get, Module, Query } from '@nestjs/common';
import { Roles } from '../../core/auth/auth.decorators.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { AdultService } from './adult.service.js';

@Roles('admin')
@Controller('api/v1/admin')
export class AdultAuditController {
  constructor(private readonly adult: AdultService) {}

  /** The 18+ grant / revoke audit, optionally for one guest. */
  @Get('adult-permission-log')
  async log(@Query('user_id') userId?: string) {
    return { entries: await this.adult.log(userId || undefined) };
  }
}

/** 18+ preorders: grant, revoke, audit, age check when serving. */
@Module({
  imports: [CatalogModule],
  controllers: [AdultAuditController],
  providers: [AdultService],
  exports: [AdultService],
})
export class AdultModule {}
