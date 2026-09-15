const { createAudioResource, StreamType } = require('@discordjs/voice');
const { spawnAudioStream } = require('./ytdlp');
const { searchYouTube } = require('./resolvers/youtube');

/**
 * Turn a track object into a playable @discordjs/voice AudioResource.
 *
 * Returns { resource, cleanup } — cleanup() must be called once this
 * track finishes, errors, or is skipped, so that the yt-dlp child
 * process spawned for it doesn't linger in the background.
 *
 * Every source streams through yt-dlp (it natively supports both
 * YouTube and SoundCloud). Spotify/Apple Music tracks arrive here with
 * url === null (metadata only) and get resolved to a YouTube match via
 * searchYouTube first.
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
