import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../../core/auth/auth.decorators.js';
import { openApiYaml } from './openapi.js';

@Controller('api')
export class DocsController {
  private readonly yaml = openApiYaml();

  /** The contract, byte for byte (Swagger UI is mounted at /api/docs in main.ts). */
  @Public()
  @Get('openapi.yaml')
  @Header('Content-Type', 'application/yaml; charset=utf-8')
  openapi(): string {
    return this.yaml;
  }
}
