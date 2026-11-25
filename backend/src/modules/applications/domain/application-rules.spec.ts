import { applicationComplete, applyPatch, type Profile, validPatch, validWebsite } from './application-rules.js';

const t = (s: string) => ({ ru: s, en: s, ro: s });
const empty: Profile = {
  name: t(''), description: t(''), address: t(''), cuisine: [], phone: '', email: '', website: '', cityId: 'city-balti',
  lat: 0, lng: 0, priceLevel: 0, averageCheck: 0, hoursText: '', photoUrls: [],
};

describe('application rules', () => {
  it('lists changed fields with stable keys', () => {
    const { next, changed } = applyPatch(empty, { name: t('Oliva'), phone: '+373', hours_text: 'Пн–Вс 10:00–22:00', lat: 47.76 });
    expect(changed).toEqual(['name', 'phone', 'latitude', 'hours']);
    expect(next.name.ro).toBe('Oliva');
    expect(applyPatch(next, { name: t('Oliva') }).changed).toEqual([]);
  });

  it('rejects bad email, website, city, coordinates and price', () => {
    const known = (id: string) => id === 'city-chisinau';
    expect(validPatch({ email: 'nope' }, empty, known)).toBe(false);
    expect(validPatch({ website: 'ftp://x' }, empty, known)).toBe(false);
    expect(validPatch({ city_id: 'city-paris' }, empty, known)).toBe(false);
    expect(validPatch({ city_id: 'city-chisinau', lat: 47, price_level: 2 }, empty, known)).toBe(true);
    expect(validPatch({ price_level: 4 }, empty, known)).toBe(false);
    expect(validWebsite('https://oliva.md')).toBe(true);
  });

  it('needs a full profile, a photo and a point in Moldova to submit', () => {
    const full: Profile = {
      ...empty, name: t('Oliva'), description: t('Italian'), address: t('Independentei 15A'), cuisine: ['italian'],
      phone: '+37323122111', email: 'hi@oliva.md', hoursText: 'Пн–Вс 10:00–22:00', lat: 47.76, lng: 27.93, photoUrls: ['/media/a.jpg'],
    };
    expect(applicationComplete(full)).toBe(true);
    expect(applicationComplete({ ...full, photoUrls: [] })).toBe(false);
    expect(applicationComplete({ ...full, lat: 52.5, lng: 13.4 })).toBe(false);
  });
});
