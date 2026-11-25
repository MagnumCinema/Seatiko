import { StandardSchemaValidationPipe } from '@nestjs/common';
import { badRequest } from '../errors/domain-error.js';

/** Error codes are lower_snake_case; any other message is a library default. */
const CODE = /^[a-z][a-z0-9_]*$/;

/**
 * Validation for every parameter that declares a Zod schema. A schema sets the Go error
 * code as its message (z.number().min(1, 'invalid_guests')); otherwise the answer is
 * 400 invalid_body, as in the Go API.
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => {
      const coded = issues.find((issue) => CODE.test(issue.message));
      return badRequest(coded?.message ?? 'invalid_body');
    },
  });
}
