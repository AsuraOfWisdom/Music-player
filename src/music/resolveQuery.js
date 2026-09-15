const { resolveYouTube, searchYouTube } = require('./resolvers/youtube');
const { resolveSpotify } = require('./resolvers/spotify');
const { resolveAppleMusic } = require('./resolvers/appleMusic');
const { resolveSoundCloud } = require('./resolvers/soundcloud');

const YOUTUBE_REGEX = /(youtube\.com|youtu\.be)/i;
const SPOTIFY_REGEX = /open\.spotify\.com/i;
const APPLE_MUSIC_REGEX = /music\.apple\.com/i;
const SOUNDCLOUD_REGEX = /soundcloud\.com/i;

/**
 * Classify a /play query and resolve it into an array of track objects.
 * Plain text (no URL) is treated as a YouTube search.
 */
async function resolveQuery(query) {
  const trimmed = query.trim();
  const isUrl = /^https?:\/\//i.test(trimmed);

  if (isUrl) {
    if (YOUTUBE_REGEX.test(trimmed)) return resolveYouTube(trimmed);
    if (SPOTIFY_REGEX.test(trimmed)) return resolveSpotify(trimmed);
    if (APPLE_MUSIC_REGEX.test(trimmed)) return resolveAppleMusic(trimmed);
    if (SOUNDCLOUD_REGEX.test(trimmed)) return resolveSoundCloud(trimmed);
    throw new Error('That link is not from a supported platform (YouTube, Spotify, Apple Music, SoundCloud).');
  }

  return searchYouTube(trimmed, 1);
}

module.exports = { resolveQuery };
