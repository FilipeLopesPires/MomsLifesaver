import KalimbaIcon from '../assets/icons/kalimba.png';
import RainIcon from '../assets/icons/rain.png';
import RiverIcon from '../assets/icons/river.png';
import WaterfallIcon from '../assets/icons/waterfall.png';
import HeartIcon from '../assets/icons/heart.png';
import ShushIcon from '../assets/icons/shush.png';

import KalimbaAudio from '../assets/audio/kalimba.m4a';
import RainAudio from '../assets/audio/rain.mp3';
import WaterStreamSoftAudio from '../assets/audio/water stream soft.mp3';
import WaterStreamIntenseAudio from '../assets/audio/water stream intense.mp3';
import HeartbeatAudio from '../assets/audio/heartbeat.mp3';
import ShShShAudio from '../assets/audio/sh sh sh.mp3';
import ShShShShShAudio from '../assets/audio/sh sh sh sh sh.mp3';

export type TrackId =
  | 'kalimba'
  | 'rain'
  | 'water-stream-soft'
  | 'water-stream-intense'
  | 'heartbeat'
  | 'sh-sh-sh'
  | 'sh-sh-sh-sh-sh';

export type TrackMetadata = {
  id: TrackId;
  title: string;
  /**
   * Local static resource handled by Metro bundler.
   */
  audioModule: number;
  iconModule: number;
  /**
   * Recommended starting volume (0-1). All tracks default to 1 for now.
   */
  defaultVolume: number;
  startTimes: string[];
};

export const TRACK_LIBRARY: ReadonlyArray<TrackMetadata> = [
  {
    id: 'kalimba',
    title: 'Kalimba',
    audioModule: KalimbaAudio,
    iconModule: KalimbaIcon,
    defaultVolume: 1,
    startTimes: ["00:22", "01:48", "05:35", "09:11", "11:54", "13:48", "15:38", "17:49", "20:18", "22:30", "24:01", "26:04", "28:06", "31:06", "34:53", "37:02", "39:39", "41:51", "43:20"],
  },
  
  {
    id: 'rain',
    title: 'Rain',
    audioModule: RainAudio,
    iconModule: RainIcon,
    defaultVolume: 1,
    startTimes: [],
  },
  {
    id: 'water-stream-soft',
    title: 'Water Stream (Soft)',
    audioModule: WaterStreamSoftAudio,
    iconModule: RiverIcon,
    defaultVolume: 1,
    startTimes: [],
  },
  {
    id: 'water-stream-intense',
    title: 'Water Stream (Intense)',
    audioModule: WaterStreamIntenseAudio,
    iconModule: WaterfallIcon,
    defaultVolume: 1,
    startTimes: [],
  },
  {
    id: 'heartbeat',
    title: 'Heartbeat',
    audioModule: HeartbeatAudio,
    iconModule: HeartIcon,
    defaultVolume: 1,
    startTimes: [],
  },
  {
    id: 'sh-sh-sh',
    title: 'Shush (x3)',
    audioModule: ShShShAudio,
    iconModule: ShushIcon,
    defaultVolume: 1,
    startTimes: [],
  },
  {
    id: 'sh-sh-sh-sh-sh',
    title: 'Shush (x5)',
    audioModule: ShShShShShAudio,
    iconModule: ShushIcon,
    defaultVolume: 1,
    startTimes: [],
  },
];

export const TRACK_MAP: Record<TrackId, TrackMetadata> = TRACK_LIBRARY.reduce(
  (accumulator, track) => {
    return {
      ...accumulator,
      [track.id]: track,
    };
  },
  {} as Record<TrackId, TrackMetadata>,
);

