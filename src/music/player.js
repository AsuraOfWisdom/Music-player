const play = require('play-dl');
const { createAudioResource } = require('@discordjs/voice');
const { searchYouTube } = require('./resolvers/youtube');

/**
 * Turn a track object into a playable @discordjs/voice AudioResource.
 *
 * Tracks from YouTube/SoundCloud already carry a playable `url`. Tracks
 * from Spotify/Apple Music are metadata-only (url === null) — for those
 * we search YouTube right here, at play time, for the closest match.
 * Doing this lazily (instead of up front when queuing) keeps big
 * playlists fast to queue and avoids burning YouTube search quota on
 * tracks that might get skipped anyway.
 */
async function createResourceForTrack(track) {
  let playUrl = track.url;

  if (!playUrl) {
    const results = await searchYouTube(track.searchQuery || track.title, 1);
    if (!results.length) {
      throw new Error(`no playable match found for "${track.title}"`);
    }
    playUrl = results[0].url;
    if (!track.duration) track.duration = results[0].duration;
  }

  const stream = await play.stream(playUrl);

  return createAudioResource(stream.stream, {
    inputType: stream.type,
    inlineVolume: true,
  });
}

module.exports = { createResourceForTrack };
