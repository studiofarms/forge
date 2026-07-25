import { describe, expect, it } from 'vitest';
import { classifyAsset, mimeForName } from '@/lib/brand/packageImport';

describe('classifyAsset', () => {
  it('classifies by folder name first', () => {
    expect(classifyAsset('logos/mark.png')).toBe('logo');
    expect(classifyAsset('brand/products/jar.jpg')).toBe('product');
    expect(classifyAsset('lifestyle/field.webp')).toBe('lifestyle');
  });

  it('falls back to filename hints', () => {
    expect(classifyAsset('acme-logo-dark.png')).toBe('logo');
    expect(classifyAsset('packshot_front.jpg')).toBe('product');
    expect(classifyAsset('hero-banner.webp')).toBe('lifestyle');
  });

  it('classifies fonts by extension', () => {
    expect(classifyAsset('fonts/Inter.woff2')).toBe('font');
    expect(classifyAsset('Brand.ttf')).toBe('font');
  });

  it('returns other for unhinted images and null for junk', () => {
    expect(classifyAsset('random.png')).toBe('other');
    expect(classifyAsset('notes.txt')).toBeNull();
    expect(classifyAsset('video.mp4')).toBeNull();
  });
});

describe('mimeForName', () => {
  it('maps common extensions', () => {
    expect(mimeForName('a.PNG')).toBe('image/png');
    expect(mimeForName('a.woff2')).toBe('font/woff2');
    expect(mimeForName('a.zzz')).toBe('application/octet-stream');
  });
});
