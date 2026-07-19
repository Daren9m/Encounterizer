import { describe, expect, it } from 'vitest';
import { validateBoundedIntegerInput } from '@/lib/number-input';

describe('validateBoundedIntegerInput', () => {
  it('accepts whole numbers inside the range', () => {
    expect(validateBoundedIntegerInput('6', 'Party size', 1, 10)).toEqual({
      value: 6,
      error: null,
    });
  });

  it('preserves an empty editing state as a validation error', () => {
    expect(validateBoundedIntegerInput('', 'Party size', 1, 10)).toEqual({
      value: null,
      error: 'Party size is required (1–10).',
    });
  });

  it('rejects values outside the range instead of clamping them', () => {
    expect(validateBoundedIntegerInput('16', 'Party size', 1, 10)).toEqual({
      value: null,
      error: 'Party size must be between 1 and 10.',
    });
  });

  it('rejects decimal and partial numeric input', () => {
    expect(validateBoundedIntegerInput('2.5', 'Party level', 1, 20).value).toBeNull();
    expect(validateBoundedIntegerInput('-', 'Party level', 1, 20).value).toBeNull();
  });
});
