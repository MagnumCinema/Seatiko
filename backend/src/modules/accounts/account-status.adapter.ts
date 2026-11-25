import { Injectable } from '@nestjs/common';
import { AccountStatusPort } from '../../core/auth/account-status.port.js';
import { AccountsService } from './accounts.service.js';

/** Gives the global auth guard the stored role and deletion state of a token's user. */
@Injectable()
export class AccountStatusAdapter extends AccountStatusPort {
  constructor(private readonly accounts: AccountsService) {
    super();
  }

  lookup(userId: string) {
    return this.accounts.status(userId);
  }
}
