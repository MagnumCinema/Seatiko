import { dedupe, linkVenues, mergePlaces, type SourcePlace } from './merge.js';

const same = (s: string) => ({ ru: s, ro: s, en: s });
const place = (over: Partial<SourcePlace> & Pick<SourcePlace, 'source' | 'sourceId'>): SourcePlace => ({
  name: same('Oliva'), lat: 47.7617, lng: 27.9288, address: same(''), category: 'restaurant',
  cuisine: [], openingHours: '', phone: '', website: '', confidence: 1, ...over,
});

describe('mergePlaces', () => {
  it('joins the OSM and Overture records of one place, OSM point and hours, Overture phone', () => {
    const osm = [place({ source: 'osm', sourceId: 'n1', name: { ru: 'Олива', ro: 'Oliva', en: 'Oliva' }, openingHours: 'Mo-Su 10:00-23:00' })];
    const ovt = [place({ source: 'overture', sourceId: 'g1', lat: 47.7619, lng: 27.9290, phone: '+37323122111', website: 'http://www.oliva.md', address: same('Independentei St 15A'), confidence: 0.99 })];
    const [merged, ...rest] = mergePlaces(osm, ovt);
    expect(rest).toEqual([]);
    expect(merged).toMatchObject({
      id: 'osm:n1', osmId: 'n1', overtureId: 'g1', sources: ['osm', 'overture'],
      lat: 47.7617, openingHours: 'Mo-Su 10:00-23:00', phone: '+37323122111', website: 'http://www.oliva.md',
      address: same('Independentei St 15A'), name: { ru: 'Олива', ro: 'Oliva', en: 'Oliva' },
    });
  });

  it('keeps unmatched places from both datasets', () => {
    const out = mergePlaces(
      [place({ source: 'osm', sourceId: 'n1' })],
      [place({ source: 'overture', sourceId: 'g2', name: same('Maestro'), lat: 47.7620 })],
    );
    expect(out.map((p) => p.id).sort()).toEqual(['osm:n1', 'ovt:g2']);
  });

  it('drops Overture duplicates, keeping the most confident', () => {
    const out = dedupe([
      place({ source: 'overture', sourceId: 'low', confidence: 0.7 }),
      place({ source: 'overture', sourceId: 'high', lat: 47.7618, confidence: 0.95 }),
    ]);
    expect(out.map((p) => p.sourceId)).toEqual(['high']);
  });
});

describe('linkVenues', () => {
  it('links a partner venue to the open place at its door', () => {
    const merged = mergePlaces([place({ source: 'osm', sourceId: 'n1', name: same('Andy’s Pizza') })], []);
    const links = linkVenues(merged, [
      { id: 'venue-3', name: { ru: "Andy's Pizza", ro: "Andy's Pizza", en: "Andy's Pizza" }, lat: 47.7616, lng: 27.9287 },
      { id: 'venue-9', name: same('Oliva'), lat: 47.7616, lng: 27.9287 },
    ]);
    expect([...links]).toEqual([['osm:n1', 'venue-3']]);
  });
});
