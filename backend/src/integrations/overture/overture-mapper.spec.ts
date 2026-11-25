import { cuisineFromHierarchy, fromOverture, type OvertureRow } from './overture-mapper.js';

const row = (over: Partial<OvertureRow> = {}): OvertureRow => ({
  id: 'g1', name: 'Oliva', name_ru: null, name_ro: null, name_en: null, lat: 47.76, lng: 27.93, category: 'restaurant',
  hierarchy: ['food_and_drink', 'restaurant', 'european_restaurant', 'italian_restaurant'], confidence: 0.99,
  phone: '+37323122111', website: 'http://www.oliva.md', street: 'Independentei St 15A', locality: 'Bălți', ...over,
});

describe('fromOverture', () => {
  it('maps category, cuisine from the taxonomy, phone, site and address', () => {
    expect(fromOverture(row())).toEqual({
      source: 'overture', sourceId: 'g1', name: { ru: 'Oliva', ro: 'Oliva', en: 'Oliva' }, lat: 47.76, lng: 27.93,
      address: { ru: 'Independentei St 15A, Bălți', ro: 'Independentei St 15A, Bălți', en: 'Independentei St 15A, Bălți' },
      category: 'restaurant', cuisine: ['european', 'italian'], openingHours: '', phone: '+37323122111', website: 'http://www.oliva.md', confidence: 0.99,
    });
  });

  it('skips wineries and nameless rows', () => {
    expect(fromOverture(row({ category: 'winery' }))).toBeUndefined();
    expect(fromOverture(row({ name: ' ' }))).toBeUndefined();
  });

  it('ignores fast food as a cuisine', () => {
    expect(cuisineFromHierarchy(['food_and_drink', 'fast_food_restaurant', 'burger_restaurant'])).toEqual(['burger']);
  });
});
