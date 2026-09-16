const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../config');

// The build (see nixpacks.toml) downloads yt-dlp straight from its GitHub
// releases into /usr/local/bin — call it by that exact path rather than
// relying on Node's PATH lookup, which didn't find it by name at runtime
// even though the binary was confirmed present after a successful build.
// YTDLP_PATH lets that location be overridden if it's ever installed
// somewhere else.
const YTDLP_BIN = process.env.YTDLP_PATH || '/usr/local/bin/yt-dlp';

// Where the build (see nixpacks.toml) unzips the bgutil-ytdlp-pot-provider
// plugin. Passed via --plugin-dirs rather than relying on yt-dlp's default
// plugin search locations (~/.config/yt-dlp/plugins etc.), which depend on
// $HOME/CWD being predictable at runtime — this path is absolute and fixed
// at build time, so it always resolves the same way.
const POT_PLUGIN_DIR = '/opt/yt-dlp-plugins';

// yt-dlp's --cookies flag wants a real Netscape-format cookies file, not
// an inline string, so the base64 env var gets decoded to disk once, on
// first use, and reused for the life of the process.
let cookiesFilePath = null;
let cookiesInitAttempted = false;

function ensureCookiesFile() {
  if (cookiesInitAttempted) return cookiesFilePath;
  cookiesInitAttempted = true;

  if (!config.youtubeCookiesB64) return null;

  try {
    const content = Buffer.from(config.youtubeCookiesB64, 'base64').toString('utf8');
    const filePath = path.join(os.tmpdir(), 'youtube-cookies.txt');
    fs.writeFileSync(filePath, content, { mode: 0o600 });
    cookiesFilePath = filePath;
  } catch (err) {
    console.warn('Could not write YouTube cookies file:', err.message);
  }

  return cookiesFilePath;
}

function baseArgs({ noPlaylist = false } = {}) {
  const args = ['--no-warnings', '--verbose'];
  if (noPlaylist) args.push('--no-playlist');
  const cookiesPath = ensureCookiesFile();
  if (cookiesPath) args.push('--cookies', cookiesPath);
  // YouTube obfuscates the actual media URL behind an "n" parameter and a
  // signature, both of which require running a small piece of YouTube's own
  // JavaScript to decode — yt-dlp calls this its EJS ("embedded JS")
  // challenge solver. Without a JS engine to run that code, formats come
  // back missing or broken pretty much everywhere (this is what a Railway
  // deploy log showed as "JS runtimes: none", right before "n challenge
  // solving failed" / "Signature solving failed" warnings on EVERY client —
  // tv, web, mweb, web_safari — which lines up with formats mysteriously
  // vanishing across the board rather than just on one client).
  //
  // yt-dlp supports using Node.js for this, but — deliberately, since
  // running a website's JS with a full, unsandboxed Node runtime is a real
  // security consideration — it does NOT do so automatically just because
  // Node is present; it has to be told to via --js-runtimes. We already
  // have Node (nixpacks installs it to run this bot itself), so this comes
  // for free: no extra download or package needed, unlike yt-dlp's own
  // preferred option (Deno), which we'd have to install from scratch.
  // Harmless no-op for sites that don't need it.
  args.push('--js-runtimes', 'node');
  // Selects YouTube "player clients" that (for now) aren't requiring a PO
  // Token to actually download audio, not just read metadata. See
  // config.ytPlayerClients for why this is configurable. Harmless no-op
  // for non-YouTube URLs (SoundCloud, etc.) — yt-dlp just ignores an
  // extractor-args block that doesn't apply to the site being used.
  //
  // player_client and formats are combined into one youtube: extractor-args
  // value (';'-separated) rather than two separate --extractor-args flags —
  // both work, but one flag is less to get wrong if this is edited later.
  // See config.ytFormatsArg for what 'formats' is doing here.
  const youtubeExtractorArgs = [];
  if (config.ytPlayerClients) youtubeExtractorArgs.push(`player_client=${config.ytPlayerClients}`);
  if (config.ytFormatsArg) youtubeExtractorArgs.push(`formats=${config.ytFormatsArg}`);
  if (youtubeExtractorArgs.length) {
    args.push('--extractor-args', `youtube:${youtubeExtractorArgs.join(';')}`);
  }
  // Point yt-dlp at the bgutil PO Token provider plugin (see nixpacks.toml
  // and config.potProviderUrl) so it can get a real token instead of
  // relying on client selection alone, which YouTube keeps closing off.
  // Only wired up when a provider URL is actually configured — with no
  // companion service to talk to, loading the plugin would just add a
  // failed network call to every request.
  if (config.potProviderUrl) {
    args.push('--plugin-dirs', POT_PLUGIN_DIR);
    args.push('--extractor-args', `youtubepot-bgutilhttp:base_url=${config.potProviderUrl}`);
  }
  return args;
}

