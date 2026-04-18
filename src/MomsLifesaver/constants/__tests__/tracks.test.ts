/**
 * Invariants for the track library.
 *
 * These tests guard against silent data bugs that are easy to introduce when
 * editing `constants/tracks.ts` by hand: duplicate ids, missing assets,
 * malformed start times, or drift between `TrackId`, `TRACK_LIBRARY` and
 * `TRACK_MAP`.
 */

import { TRACK_LIBRARY, TRACK_MAP, type TrackId } from '../tracks';
import { parseStartTime } from '../../utils/start-time';

// Hand-maintained reference for the TrackId union declared in tracks.ts.
// Keep in sync with the union; the "matches TrackId union" test below fails
// loudly if TRACK_LIBRARY drifts from this list.
const EXPECTED_TRACK_IDS: ReadonlyArray<TrackId> = [
  'kalimba',
  'rain',
  'water-stream-soft',
  'water-stream-intense',
  'heartbeat',
  'sh-sh-sh',
  'sh-sh-sh-sh-sh',
];

describe('TRACK_LIBRARY', () => {
  it('has unique ids', () => {
    const ids = TRACK_LIBRARY.map((track) => track.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('matches the TrackId union exactly', () => {
    const actual = TRACK_LIBRARY.map((track) => track.id).sort();
    const expected = [...EXPECTED_TRACK_IDS].sort();
    expect(actual).toEqual(expected);
  });

  it.each(EXPECTED_TRACK_IDS)(
    'track "%s" has truthy audioModule and iconModule',
    (id) => {
      const track = TRACK_LIBRARY.find((candidate) => candidate.id === id);
      expect(track).toBeDefined();
      expect(track!.audioModule).toBeTruthy();
      expect(track!.iconModule).toBeTruthy();
    },
  );

  it.each(EXPECTED_TRACK_IDS)(
    'track "%s" has defaultVolume in [0, 1]',
    (id) => {
      const track = TRACK_LIBRARY.find((candidate) => candidate.id === id)!;
      expect(typeof track.defaultVolume).toBe('number');
      expect(track.defaultVolume).toBeGreaterThanOrEqual(0);
      expect(track.defaultVolume).toBeLessThanOrEqual(1);
    },
  );

  it('every startTimes entry is a well-formed MM:SS string', () => {
    for (const track of TRACK_LIBRARY) {
      for (const entry of track.startTimes) {
        expect(parseStartTime(entry)).not.toBeNull();
      }
    }
  });

  it('has a non-empty title for every track', () => {
    for (const track of TRACK_LIBRARY) {
      expect(typeof track.title).toBe('string');
      expect(track.title.length).toBeGreaterThan(0);
    }
  });
});

describe('TRACK_MAP', () => {
  it('has the same size as TRACK_LIBRARY', () => {
    expect(Object.keys(TRACK_MAP)).toHaveLength(TRACK_LIBRARY.length);
  });

  it('has the same ids as TRACK_LIBRARY', () => {
    const mapIds = Object.keys(TRACK_MAP).sort();
    const libraryIds = TRACK_LIBRARY.map((track) => track.id).sort();
    expect(mapIds).toEqual(libraryIds);
  });

  it.each(EXPECTED_TRACK_IDS)('entry "%s" round-trips the id', (id) => {
    expect(TRACK_MAP[id]).toBeDefined();
    expect(TRACK_MAP[id].id).toBe(id);
  });

  it('points at the same metadata object as TRACK_LIBRARY', () => {
    for (const track of TRACK_LIBRARY) {
      expect(TRACK_MAP[track.id]).toBe(track);
    }
  });
});
