import { Module } from '@nestjs/common';
import { GroqClient } from '../../integrations/groq/groq.client.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { DiscoverController } from './discover.controller.js';

/** AI restaurant search over the catalog. */
@Module({ imports: [CatalogModule], controllers: [DiscoverController], providers: [GroqClient] })
export class DiscoverModule {}
