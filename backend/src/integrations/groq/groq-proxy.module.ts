import { Module } from '@nestjs/common';
import { GroqProxyController } from './groq-proxy.controller.js';

/** Groq pass-through for the Twenty CRM's AI (see GroqProxyController). */
@Module({ controllers: [GroqProxyController] })
export class GroqProxyModule {}
