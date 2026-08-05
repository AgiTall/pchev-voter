import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes
} from 'discord.js';
import { commands } from './command.js';
import { formatDuration, parseDuration } from './duration.js';
import { loadEmojiConfig } from './emoji-config.js';
import { collectHumanSeats } from './member-seats.js';
import { ParliamentRenderer } from './parliament-renderer.js';
import { VoteService } from './vote-service.js';
import { VoteStore } from './vote-store.js';
import { CHOICES } from './vote-ui.js';

const MIN_DURATION = 60_000;
const MAX_DURATION = 30 * 86_400_000;
const BUTTON_PATTERN = /^vote:(for|abstain|against|veto|choice[1-5]):([0-9a-f-]{36})$/;

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error('Заполните DISCORD_TOKEN и CLIENT_ID в файле .env');
  process.exit(1);
}

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
await loadEmojiConfig(path.resolve(currentDirectory, '../config/emojis.json'));
const dataDirectory = process.env.VOTE_DATA_DIR
  ? path.resolve(process.env.VOTE_DATA_DIR)
  : path.resolve(currentDirectory, '../data');
const store = new VoteStore(path.join(dataDirectory, 'votes.json'));
await store.load();
const seedFilePath = process.env.VOTE_SEED_FILE;
if (seedFilePath) {
  const imported = await store.importMissing(path.resolve(seedFilePath));
  if (imported > 0) {
    console.log(`Импортировано голосований из резервного файла: ${imported}.`);
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});
const renderer = new ParliamentRenderer(
  path.resolve(currentDirectory, '../assets/parliament-background.png')
);
const voteService = new VoteService(client, store, renderer);

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body: commands });
  console.log(
    guildId
      ? `Slash-команда зарегистрирована на сервере ${guildId}.`
      : 'Slash-команда зарегистрирована глобально.'
  );
}

async function respondWithError(interaction, message) {
  const response = { content: message, flags: MessageFlags.Ephemeral };
  if (interaction.isButton() && (interaction.replied || interaction.deferred)) {
    await interaction.followUp(response);
  } else if (interaction.deferred && !interaction.replied) {
    await interaction.editReply({ content: message, embeds: [], components: [], files: [] });
  } else if (interaction.replied) {
    await interaction.followUp(response);
  } else {
    await interaction.reply(response);
  }
}

async function handleSetVote(interaction) {
  if (!interaction.inGuild() || !interaction.channel?.isTextBased()) {
    await respondWithError(interaction, 'Голосование можно создать только в канале сервера.');
    return;
  }

  const durationInput = interaction.options.getString('duration', true);
  const durationMs = parseDuration(durationInput);

  if (!durationMs || durationMs < MIN_DURATION || durationMs > MAX_DURATION) {
    await respondWithError(
      interaction,
      'Укажите время от 1 минуты до 30 дней. Примеры: `30m`, `2h`, `1 день`, `1h 30m`.'
    );
    return;
  }

  const candidate = interaction.options.getUser('candidate', true);
  if (candidate.bot) {
    await respondWithError(interaction, 'Кандидатом должен быть пользователь, а не бот.');
    return;
  }

  await interaction.deferReply();

  let seats;
  try {
    seats = await collectHumanSeats(interaction.guild);
  } catch (error) {
    console.error('Не удалось получить участников сервера:', error);
    await respondWithError(
      interaction,
      'Не удалось получить участников. Включите **Server Members Intent** на странице Developer Portal → Bot.'
    );
    return;
  }

  const vote = voteService.makeVote({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    creatorId: interaction.user.id,
    title: interaction.options.getString('title', true),
    description: interaction.options.getString('description', true),
    pros: interaction.options.getString('pros', true),
    cons: interaction.options.getString('cons', true),
    durationMs,
    seats,
    candidateId: candidate.id,
    type: 'binary'
  });

  await voteService.create(vote);

  try {
    await interaction.editReply(await voteService.buildMessage(vote, true));
    const message = await interaction.fetchReply();
    await voteService.attachMessage(vote, message.id);
    console.log(
      `Создано голосование ${vote.id} на ${formatDuration(durationMs)} пользователем ${interaction.user.tag}.`
    );
  } catch (error) {
    await voteService.remove(vote.id);
    throw error;
  }
}

