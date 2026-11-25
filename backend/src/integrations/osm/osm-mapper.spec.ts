import { fromOsm, overpassQuery } from './osm-mapper.js';

describe('fromOsm', () => {
  it('maps a named cafe with localized names, address, hours and contacts', () => {
    const place = fromOsm({
      type: 'node', id: 42, lat: 47.76, lon: 27.93,
      tags: { amenity: 'cafe', name: 'Поляна', 'name:ro': 'Poiana', 'addr:street': 'Strada Independenței', 'addr:housenumber': '39', 'addr:city': 'Bălți', opening_hours: 'Mo-Su 09:00-22:00', 'contact:phone': '+373 231 2 34 56; +373 69 000 000', cuisine: 'coffee_shop;regional' },
    });
    expect(place).toEqual({
      source: 'osm', sourceId: 'n42', name: { ru: 'Поляна', ro: 'Poiana', en: 'Poiana' }, lat: 47.76, lng: 27.93,
      address: { ru: 'Strada Independenței 39, Bălți', ro: 'Strada Independenței 39, Bălți', en: 'Strada Independenței 39, Bălți' },
      category: 'cafe', cuisine: ['coffee_shop', 'regional'], openingHours: 'Mo-Su 09:00-22:00', phone: '+373 231 2 34 56', website: '', confidence: 1,
    });
  });

  it('uses the way centre and skips unnamed, unknown or closed places', () => {
    expect(fromOsm({ type: 'way', id: 7, center: { lat: 1, lon: 2 }, tags: { shop: 'bakery', name: 'Franzeluța' } })).toMatchObject({ sourceId: 'w7', lat: 1, lng: 2, category: 'bakery' });
    expect(fromOsm({ type: 'node', id: 1, lat: 1, lon: 2, tags: { amenity: 'cafe' } })).toBeUndefined();
    expect(fromOsm({ type: 'node', id: 1, lat: 1, lon: 2, tags: { amenity: 'bank', name: 'MAIB' } })).toBeUndefined();
    expect(fromOsm({ type: 'node', id: 1, lat: 1, lon: 2, tags: { amenity: 'cafe', name: 'X', opening_hours: 'closed' } })).toBeUndefined();
  });

  it('queries the bounding box', () => {
    expect(overpassQuery({ south: 47.7, west: 27.84, north: 47.82, east: 28.02 })).toContain('(47.7,27.84,47.82,28.02)');
  });
});
