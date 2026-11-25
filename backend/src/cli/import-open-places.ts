import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { OpenPlacesService } from '../modules/open-places/open-places.service.js';

/**
 * Re-imports the open-data places now, whatever their age:
 *   npm run places:import            (local)
 *   docker compose exec nest-api node dist/cli/import-open-places.js
 */
process.env.OPEN_PLACES_IMPORT = 'false'; // no second, background run from the scheduler
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
try {
  const result = await app.get(OpenPlacesService).runImport();
  console.log(JSON.stringify(result));
  process.exitCode = result.status === 'failed' ? 1 : 0;
} finally {
  await app.close();
}
