const { SlashCommandBuilder } = require('discord.js');
const { getManager } = require('../music/GuildMusicManager');
const { formatDuration } = require('../utils/formatDuration');

module.exports = {
  data: new SlashCommandBuilder().setName('nowplaying').setDescription('Show the currently playing track'),

  async execute(interaction) {
    const manager = getManager(interaction.guildId);
    if (!manager.currentTrack) {
      return interaction.reply('Nothing is playing.');
    }
    const t = manager.currentTrack;
    await interaction.reply(
      `**${t.title}** (${formatDuration(t.duration)}) — requested by ${t.requestedBy} — source: ${t.source}`,
    );
  },
};
