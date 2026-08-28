import { describe, expect, it } from 'vitest'
import { allZones, isValidZone, matchZones, offsetLabel, zoneOffsets } from './zones'
import { formatTime } from './formatTime'

describe('the zone list', () => {
  it('includes UTC, which the platform list leaves out', () => {
    expect(allZones().some((z) => z.id === 'UTC')).toBe(true)
  })

  it('comes from the platform, not a hardcoded list', () => {
    const zones = allZones()
    // The IANA database has well over three hundred zones; a couple of dozen
    // would mean the fallback list is in use.
    expect(zones.length).toBeGreaterThan(300)
  })

  it('every zone it offers is one Intl will actually accept', () => {
    const bad = allZones().filter((z) => !isValidZone(z.id))
    expect(bad.map((z) => z.id)).toEqual([])
  })

  it('humanises multi-segment ids', () => {
    const zones = allZones()
    // The platform canonicalises Buenos Aires to two segments, so this uses a
    // zone that really does have three.
    const salta = zones.find((z) => z.id === 'America/Argentina/Salta')
    expect(salta?.label).toBe('Salta')
    expect(salta?.region).toBe('America')

    const ba = zones.find((z) => z.id === 'America/Buenos_Aires')
    expect(ba?.label).toBe('Buenos Aires')

    const kolkata = zones.find((z) => z.id === 'Asia/Calcutta' || z.id === 'Asia/Kolkata')
    expect(kolkata?.label).toBe('Kolkata')
    expect(kolkata?.region).toBe('Asia')
  })

  it('shows modern city names for zones the platform still calls by an old one', () => {
    const zones = allZones()
    const cities = new Set(zones.map((z) => z.label))
    // Whichever spelling the host canonicalised to, the displayed name is current.
    for (const stale of ['Calcutta', 'Saigon', 'Katmandu', 'Kiev', 'Rangoon', 'Asmera']) {
      expect(cities.has(stale), `still displaying "${stale}"`).toBe(false)
    }
    expect(cities.has('Kolkata')).toBe(true)
    expect(cities.has('Ho Chi Minh City')).toBe(true)
    expect(cities.has('Kyiv')).toBe(true)
  })

  it('still finds a renamed zone by its historical name', () => {
    expect(matchZones('calcutta').some((z) => z.label === 'Kolkata')).toBe(true)
    expect(matchZones('saigon').some((z) => z.label === 'Ho Chi Minh City')).toBe(true)
    expect(matchZones('kolkata').some((z) => z.label === 'Kolkata')).toBe(true)
  })

  it('has no duplicate ids', () => {
    const ids = allZones().map((z) => z.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('search', () => {
  it('puts a prefix match above a substring match', () => {
    // Arctic/Longyearbyen sorts first by identifier and also starts with "lon";
    // the shorter, fully-accounted-for name has to win.
    expect(matchZones('lon')[0].label).toBe('London')
    expect(matchZones('lon').some((z) => z.label === 'Longyearbyen')).toBe(true)
    // Identifier prefixes work too, which is the point of a timezone-first list.
    expect(matchZones('europe/')[0].id.startsWith('Europe/')).toBe(true)
  })

  it('is sorted by identifier, so regions group the way the database does', () => {
    const ids = allZones().map((z) => z.id)
    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids)
  })

  it('finds a zone by city, by region and by raw id', () => {
    expect(matchZones('karachi').some((z) => z.id === 'Asia/Karachi')).toBe(true)
    expect(matchZones('Asia/Karachi').some((z) => z.id === 'Asia/Karachi')).toBe(true)
    expect(matchZones('pacific').some((z) => z.id.startsWith('Pacific/'))).toBe(true)
  })

  it('is insensitive to case and to underscores', () => {
    expect(matchZones('new_york').some((z) => z.id === 'America/New_York')).toBe(true)
    expect(matchZones('NEW YORK').some((z) => z.id === 'America/New_York')).toBe(true)
  })

  it('returns nothing for a query that matches nothing', () => {
    expect(matchZones('zzzznotacity')).toEqual([])
  })
})

describe('offsets', () => {
  const at = Date.UTC(2025, 6, 1, 12, 0, 0)

  it('covers the whole list', () => {
    const m = zoneOffsets(at)
    expect(m.size).toBeGreaterThan(300)
    expect(m.get('UTC')).toBe(0)
    expect(m.get('Asia/Tokyo')).toBe(9 * 3600_000)
    const kathmandu = m.get('Asia/Katmandu') ?? m.get('Asia/Kathmandu')
    expect(kathmandu).toBe(5.75 * 3600_000)
  })

  it('agrees with the formatter it will be displayed by', () => {
    const m = zoneOffsets(at)
    for (const id of [...m.keys()].filter((k) =>
      /Chatham|New_York|Adelaide|Calcutta|Kolkata|Katmandu|Kathmandu/.test(k),
    )) {
      const shifted = new Date(at + m.get(id)!)
      const viaIntl = formatTime(at, { hour12: false, timeZone: id })
      expect(`${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`)
        .toBe(`${viaIntl.hour}:${viaIntl.minute}`)
    }
  })

  it('follows DST rather than caching a stale answer', () => {
    const winter = zoneOffsets(Date.UTC(2025, 0, 15)).get('America/New_York')
    // Far enough apart that the ten-minute cache cannot serve the first answer.
    const summer = zoneOffsets(Date.UTC(2025, 6, 15)).get('America/New_York')
    expect(winter).toBe(-5 * 3600_000)
    expect(summer).toBe(-4 * 3600_000)
  })

  it('labels the difference from the viewer readably', () => {
    expect(offsetLabel(0)).toBe('same time')
    expect(offsetLabel(4 * 3600_000)).toBe('+4h')
    expect(offsetLabel(-7 * 3600_000)).toBe('-7h')
    expect(offsetLabel(5.5 * 3600_000)).toBe('+5h 30m')
    expect(offsetLabel(-3.5 * 3600_000)).toBe('-3h 30m')
  })
})
