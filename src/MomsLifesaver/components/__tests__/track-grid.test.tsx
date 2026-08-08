/**
 * Tests for components/track-grid.tsx (Batch 7).
 *
 * Guards the FlatList wiring: data padding to a multiple of numColumns,
 * keyExtractor behavior for real items vs placeholders, per-item selection /
 * volume plumbing into TrackCard, defaultVolume fallback when the volumes
 * record is missing an entry, and ListHeaderComponent forwarding.
 *
 * TrackCard is stubbed so the test can read the exact props sent to each tile
 * without rendering the real card.
 */

import React from 'react';
import { FlatList, Text } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('@/components/track-card', () => {
  const { View, Text: RNText } = require('react-native');
  const TrackCard = (props: any) => (
    <View testID={`card-${props.track.id}`}>
      <RNText testID={`card-${props.track.id}-selected`}>
        {String(props.isSelected)}
      </RNText>
      <RNText testID={`card-${props.track.id}-volume`}>
        {String(props.volume)}
      </RNText>
    </View>
  );
  return { TrackCard };
});

import { TrackGrid, type TrackGridProps } from '@/components/track-grid';
import type { TrackId, TrackMetadata } from '@/constants/tracks';

const stubAsset = 1 as unknown as TrackMetadata['audioModule'];

const TRACK_A: TrackMetadata = {
  id: 'kalimba' as TrackId,
  title: 'Kalimba',
  iconModule: stubAsset,
  audioModule: stubAsset,
  defaultVolume: 0.7,
  startTimes: [],
} as TrackMetadata;

const TRACK_B: TrackMetadata = {
  id: 'rain' as TrackId,
  title: 'Rain',
  iconModule: stubAsset,
  audioModule: stubAsset,
  defaultVolume: 0.4,
  startTimes: [],
} as TrackMetadata;

const TRACK_C: TrackMetadata = {
  id: 'sh-sh-sh-sh-sh' as TrackId,
  title: 'Shh',
  iconModule: stubAsset,
  audioModule: stubAsset,
  defaultVolume: 0.6,
  startTimes: [],
} as TrackMetadata;

const TRACK_D: TrackMetadata = {
  id: 'heartbeat' as TrackId,
  title: 'Heartbeat',
  iconModule: stubAsset,
  audioModule: stubAsset,
  defaultVolume: 0.5,
  startTimes: [],
} as TrackMetadata;

const baseProps = (
  overrides: Partial<TrackGridProps> = {},
): TrackGridProps => ({
  data: [TRACK_A, TRACK_B, TRACK_C, TRACK_D],
  selectedTrackIds: [],
  numColumns: 3,
  onTrackPress: jest.fn(),
  onTrackVolumeChange: jest.fn(),
  volumes: {} as Record<TrackId, number>,
  ...overrides,
});

const getFlatListProps = (overrides: Partial<TrackGridProps> = {}) => {
  const { UNSAFE_getByType } = render(<TrackGrid {...baseProps(overrides)} />);
  return UNSAFE_getByType(FlatList).props;
};

describe('TrackGrid data padding', () => {
  it('leaves data unchanged when length is a multiple of numColumns', () => {
    const props = getFlatListProps({
      data: [TRACK_A, TRACK_B, TRACK_C],
      numColumns: 3,
    });
    expect(props.data).toHaveLength(3);
    expect(props.data).toEqual([TRACK_A, TRACK_B, TRACK_C]);
  });

  it('pads with null placeholders up to the next multiple of numColumns', () => {
    const props = getFlatListProps({
      data: [TRACK_A, TRACK_B, TRACK_C, TRACK_D],
      numColumns: 3,
    });
    expect(props.data).toHaveLength(6);
    expect(props.data.slice(0, 4)).toEqual([TRACK_A, TRACK_B, TRACK_C, TRACK_D]);
    expect(props.data.slice(4)).toEqual([null, null]);
  });

  it('adds a single filler when one slot short of a row', () => {
    const props = getFlatListProps({
      data: [TRACK_A, TRACK_B],
      numColumns: 3,
    });
    expect(props.data).toHaveLength(3);
    expect(props.data[2]).toBeNull();
  });
});

