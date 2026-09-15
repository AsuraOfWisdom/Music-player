const { SlashCommandBuilder } = require('discord.js');
const { getManager } = require('../music/GuildMusicManager');
const { formatDuration } = require('../utils/formatDuration');

module.exports = {
  data: new SlashCommandBuilder().setName('queue').setDescription('Show the current queue'),

  async execute(interaction) {
    const manager = getManager(interaction.guildId);
    if (!manager.currentTrack && manager.queue.length === 0) {
      return interaction.reply('The queue is empty.');
    }

    const lines = [];
    if (manager.currentTrack) {
      lines.push(`**Now playing:** ${manager.currentTrack.title} (${formatDuration(manager.currentTrack.duration)})`);
    }

    if (manager.queue.length) {
      lines.push('', '**Up next:**');
      manager.queue.slice(0, 10).forEach((t, i) => {
        lines.push(`${i + 1}. ${t.title} (${formatDuration(t.duration)})`);
      });
      if (manager.queue.length > 10) {
        lines.push(`...and ${manager.queue.length - 10} more.`);
      }
    }

    await interaction.reply(lines.join('\n'));
  },
};
