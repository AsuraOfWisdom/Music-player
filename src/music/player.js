const play = require('play-dl');
const { createAudioResource, StreamType } = require('@discordjs/voice');
const { spawnAudioStream } = require('./ytdlp');
const { searchYouTube } = require('./resolvers/youtube');

/**
 * Turn a track object into a playable @discordjs/voice AudioResource.
 *
 * Returns { resource, cleanup } — cleanup() must be called once this
 * track finishes, errors, or is skipped, so that a yt-dlp child process
 * spawned for it doesn't linger in the background.
 *
 * SoundCloud tracks stream directly through play-dl (unaffected by the
 * YouTube-specific breakage this bot has been fighting). Everything else
 * — direct YouTube links, and YouTube matches found for Spotify/Apple
 * Music tracks (url === null, resolved here via searchYouTube) — streams
 * through yt-dlp, which gets patched against YouTube's changes far more
 * quickly than the old play-dl-based approach did.
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

  if (track.source === 'soundcloud') {
    const stream = await play.stream(playUrl);
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true,
    });
    return { resource, cleanup: () => {} };
  }

  const child = spawnAudioStream(playUrl);
  const resource = createAudioResource(child.stdout, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
  });

  const cleanup = () => {
    if (!child.killed) child.kill('SIGKILL');
  };

  return { resource, cleanup };
}

module.exports = { createResourceForTrack };