describe('TrackGrid keyExtractor', () => {
  it('uses the track id for real items', () => {
    const props = getFlatListProps();
    expect(props.keyExtractor(TRACK_A, 0)).toBe('kalimba');
  });

  it('uses a placeholder-<index> key for null entries', () => {
    const props = getFlatListProps();
    expect(props.keyExtractor(null, 5)).toBe('placeholder-5');
  });
});

describe('TrackGrid renderItem', () => {
  it('renders a TrackCard with the item data for real tracks', () => {
    const onTrackPress = jest.fn();
    const onTrackVolumeChange = jest.fn();
    const props = getFlatListProps({
      selectedTrackIds: ['rain' as TrackId],
      volumes: { rain: 0.91 } as Record<TrackId, number>,
      onTrackPress,
      onTrackVolumeChange,
    });

    const element = props.renderItem({ item: TRACK_B, index: 1 });

    expect(element).not.toBeNull();
    expect(element.props.track).toBe(TRACK_B);
    expect(element.props.isSelected).toBe(true);
    expect(element.props.volume).toBe(0.91);
    expect(element.props.onPress).toBe(onTrackPress);
    expect(element.props.onVolumeChange).toBe(onTrackVolumeChange);
  });

  it('marks unselected tracks as isSelected=false', () => {
    const props = getFlatListProps({
      selectedTrackIds: ['rain' as TrackId],
    });
    const element = props.renderItem({ item: TRACK_A, index: 0 });
    expect(element.props.isSelected).toBe(false);
  });

  it('falls back to track.defaultVolume when volumes has no entry', () => {
    const props = getFlatListProps({
      volumes: {} as Record<TrackId, number>,
    });
    const element = props.renderItem({ item: TRACK_A, index: 0 });
    expect(element.props.volume).toBe(TRACK_A.defaultVolume);
  });

  it('renders a placeholder View for null items', () => {
    const props = getFlatListProps();
    const element = props.renderItem({ item: null, index: 99 });
    expect(element).not.toBeNull();
    expect(element.props.pointerEvents).toBe('none');
  });
});

describe('TrackGrid list configuration', () => {
  it('forwards numColumns to the FlatList', () => {
    const props = getFlatListProps({ numColumns: 2 });
    expect(props.numColumns).toBe(2);
  });

  it('forwards ListHeaderComponent when provided', () => {
    const Header = () => <Text testID="header">header</Text>;
    const props = getFlatListProps({ ListHeaderComponent: Header });
    expect(props.ListHeaderComponent).toBe(Header);
  });

  it('passes undefined ListHeaderComponent when omitted', () => {
    const props = getFlatListProps();
    expect(props.ListHeaderComponent).toBeUndefined();
  });

  it('carries both selectedTrackIds and volumes in extraData', () => {
    // renderItem reads both, so both must invalidate the cells. Selection
    // alone is not enough: with a stable renderItem, a volume change would
    // otherwise leave every slider painted at its old position.
    const selected: TrackId[] = ['rain' as TrackId];
    const volumes = { rain: 0.4 } as unknown as Record<TrackId, number>;

    const props = getFlatListProps({ selectedTrackIds: selected, volumes });

    expect(props.extraData).toEqual({ selectedTrackIds: selected, volumes });
  });

  it('keeps extraData referentially stable when neither input changes', () => {
    const selected: TrackId[] = ['rain' as TrackId];
    const volumes = { rain: 0.4 } as unknown as Record<TrackId, number>;
    const props = { selectedTrackIds: selected, volumes };

    const view = render(<TrackGrid {...baseProps()} {...props} />);
    const first = view.UNSAFE_getByType(FlatList).props.extraData;
    view.rerender(<TrackGrid {...baseProps()} {...props} />);
    const second = view.UNSAFE_getByType(FlatList).props.extraData;

    // A fresh object every render would make extraData meaningless and
    // re-render every cell unconditionally.
    expect(second).toBe(first);
  });
});
