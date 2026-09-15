const { SlashCommandBuilder } = require('discord.js');
const { getManager } = require('../music/GuildMusicManager');

module.exports = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),

  async execute(interaction) {
    const manager = getManager(interaction.guildId);
    if (!manager.currentTrack) {
      return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
    }
    manager.skip();
    await interaction.reply('Skipped.');
  },
};