async function handleSetMultiVote(interaction) {
  if (!interaction.inGuild() || !interaction.channel?.isTextBased()) {
    await respondWithError(interaction, 'Голосование можно создать только в канале сервера.');
    return;
  }

  const durationInput = interaction.options.getString('duration', true);
  const durationMs = parseDuration(durationInput);
  if (!durationMs || durationMs < MIN_DURATION || durationMs > MAX_DURATION) {
    await respondWithError(
      interaction,
      'Укажите время от 1 минуты до 30 дней. Примеры: `30m`, `2h`, `1 день`, `1h 30m`.'
    );
    return;
  }

  const labels = Array.from({ length: 5 }, (_, index) =>
    interaction.options.getString(`choice-${index + 1}`)
  )
    .filter(Boolean)
    .map((label) => label.trim());

  if (labels.length === 0) {
    await respondWithError(interaction, 'Добавьте хотя бы один вариант ответа.');
    return;
  }

  const uniqueLabels = new Set(labels.map((label) => label.toLocaleLowerCase('ru')));
  if (uniqueLabels.size !== labels.length) {
    await respondWithError(interaction, 'Варианты ответа не должны повторяться.');
    return;
  }

  await interaction.deferReply();

  let seats;
  try {
    seats = await collectHumanSeats(interaction.guild);
  } catch (error) {
    console.error('Не удалось получить участников сервера:', error);
    await respondWithError(
      interaction,
      'Не удалось получить участников. Включите **Server Members Intent** на странице Developer Portal → Bot.'
    );
    return;
  }

  const options = labels.map((label, index) => ({
    id: `choice${index + 1}`,
    emojiKey: `choice${index + 1}`,
    label
  }));
  const vote = voteService.makeVote({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    creatorId: interaction.user.id,
    title: interaction.options.getString('title', true),
    description: interaction.options.getString('description', true),
    durationMs,
    seats,
    type: 'multiple',
    options
  });

  await voteService.create(vote);

  try {
    await interaction.editReply(await voteService.buildMessage(vote, true));
    const message = await interaction.fetchReply();
    await voteService.attachMessage(vote, message.id);
    console.log(
      `Создано голосование с ${options.length} вариантами ${vote.id} на ${formatDuration(durationMs)}.`
    );
  } catch (error) {
    await voteService.remove(vote.id);
    throw error;
  }
}

async function handleVoteButton(interaction) {
  const match = interaction.customId.match(BUTTON_PATTERN);
  if (!match) return;

  const [, choice, voteId] = match;
  const vote = store.get(voteId);

  if (!vote || vote.messageId !== interaction.message.id) {
    await respondWithError(interaction, 'Это голосование больше не найдено.');
    return;
  }

  const validChoice =
    vote.type === 'multiple'
      ? vote.options?.some((option) => option.id === choice)
      : Object.values(CHOICES).includes(choice);
  if (!validChoice) {
    await respondWithError(interaction, 'Этот вариант ответа больше недоступен.');
    return;
  }

  if (vote.status !== 'active' || Date.now() >= vote.endsAt) {
    if (vote.status === 'active') void voteService.close(vote.id);
    await respondWithError(interaction, 'Голосование уже завершено.');
    return;
  }

  if (
    choice === CHOICES.VETO &&
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  ) {
    await respondWithError(interaction, 'Право вето доступно только администраторам сервера.');
    return;
  }

  await interaction.deferUpdate();
  const accepted = await voteService.runExclusive(vote.id, async () => {
    if (vote.status !== 'active' || Date.now() >= vote.endsAt) return false;
    await voteService.cast(vote, interaction.user.id, choice);
    await interaction.editReply(await voteService.buildMessage(vote, true));
    return true;
  });

  if (!accepted) {
    if (vote.status === 'active') void voteService.close(vote.id);
    await respondWithError(interaction, 'Голосование уже завершено.');
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Бот запущен как ${readyClient.user.tag}.`);
  await voteService.restore();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'set-vote') {
      await handleSetVote(interaction);
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'set-multi-vote') {
      await handleSetMultiVote(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('vote:')) {
      await handleVoteButton(interaction);
    }
  } catch (error) {
    console.error('Ошибка обработки взаимодействия:', error);
    try {
      await respondWithError(interaction, 'Не удалось выполнить действие. Попробуйте ещё раз.');
    } catch (responseError) {
      console.error('Не удалось отправить сообщение об ошибке:', responseError);
    }
  }
});

process.on('unhandledRejection', (error) => {
  console.error('Необработанная ошибка:', error);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Получен ${signal}. Сохраняю данные и отключаю бота...`);

  try {
    await voteService.shutdown();
    await store.flush();
    client.destroy();
    console.log('Бот корректно остановлен.');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка при остановке бота:', error);
    process.exit(1);
  }
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

try {
  await registerCommands();
  await client.login(token);
} catch (error) {
  console.error('Не удалось запустить бота:', error);
  process.exit(1);
}
