import { Song, User, PopupMessage, MaintenanceState, Playlist, BannerConfig, SongRequest } from '../types';

// Songs start completely empty so the admin can manually upload everything from scratch
export const INITIAL_SONGS: Song[] = [];

export const INITIAL_USERS: User[] = [
  {
    id: 'user-admin',
    username: 'admin',
    role: 'admin',
    isApproved: true,
    createdAt: '2026-09-28T12:00:00.000Z',
  },
  {
    id: 'user-alex',
    username: 'alex_beats',
    role: 'user',
    isApproved: true,
    note: 'Need music for studying math and coding!',
    createdAt: '2026-10-01T09:00:00.000Z',
  },
  {
    id: 'user-pending-1',
    username: 'jordan_ap_chem',
    role: 'user',
    isApproved: false,
    note: 'Requesting account approval for study music and audio streaming.',
    createdAt: '2026-10-03T11:15:00.000Z',
  },
  {
    id: 'user-pending-2',
    username: 'maya_art_room',
    role: 'user',
    isApproved: false,
    note: 'I listen to music while working on my portfolio in 4th period art class. Thanks!',
    createdAt: '2026-10-03T11:45:00.000Z',
  },
];

export const INITIAL_POPUPS: PopupMessage[] = [];

export const INITIAL_MAINTENANCE: MaintenanceState = {
  enabled: false,
  message:
    'Scheduled audio server optimization. Adding fresh tracks for school listening. Please check back shortly!',
  updatedAt: '2026-10-03T12:00:00.000Z',
  hasCountdown: false,
  estimatedFinishTime: null,
};

export const INITIAL_BANNER: BannerConfig = {
  enabled: true,
  versionName: 'v2.5 Liquid Crystal',
  sloganText: 'School Audio Stream Hub',
  colorTheme: 'cyan-violet',
  ribbonEnabled: true,
  ribbonNotice:
    'YouSong Active: All audio streams are uploaded, ad-free, and curated for listening.',
};

export const INITIAL_REQUESTS: SongRequest[] = [
  {
    id: 'req-1',
    songTitle: 'Clair de Lune',
    artist: 'Claude Debussy',
    notes: 'Please upload the gentle piano version for studying in AP English!',
    webLink: 'https://archive.org/details/ClairDeLune_675',
    requestedByUserId: 'user-alex',
    requestedByUsername: 'alex_beats',
    createdAt: '2026-10-03T13:00:00.000Z',
    status: 'pending',
  },
  {
    id: 'req-2',
    songTitle: 'Gymnopédie No. 1',
    artist: 'Erik Satie',
    notes: 'Very quiet piano chords for test prep, no lyrics please.',
    requestedByUserId: 'user-pending-1',
    requestedByUsername: 'jordan_ap_chem',
    createdAt: '2026-10-03T13:30:00.000Z',
    status: 'pending',
  },
];

export const INITIAL_PLAYLISTS: Playlist[] = [];
