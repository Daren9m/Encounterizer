export type BoundedIntegerValidation =
  | { value: number; error: null }
  | { value: null; error: string };

/**
 * Validates a number field without coercing intermediate editing states.
 * Keeping the raw string separate lets mobile users clear and replace a value
 * instead of having an empty field immediately snap to its minimum.
 */
export function validateBoundedIntegerInput(
  raw: string,
  label: string,
  min: number,
  max: number,
): BoundedIntegerValidation {
  const trimmed = raw.trim();

  if (trimmed === '') {
    return { value: null, error: `${label} is required (${min}–${max}).` };
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return { value: null, error: `${label} must be a whole number from ${min} to ${max}.` };
  }

  if (value < min || value > max) {
    return { value: null, error: `${label} must be between ${min} and ${max}.` };
  }

  return { value, error: null };
}
