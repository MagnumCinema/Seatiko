import { distanceM, nameSimilarity, normalizeName, samePlace } from './name-match.js';

describe('normalizeName', () => {
  it('drops accents, apostrophes and transliterates Cyrillic', () => {
    expect(normalizeName('Andy’s Pizza')).toBe('andys pizza');
    expect(normalizeName('Cafenea „Bălți”')).toBe('cafenea balti');
    expect(normalizeName('Поляна')).toBe('poliana');
  });
});

describe('nameSimilarity', () => {
  it('matches the same name across scripts and generic words', () => {
    expect(nameSimilarity('Поляна', 'Poliana')).toBe(1);
    expect(nameSimilarity('Restaurant Oliva', 'Oliva')).toBe(1);
    expect(nameSimilarity("Andy's Pizza", 'Andy’s Pizza Bălți')).toBeGreaterThanOrEqual(0.9);
  });

  it('keeps different places apart', () => {
    expect(nameSimilarity('Oliva', 'Maestro')).toBeLessThan(0.3);
    expect(nameSimilarity('Cafe', 'Bar')).toBe(0);
  });
});

describe('samePlace', () => {
  const oliva = { name: 'Oliva', lat: 47.7617, lng: 27.9288 };
  it('merges near points with similar names', () => {
    expect(samePlace(oliva, { name: 'Restaurant Oliva', lat: 47.7619, lng: 27.9291 })).toBe(true);
  });
  it('does not merge distinct neighbours or far points', () => {
    expect(samePlace(oliva, { name: 'Maestro', lat: 47.7618, lng: 27.9288 })).toBe(false);
    expect(samePlace(oliva, { name: 'Oliva', lat: 47.7717, lng: 27.9288 })).toBe(false);
  });
  it('measures metres', () => {
    expect(Math.round(distanceM(47.76, 27.92, 47.77, 27.92))).toBe(1112);
  });
});
