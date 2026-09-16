const { SlashCommandBuilder } = require('discord.js');
const { resolveQuery } = require('../music/resolveQuery');
const { getManager } = require('../music/GuildMusicManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song from YouTube, Spotify, Apple Music, or SoundCloud')
    .addStringOption((opt) =>
      opt
        .setName('query')
        .setDescription('A search term, or a link from YouTube/Spotify/Apple Music/SoundCloud')
        .setRequired(true),
    ),

  async execute(interaction) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({ content: 'Join a voice channel first.', ephemeral: true });
    }

    const query = interaction.options.getString('query', true);
    await interaction.deferReply();

    let tracks;
    try {
      tracks = await resolveQuery(query);
    } catch (err) {
      const reason = typeof err?.message === 'string' && err.message ? err.message : 'An unexpected error occurred.';
      return interaction.editReply(`Couldn't resolve that: ${reason}`);
    }

    if (!tracks.length) {
      return interaction.editReply('No results found.');
    }

    const manager = getManager(interaction.guildId);
    manager.textChannel = interaction.channel;

    if (!manager.connection) {
      manager.connect(voiceChannel);
    }

    manager.enqueue(tracks, interaction.user.tag);

    if (tracks.length === 1) {
      await interaction.editReply(`Queued **${tracks[0].title}**.`);
    } else {
      await interaction.editReply(`Queued **${tracks.length} tracks**.`);
    }
  },
};
