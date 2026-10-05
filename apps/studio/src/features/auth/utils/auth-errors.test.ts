import { describe, expect, it } from 'vitest';
import { isEmailNotVerifiedError } from './auth-errors';

describe('isEmailNotVerifiedError', () => {
  it('returns true when error message mentions email verification', () => {
    expect(isEmailNotVerifiedError({ message: 'Email not verified' })).toBe(true);
  });

  it('returns true when error code mentions email verification', () => {
    expect(isEmailNotVerifiedError({ code: 'EMAIL_NOT_VERIFIED' })).toBe(true);
  });

  it('returns false for unrelated errors or nil values', () => {
    expect(isEmailNotVerifiedError({ message: 'Invalid credentials' })).toBe(false);
    expect(isEmailNotVerifiedError(null)).toBe(false);
  });
});
