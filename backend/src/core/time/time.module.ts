import { Global, Module } from '@nestjs/common';
import { Clock, SystemClock } from './time.js';

/** The wall clock for every module; tests override Clock. */
@Global()
@Module({ providers: [{ provide: Clock, useClass: SystemClock }], exports: [Clock] })
export class TimeModule {}
