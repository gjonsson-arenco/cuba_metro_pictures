import { describe, it, expect } from 'vitest';
import { validateFilename, validateTag, normalizeTag, MAX_FILE_SIZE_MB } from '@metro/shared';

describe('shared utils in frontend context', () => {
  it('validates allowed file extensions', () => {
    expect(validateFilename('photo.jpg')).toBe(true);
    expect(validateFilename('photo.png')).toBe(true);
    expect(validateFilename('photo.webp')).toBe(true);
    expect(validateFilename('photo.gif')).toBe(false);
  });

  it('validates tags', () => {
    expect(validateTag('metropolitano')).toBe(true);
    expect(validateTag('')).toBe(false);
  });

  it('normalizes tags', () => {
    expect(normalizeTag('  VELA  ')).toBe('vela');
  });

  it('max file size is 10MB', () => {
    expect(MAX_FILE_SIZE_MB).toBe(10);
  });
});
