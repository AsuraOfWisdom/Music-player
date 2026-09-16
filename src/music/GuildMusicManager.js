const {
  joinVoiceChannel,
  createAudioPlayer,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const { createResourceForTrack } = require('./player');

const LOOP_MODES = { OFF: 'off', TRACK: 'track', QUEUE: 'queue' };
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // leave voice after 5 min of nothing to play

const managers = new Map();

class GuildMusicManager {
  constructor(guildId) {
    this.guildId = guildId;
    this.queue = [];
    this.currentTrack = null;
    this.connection = null;
    this.player = createAudioPlayer();
    this.textChannel = null;
    this.loopMode = LOOP_MODES.OFF;
    this.volume = 100;
    this.idleTimer = null;
    this._currentCleanup = null; // kills the previous track's yt-dlp process, if any

    // Logged unconditionally (not just on error) so the deploy log shows
    // what actually happened even when nothing throws — e.g. a track that
    // "plays" but is silent still fires Idle almost immediately once
    // @discordjs/voice runs out of audio data, which is a useful signal on
    // its own even with no accompanying error.
    this.player.on(AudioPlayerStatus.Playing, () => {
      console.log(`[music:${this.guildId}] player status -> Playing (${this.currentTrack?.title ?? 'unknown track'})`);
    });
    this.player.on(AudioPlayerStatus.Idle, () => {
      console.log(`[music:${this.guildId}] player status -> Idle`);
      this._playNext();
    });
    this.player.on('error', (error) => {
      console.error(`[music:${this.guildId}] player error:`, error.message);
      this._playNext();
    });
  }

  connect(voiceChannel) {
    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
      // Turns on @discordjs/voice's own internal 'debug' event, which
      // includes a '[NW]' (networking)-prefixed play-by-play of the actual
      // UDP layer: socket creation, the IP discovery packet being sent,
      // whether/when a response comes back, keepalives, etc. Plain
      // VoiceConnectionStatus transitions (logged below) only show the
      // high-level state, not what's actually happening on the wire — and
      // since a prior test showed the connection stuck at "connecting" for
      // both YouTube and SoundCloud audio alike, with no thrown error, the
      // failure is somewhere inside that UDP handshake. This is the only
      // way to see whether the discovery packet is even being sent, versus
      // sent-but-no-response (pointing at Railway's outbound UDP/NAT),
      // versus something else entirely.
      debug: true,
    });
    const subscription = this.connection.subscribe(this.player);
    console.log(`[music:${this.guildId}] connection.subscribe() ${subscription ? 'succeeded' : 'FAILED (returned undefined)'}`);

    this.connection.on('debug', (message) => {
      console.log(`[music:${this.guildId}] voice debug: ${message}`);
    });

    // The 'debug' event above never actually surfaces the real reason the
    // voice WebSocket closes — @discordjs/voice's own Networking class
    // reads the numeric WebSocket close code internally (it decides
    // whether to attempt a resume based on it) but doesn't log it anywhere
    // public. Two tests in a row showed the connection reach "Hello" and
    // then die immediately, before ever getting to Ready/UDP, on two
    // completely different Discord voice servers (Sydney and Ashburn,
    // different ports) — which means it isn't a regional routing problem,
    // and the actual WebSocket close code is the one piece of information
    // that would say WHY (e.g. 4006 session no longer valid, 4009 session
    // timeout, 4014 disconnected, vs. something on our end). This reaches
    // into the connection's internal networking object — not official
    // public API, so it may need updating if @discordjs/voice's internals
    // change — specifically to get at that code.
    this.connection.on('stateChange', (oldState, newState) => {
      if (newState.networking && newState.networking !== oldState.networking) {
        newState.networking.on('close', (code) => {
          console.log(`[music:${this.guildId}] voice websocket closed with code: ${code}`);
        });
      }
    });

    // Logs every stage of the connection handshake, including the UDP
    // "IP discovery" step that establishes where to actually send audio
    // packets. This is specifically to catch a known failure mode on some
    // cloud hosts (Railway included — see e.g. the open Railway Station
    // thread "Discord voice UDP connections failing") where the bot can
    // look completely healthy — joins the channel, resource downloads and
    // "plays" fine, no thrown error anywhere — while the underlying UDP
    // path to Discord's voice server never actually completes or silently
    // stops delivering packets after the initial handshake. If that's what
    // this is, the connection will either never reach Ready, or will emit
    // an 'error' here (e.g. "Cannot perform IP discovery - socket closed").
    for (const status of Object.values(VoiceConnectionStatus)) {
      this.connection.on(status, () => {
        console.log(`[music:${this.guildId}] voice connection -> ${status}`);
      });
    }
    this.connection.on('error', (error) => {
      console.error(`[music:${this.guildId}] voice connection error:`, error);
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // A brief network hiccup looks the same as being kicked; give it
        // a few seconds to reconnect before tearing everything down.
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.destroy();
      }
    });
  }

  enqueue(tracks, requestedBy) {
    for (const t of tracks) this.queue.push({ ...t, requestedBy });
    this._clearIdleTimer();

    if (!this.currentTrack && this.player.state.status !== AudioPlayerStatus.Playing) {
      this._playNext();
    }
  }

  async _playNext() {
    // The previous track (if any) is done, being skipped, or errored —
    // make sure its yt-dlp process (if it had one) actually exits.
    if (this._currentCleanup) {
      try { this._currentCleanup(); } catch { /* already gone */ }
      this._currentCleanup = null;
    }

    if (this.loopMode === LOOP_MODES.TRACK && this.currentTrack) {
      this.queue.unshift(this.currentTrack);
    } else if (this.loopMode === LOOP_MODES.QUEUE && this.currentTrack) {
      this.queue.push(this.currentTrack);
    }

    const next = this.queue.shift();
    if (!next) {
      this.currentTrack = null;
      this._startIdleTimer();
      return;
    }

    try {
      const { resource, cleanup } = await createResourceForTrack(next);
      this._currentCleanup = cleanup;
      resource.volume?.setVolume(this.volume / 100);
      this.currentTrack = next;
      this.player.play(resource);
      this._announce(`Now playing: **${next.title}**`);
    } catch (err) {
      console.error(`[music:${this.guildId}] failed to play "${next.title}":`, err.message);
      this._announce(`Skipping **${next.title}** — couldn't load it (${err.message}).`);
      this._playNext();
    }
  }

  _announce(message) {
    if (this.textChannel) {
      this.textChannel.send(message).catch(() => {});
    }
  }

  skip() {
    // Force-stopping the player fires the Idle handler, which advances the queue.
    this.player.stop(true);
  }

  stop() {
    this.queue = [];
    this.loopMode = LOOP_MODES.OFF;
    this.player.stop(true);
  }

  pause() {
    return this.player.pause();
  }

  resume() {
    return this.player.unpause();
  }

  setVolume(vol) {
    this.volume = vol;
    const resource = this.player.state.resource;
    if (resource?.volume) resource.volume.setVolume(vol / 100);
  }

  setLoop(mode) {
    this.loopMode = mode;
  }

  _startIdleTimer() {
    this._clearIdleTimer();
    this.idleTimer = setTimeout(() => this.destroy(), IDLE_TIMEOUT_MS);
  }

  _clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  destroy() {
    this._clearIdleTimer();
    this.queue = [];
    this.currentTrack = null;
    if (this._currentCleanup) {
      try { this._currentCleanup(); } catch { /* already gone */ }
      this._currentCleanup = null;
    }
    try {
      this.player.stop(true);
      this.connection?.destroy();
    } catch {
      // connection may already be gone
    }
    managers.delete(this.guildId);
  }
}

function getManager(guildId) {
  let manager = managers.get(guildId);
  if (!manager) {
    manager = new GuildMusicManager(guildId);
    managers.set(guildId, manager);
  }
  return manager;
}

module.exports = { getManager, LOOP_MODES };
