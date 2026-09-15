const { SlashCommandBuilder } = require('discord.js');
const { getManager } = require('../music/GuildMusicManager');

module.exports = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume playback'),

  async execute(interaction) {
    const manager = getManager(interaction.guildId);
    const ok = manager.resume();
    await interaction.reply(ok ? 'Resumed.' : 'Nothing to resume.');
  },
};
