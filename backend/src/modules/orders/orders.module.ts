import { Global, Module } from '@nestjs/common';
import { OrdersRepository } from './orders.repository.js';

/** Orders and their lines: preorders (reservations), table orders (floor), staff views. */
@Global()
@Module({ providers: [OrdersRepository], exports: [OrdersRepository] })
export class OrdersModule {}
