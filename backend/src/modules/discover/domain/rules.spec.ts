import { encodePrefs } from './prefs.js';
import { rank } from './rank.js';
import { mergePrefs, parseText } from './rules.js';

describe('parseText', () => {
  it('reads cuisine, occasion and a cheap budget in Russian', () => {
    const p = parseText('недорогое итальянское на свидание');
    expect(p).toMatchObject({ cuisine: ['italian'], occasion: ['date_night'], budget: { min: 50, max: 200 } });
    expect(encodePrefs(p)).toContain('cuisine=italian');
  });

  it('Romanian and English, pizza implies pizzeria, euros to MDL', () => {
    expect(parseText('pizza pentru familie')).toMatchObject({ cuisine: ['italian'], restaurant_type: ['pizzeria'], occasion: ['family'] });
    expect(parseText('sushi near me up to 20 €').budget).toEqual({ min: 50, max: 400 });
    expect(parseText('barbecue').restaurant_type).not.toContain('bar');
  });

  it('merges: mentioned fields replace, practical accumulates', () => {
    const merged = mergePrefs({ cuisine: ['moldovan'], restaurant_type: [], occasion: ['family'], practical: ['open_now'] }, parseText('суши рядом'));
    expect(merged).toMatchObject({ cuisine: ['japanese'], occasion: ['family'], practical: ['open_now', 'nearby'] });
  });
});

describe('rank', () => {
  const place = (id: string, cuisine: string[], rating = 4) => ({ id, venue_id: id, name: { ru: id, en: id, ro: id }, lat: 0, lng: 0, in_database: true, free_tables: 3, open_now: true, cuisine, price_level: 2, rating });
  it('puts matching cuisine first with its reasons', () => {
    const { ranked, exact } = rank([place('a', ['moldovan'], 5), place('b', ['italian'], 4)], { cuisine: ['italian'], restaurant_type: [], occasion: [], practical: [] }, undefined, 8);
    expect(exact).toBe(true);
    expect(ranked[0]).toMatchObject({ venue_id: 'b', reasons: ['cuisine'] });
  });
});