/**
 * Run yt-dlp with --dump-json against a URL or a "ytsearchN:query" target
 * and return the parsed JSON object(s) it printed (one per line).
 *
 * Pass { noPlaylist: true } for anything that should always resolve to a
 * single item (a specific video/track, or a search). Leave it false for
 * a URL that might itself be a playlist/set the caller wants expanded
 * (e.g. a SoundCloud "sets" link) — yt-dlp naturally prints one JSON
 * object per entry in that case.
 */
function dumpJson(target, opts = {}) {
  return new Promise((resolve, reject) => {
    const args = [...baseArgs(opts), '--dump-json', target];
    const child = spawn(YTDLP_BIN, args);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      reject(new Error(`Could not run yt-dlp (is it installed?): ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        // --verbose (see baseArgs) makes yt-dlp print a lot here — which
        // client it tried, whether the PO Token plugin loaded, whether it
        // could reach the provider server, etc. That's exactly what's
        // needed to diagnose PO Token/plugin issues, so log it in full to
        // the Railway deploy log rather than just the one-line summary
        // Discord shows (Discord's message length wouldn't fit it anyway).
        console.error(`[yt-dlp] full output for "${target}":\n${stderr.trim()}`);
        const lastLine = stderr.trim().split('\n').filter(Boolean).pop();
        return reject(new Error(lastLine || `yt-dlp exited with code ${code}`));
      }
      try {
        const results = stdout
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        resolve(results);
      } catch (err) {
        reject(new Error(`Could not parse yt-dlp output: ${err.message}`));
      }
    });
  });
}

/**
 * Get best-quality audio for a URL playable via @discordjs/voice's
 * StreamType.Raw. Returns a Promise for { stream, kill }.
 *
 * CHANGED (Sept 2026): this used to pipe yt-dlp's stdout straight into
 * ffmpeg's stdin live, so playback could start the instant bytes arrived.
 * That's the theoretically faster design, but it turned out to be exactly
 * why some tracks played "Now Playing" with total silence and NOTHING in
 * the log: certain formats (seen from the android/ios player clients,
 * fragmented DASH audio, etc.) don't reassemble correctly when streamed
 * straight through a pipe — yt-dlp can exit 0 having "succeeded" while
 * effectively no usable audio bytes ever cross the pipe. Writing to stdout
 * also quietly disables some of yt-dlp's own postprocessing/fragment
 * handling, since a pipe isn't seekable the way a real file is.
 *
 * This mirrors the approach several other, more battle-tested Discord
 * music bots use (e.g. umutxyp/MusicBot pre-downloads every track to disk
 * before playing it, specifically to avoid this class of bug): download
 * the full track to a real temp file first with yt-dlp, THEN transcode
 * that completed file to raw PCM with ffmpeg. It costs a little startup
 * latency (has to wait for the whole file, typically a few seconds for a
 * song), but sidesteps an entire category of "silently broken pipe"
 * failures, and lets yt-dlp's normal, well-tested file-based download path
 * do the work instead of the less-common stdout path.
 */
async function spawnAudioStream(url) {
  // A unique temp directory per track (rather than a unique filename) so
  // the real output file — whatever extension yt-dlp picks (webm/m4a/opus/
  // mp4 all happen depending on the client/format used) — can just be
  // found afterward by listing the directory, and cleanup is "delete this
  // one directory" rather than tracking an exact filename.
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ytdlp-track-'));
  const cleanupWorkDir = () => { fsp.rm(workDir, { recursive: true, force: true }).catch(() => {}); };

  // Always a single, already-resolved track URL by this point, regardless
  // of source, so playlist expansion is never wanted here.
  const outputTemplate = path.join(workDir, 'audio.%(ext)s');
  const ytArgs = [...baseArgs({ noPlaylist: true }), '-f', 'bestaudio/best', '-o', outputTemplate, url];
  const ytdlp = spawn(YTDLP_BIN, ytArgs, { stdio: ['ignore', 'ignore', 'pipe'] });

  // Bumped from 4000 to 16000 chars — --verbose (see baseArgs) means a lot
  // more diagnostic output per track (client attempts, plugin/PO Token
  // status) than plain error output did, and it's all useful when a track
  // fails to download.
  let ytdlpStderr = '';
  ytdlp.stderr.on('data', (chunk) => { ytdlpStderr = (ytdlpStderr + chunk).slice(-16000); });

  // A real track is at minimum tens of KB of compressed audio. Anything
  // under this, even on a clean exit, means the "download" was effectively
  // empty — the same silent-success failure mode described above, just
  // caught by checking the file yt-dlp produced instead of bytes in a pipe.
  const MIN_SANE_BYTES = 8000;

  return new Promise((resolve, reject) => {
    ytdlp.on('error', (err) => {
      cleanupWorkDir();
      reject(new Error(`Could not run yt-dlp (is it installed?): ${err.message}`));
    });

    ytdlp.on('close', async (code) => {
      if (code !== 0 && code !== null) {
        // Logged in full to the Railway deploy log (see the matching
        // comment in dumpJson above) — this is where PO Token/plugin
        // problems during the actual download step (as opposed to
        // metadata lookup) show up.
        console.error(`[yt-dlp] full output for "${url}":\n${ytdlpStderr.trim()}`);
        const lastLine = ytdlpStderr.trim().split('\n').filter(Boolean).pop();
        cleanupWorkDir();
        return reject(new Error(lastLine || `yt-dlp exited with code ${code}`));
      }

      let files = [];
      try {
        files = await fsp.readdir(workDir);
      } catch (err) {
        cleanupWorkDir();
        return reject(new Error(`Could not read yt-dlp's output directory: ${err.message}`));
      }

      let sizeBytes = 0;
      if (files.length) {
        try {
          sizeBytes = (await fsp.stat(path.join(workDir, files[0]))).size;
        } catch { /* falls through to the size check below */ }
      }

      // Always logged (not just on failure) so a silent/empty "success"
      // shows up in the deploy log instead of leaving nothing to diagnose
      // from.
      console.log(`[yt-dlp] audio download for "${url}" finished: file=${files[0] || '(none)'}, bytes=${sizeBytes}`);

      if (!files.length || sizeBytes < MIN_SANE_BYTES) {
        console.error(`[yt-dlp] full output for "${url}":\n${ytdlpStderr.trim()}`);
        cleanupWorkDir();
        return reject(new Error('yt-dlp produced an empty/near-empty audio file (likely an unusable format from the selected client)'));
      }

      const downloadedPath = path.join(workDir, files[0]);
      const ffmpegArgs = [
        '-loglevel', 'error',
        '-i', downloadedPath,
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
        'pipe:1',
      ];
      const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

      let ffmpegStderr = '';
      ffmpeg.stderr.on('data', (chunk) => { ffmpegStderr = (ffmpegStderr + chunk).slice(-4000); });
      let ffmpegBytes = 0;
      ffmpeg.stdout.on('data', (chunk) => { ffmpegBytes += chunk.length; });

      const fail = (err) => ffmpeg.stdout.destroy(err);
      ffmpeg.on('error', (err) => fail(new Error(`Could not run ffmpeg (is it installed?): ${err.message}`)));
      ffmpeg.on('close', (fcode) => {
        console.log(`[ffmpeg] transcode for "${url}" finished: exit=${fcode}, pcm-bytes=${ffmpegBytes}`);
        if (fcode !== 0 && fcode !== null) {
          const lastLine = ffmpegStderr.trim().split('\n').filter(Boolean).pop();
          fail(new Error(lastLine || `ffmpeg exited with code ${fcode}`));
        }
        // Safe to delete the source file once ffmpeg is done reading it,
        // whether that's a clean finish or an error.
        cleanupWorkDir();
      });

      resolve({
        stream: ffmpeg.stdout,
        kill: () => {
          if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
          cleanupWorkDir();
        },
      });
    });
  });
}

module.exports = { dumpJson, spawnAudioStream, ensureCookiesFile };
