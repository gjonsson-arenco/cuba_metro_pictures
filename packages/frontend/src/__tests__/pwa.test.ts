import { describe, it, expect } from 'vitest';
import { detectIOS } from '../lib/pwa';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD_LEGACY = 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
// iPadOS 13+ se declara Macintosh para que le sirvan la web de escritorio.
const IPAD_MODERN = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

describe('detectIOS', () => {
  it('reconoce un iPhone', () => {
    expect(detectIOS(IPHONE, 5)).toBe(true);
  });

  it('reconoce un iPad viejo, que se declara iPad', () => {
    expect(detectIOS(IPAD_LEGACY, 5)).toBe(true);
  });

  it('reconoce un iPad moderno pese a decir que es Macintosh', () => {
    expect(detectIOS(IPAD_MODERN, 5)).toBe(true);
  });

  it('no confunde a una Mac con un iPad: la delata la falta de touch', () => {
    expect(detectIOS(MAC, 0)).toBe(false);
  });

  it('deja afuera a Android', () => {
    expect(detectIOS(ANDROID, 5)).toBe(false);
  });

  it('deja afuera a Windows, incluso con pantalla táctil', () => {
    expect(detectIOS(WINDOWS, 10)).toBe(false);
  });
});
