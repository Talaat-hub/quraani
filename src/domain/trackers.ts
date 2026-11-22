export const TRACKERS = ['hifz', 'muraja', 'tilawah'] as const;
export type TrackerId = (typeof TRACKERS)[number];

export const isTrackerId = (s: unknown): s is TrackerId => TRACKERS.includes(s as TrackerId);

/** Memorization and revision are self-rated 0-5; reading is not rated. */
export const isRated = (id: TrackerId) => id !== 'tilawah';
