import { describe, expect, it } from 'vitest';
import { usePages } from './pages';

describe('usePages hook definition', () => {
  it('is exported as a function', () => {
    expect(typeof usePages).toBe('function');
  });
});
