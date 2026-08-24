import {
  validateFilename,
  validateTag,
  validateTags,
  normalizeTag,
  getS3Key,
  getThumbS3Key,
  generatePhotoId
} from '@metro/shared';

describe('validateFilename', () => {
  it('accepts valid extensions', () => {
    expect(validateFilename('photo.jpg')).toBe(true);
    expect(validateFilename('photo.jpeg')).toBe(true);
    expect(validateFilename('photo.png')).toBe(true);
    expect(validateFilename('photo.webp')).toBe(true);
  });

  it('rejects invalid extensions', () => {
    expect(validateFilename('photo.gif')).toBe(false);
    expect(validateFilename('photo.pdf')).toBe(false);
    expect(validateFilename('photo')).toBe(false);
  });
});

describe('validateTag', () => {
  it('accepts valid tags', () => {
    expect(validateTag('futbol')).toBe(true);
    expect(validateTag('River Plate')).toBe(true);
    expect(validateTag('2024')).toBe(true);
  });

  it('rejects empty or too long tags', () => {
    expect(validateTag('')).toBe(false);
    expect(validateTag('a'.repeat(51))).toBe(false);
  });
});

describe('validateTags', () => {
  it('allows up to 10 tags', () => {
    const tags = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    expect(validateTags(tags).valid).toBe(true);
  });

  it('rejects more than 10 tags', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    expect(validateTags(tags).valid).toBe(false);
  });
});

describe('normalizeTag', () => {
  it('lowercases and trims', () => {
    expect(normalizeTag('  FUTBOL  ')).toBe('futbol');
  });
});

describe('getS3Key', () => {
  it('generates correct s3 key', () => {
    expect(getS3Key('photo_123', 'test.jpg')).toBe('originals/photo_123.jpg');
  });
});

describe('getThumbS3Key', () => {
  it('generates correct thumb key', () => {
    expect(getThumbS3Key('photo_123')).toBe('thumbnails/photo_123_thumb.jpg');
  });
});

describe('generatePhotoId', () => {
  it('generates unique ids', () => {
    const id1 = generatePhotoId();
    const id2 = generatePhotoId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^photo_\d+_/);
  });
});
