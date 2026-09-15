const { SlashCommandBuilder } = require('discord.js');
const { getManager } = require('../music/GuildMusicManager');

module.exports = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause playback'),

  async execute(interaction) {
    const manager = getManager(interaction.guildId);
    const ok = manager.pause();
    await interaction.reply(ok ? 'Paused.' : 'Nothing to pause.');
  },
};
