import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder
} from 'discord.js';
import { formatDuration } from './duration.js';
import { DEFAULT_PARTY_EMOJI } from './party-emoji.js';

export const POLITICS_COLOR = 0x102c4d;

export const POLITICS_IDS = Object.freeze({
  PARTY_SELECT: 'politics:party:select',
  PARTY_CREATE: 'politics:party:create',
  PARTY_JOIN: 'politics:party:join',
  PARTY_LEAVE: 'politics:party:leave',
  PARTY_CABINET: 'politics:party:cabinet',
  PARTY_EMOJI: 'politics:party:emoji',
  PARTY_BACK: 'politics:party:back',
  PARTY_CREATE_MODAL: 'politics:modal:create-party',
  PARTY_EMOJI_MODAL: 'politics:modal:party-emoji',
  ELECTION_SELECT: 'politics:election:select',
  ELECTION_VOTE: 'politics:election:vote',
  ELECTION_RESULTS: 'politics:election:results',
  ROYAL_START: 'politics:royal:start',
  ROYAL_FINISH: 'politics:royal:finish',
  ROYAL_IMPEACH: 'politics:royal:impeach',
  ROYAL_SETTINGS: 'politics:royal:settings',
  ROYAL_SETTINGS_MODAL: 'politics:modal:settings',
  CABINET_MEMBER: 'politics:cabinet:member',
  CABINET_ASSIGN: 'politics:cabinet:assign',
  CABINET_REMOVE: 'politics:cabinet:remove',
  CABINET_BACK: 'politics:cabinet:back'
});

const truncate = (value, maxLength) => {
  const source = String(value ?? '');
  return source.length <= maxLength ? source : `${source.slice(0, maxLength - 1)}…`;
};

const partyEmoji = (party) => party?.emoji || DEFAULT_PARTY_EMOJI;

export function findUserParty(state, userId) {
  return state.parties.find((party) => party.members.includes(userId)) ?? null;
}

export function countElectionBallots(state) {
  const counts = Object.fromEntries(state.parties.map((party) => [party.id, 0]));
  let total = 0;
  for (const partyId of Object.values(state.election.ballots ?? {})) {
    if (!(partyId in counts)) continue;
    counts[partyId] += 1;
    total += 1;
  }
  return { counts, total };
}

export function getElectionOutcome(state) {
  const { counts, total } = countElectionBallots(state);
  if (total === 0) return { type: 'no_votes', winners: [], counts, total };

  const maximum = Math.max(...Object.values(counts));
  const winners = state.parties.filter((party) => counts[party.id] === maximum);
  return {
    type: winners.length === 1 ? 'winner' : 'tie',
    winners,
    winner: winners.length === 1 ? winners[0] : null,
    counts,
    total
  };
}

function partyOptions(state, selectedPartyId) {
  return state.parties.map((party) => ({
    label: truncate(party.name, 100),
    description: truncate(`${party.members.length} участн. · лидер в составе`, 100),
    emoji: partyEmoji(party),
    value: party.id,
    default: party.id === selectedPartyId
  }));
}

function electionStatusText(state) {
  if (state.election.status === 'active') {
    return `🟢 Голосование идёт до <t:${Math.floor(state.election.endsAt / 1000)}:F> ` +
      `(<t:${Math.floor(state.election.endsAt / 1000)}:R>)`;
  }
  if (state.election.status === 'completed') return '⚪ Последние выборы завершены';
  return '⚪ Выборы не запущены';
}

export function buildPartiesMessage(state, userId, { selectedPartyId, notice } = {}) {
  const membership = findUserParty(state, userId);
  const selected = state.parties.find((party) => party.id === selectedPartyId) ?? null;
  const memberCount = new Set(state.parties.flatMap((party) => party.members)).size;
  const partyList = state.parties.length
    ? state.parties
      .map((party, index) => `${index + 1}. ${partyEmoji(party)} **${truncate(party.name, 70)}** — ${party.members.length} участн.`)
      .join('\n')
    : 'Пока не создано ни одной партии.';

  const embed = new EmbedBuilder()
    .setColor(POLITICS_COLOR)
    .setTitle('🏛️ Партийная система сервера')
    .setDescription(
      `${electionStatusText(state)}\n\n` +
      `**Партий:** ${state.parties.length} · **Участников:** ${memberCount}\n` +
      `**Ваша партия:** ${membership ? `${partyEmoji(membership)} ${membership.name}` : 'нет'}\n` +
      `**Создание партии:** ${state.settings.partyCreationCost || 'бесплатно'}\n\n` +
      truncate(partyList, 2_500)
    )
    .setFooter({ text: 'Выберите партию, затем используйте кнопки ниже' });

  if (selected) {
    const members = selected.members.map((id) => `<@${id}>`).join(', ');
    embed.addFields(
      {
        name: `${partyEmoji(selected)} ${truncate(selected.name, 240)}`,
        value: truncate(selected.description || 'Описание не указано.', 1_024)
      },
      { name: 'Лидер', value: `<@${selected.leaderId}>`, inline: true },
      { name: `Состав · ${selected.members.length}`, value: truncate(members, 1_024) }
    );
  }

  const components = [];
  if (state.parties.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(POLITICS_IDS.PARTY_SELECT)
          .setPlaceholder('Выберите партию для просмотра')
          .addOptions(partyOptions(state, selected?.id))
      )
    );
  }

  const electionActive = state.election.status === 'active';
  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(POLITICS_IDS.PARTY_CREATE)
        .setLabel('Создать партию')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Success)
        .setDisabled(Boolean(membership) || state.parties.length >= 25 || electionActive),
      new ButtonBuilder()
        .setCustomId(POLITICS_IDS.PARTY_JOIN)
        .setLabel('Вступить')
        .setEmoji('🤝')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(Boolean(membership) || !selected || electionActive),
      new ButtonBuilder()
        .setCustomId(POLITICS_IDS.PARTY_LEAVE)
        .setLabel('Выйти')
        .setEmoji('🚪')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!membership || electionActive),
      new ButtonBuilder()
        .setCustomId(POLITICS_IDS.PARTY_CABINET)
        .setLabel('Кабинет')
        .setEmoji('👑')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(POLITICS_IDS.PARTY_EMOJI)
        .setLabel('Лого')
        .setEmoji('🎨')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!membership || membership.leaderId !== userId)
    )
  );

  return {
    content: notice ?? null,
    embeds: [embed],
    components,
    allowedMentions: { parse: [] }
  };
}

export function buildCreatePartyModal() {
  return new ModalBuilder()
    .setCustomId(POLITICS_IDS.PARTY_CREATE_MODAL)
    .setTitle('Создание партии')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Название партии')
          .setPlaceholder('Например: Партия прогресса')
          .setStyle(TextInputStyle.Short)
          .setMinLength(2)
          .setMaxLength(80)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('emoji')
          .setLabel('Эмодзи сервера или обычное')
          .setPlaceholder('Эмодзи, :name:, name или ID')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Официальный слоган / описание')
          .setPlaceholder('Кратко расскажите о целях партии')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(2)
          .setMaxLength(1_000)
          .setRequired(true)
      )
    );
}

export function buildPartyEmojiModal(party) {
  return new ModalBuilder()
    .setCustomId(POLITICS_IDS.PARTY_EMOJI_MODAL)
    .setTitle('Логотип партии')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('emoji')
          .setLabel('Эмодзи сервера или обычное')
          .setPlaceholder('Эмодзи, :name:, name или ID')
          .setValue(partyEmoji(party))
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true)
      )
    );
}

function resultLines(state) {
  const { counts, total } = countElectionBallots(state);
  return state.parties.map((party) => {
    const count = counts[party.id];
    const percent = total ? ((count / total) * 100).toFixed(1) : '0.0';
    return `${partyEmoji(party)} **${truncate(party.name, 55)}:** ${count} · ${percent}%`;
  });
}

export function buildElectionResultsEmbed(state, { live = false } = {}) {
  const { total } = countElectionBallots(state);
  const heading = live ? '📊 Результаты live' : '📊 Итоги выборов';
  return new EmbedBuilder()
    .setColor(POLITICS_COLOR)
    .setTitle(heading)
    .setDescription(`${resultLines(state).join('\n') || 'Нет партий.'}\n\n**Всего голосов:** ${total}`)
    .setFooter({ text: live ? 'Результаты обновляются при повторном нажатии' : 'Выборы завершены' });
}

export function buildElectionMessage(state, userId, { selectedPartyId, notice } = {}) {
  const selected = state.parties.find((party) => party.id === selectedPartyId) ?? null;
  const currentPartyId = state.election.ballots?.[userId];
  const currentParty = state.parties.find((party) => party.id === currentPartyId);
  const embed = new EmbedBuilder()
    .setColor(POLITICS_COLOR)
    .setTitle('🗳️ Выборы президента')
    .setDescription(
      `Голосование завершится <t:${Math.floor(state.election.endsAt / 1000)}:R>.\n` +
      `Вы можете изменить голос до завершения выборов.\n\n` +
      `**Выбрано в меню:** ${selected ? `${partyEmoji(selected)} ${selected.name}` : 'ничего'}\n` +
      `**Ваш текущий голос:** ${currentParty ? `${partyEmoji(currentParty)} ${currentParty.name}` : 'не отдан'}`
    );

  const select = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(POLITICS_IDS.ELECTION_SELECT)
      .setPlaceholder('Выберите партию')
      .addOptions(partyOptions(state, selected?.id))
  );
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(POLITICS_IDS.ELECTION_VOTE)
      .setLabel('Отдать голос')
      .setEmoji('🗳️')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!selected),
    new ButtonBuilder()
      .setCustomId(POLITICS_IDS.ELECTION_RESULTS)
      .setLabel('Результаты live')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    content: notice ?? null,
    embeds: [embed],
    components: [select, buttons],
    allowedMentions: { parse: [] }
  };
}

export function buildRoyalMessage(state, { notice } = {}) {
  const president = state.office.presidentId ? `<@${state.office.presidentId}>` : 'нет';
  const governingParty = state.parties.find((party) => party.id === state.office.partyId);
  const embed = new EmbedBuilder()
    .setColor(POLITICS_COLOR)
    .setTitle('👑 Королевский пульт')
    .setDescription(
      `${electionStatusText(state)}\n\n` +
      `**Президент:** ${president}\n` +
      `**Правящая партия:** ${governingParty ? `${partyEmoji(governingParty)} ${governingParty.name}` : 'нет'}\n` +
      `**Помощников:** ${state.office.assistants.length}/${state.settings.moderatorLimit}\n` +
      `**Партий:** ${state.parties.length}`
    )
    .addFields({
      name: '⚙️ Текущие настройки',
      value:
        `Длительность выборов: **${formatDuration(state.settings.electionDurationMs)}**\n` +
        `Лимит помощников: **${state.settings.moderatorLimit}**\n` +
        `Стоимость создания партии: **${state.settings.partyCreationCost}**`
    });

  const active = state.election.status === 'active';
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(POLITICS_IDS.ROYAL_START)
        .setLabel('Запустить выборы')
        .setEmoji('🟢')
        .setStyle(ButtonStyle.Success)
        .setDisabled(active || state.parties.length < 2),
      new ButtonBuilder()
        .setCustomId(POLITICS_IDS.ROYAL_FINISH)
        .setLabel('Завершить выборы')
        .setEmoji('🔴')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!active),
      new ButtonBuilder()
        .setCustomId(POLITICS_IDS.ROYAL_IMPEACH)
        .setLabel('Импичмент / вето')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!state.office.presidentId && state.office.assistants.length === 0),
      new ButtonBuilder()
        .setCustomId(POLITICS_IDS.ROYAL_SETTINGS)
        .setLabel('Настройки')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Secondary)
    )
  ];

  return { content: notice ?? null, embeds: [embed], components, allowedMentions: { parse: [] } };
}

export function buildSettingsModal(settings) {
  return new ModalBuilder()
    .setCustomId(POLITICS_IDS.ROYAL_SETTINGS_MODAL)
    .setTitle('Настройки политической системы')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('duration')
          .setLabel('Длительность выборов')
          .setPlaceholder('Например: 24h или 3 дня')
          .setValue(formatDuration(settings.electionDurationMs))
          .setStyle(TextInputStyle.Short)
          .setMaxLength(40)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('moderator-limit')
          .setLabel('Лимит помощников президента')
          .setValue(String(settings.moderatorLimit))
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('party-cost')
          .setLabel('Стоимость создания партии')
          .setValue(String(settings.partyCreationCost))
          .setStyle(TextInputStyle.Short)
          .setMaxLength(12)
          .setRequired(true)
      )
    );
}

export function buildCabinetMessage(state, { selectedUserId, notice } = {}) {
  const party = state.parties.find((candidate) => candidate.id === state.office.partyId);
  const assistants = state.office.assistants.length
    ? state.office.assistants.map((id) => `<@${id}>`).join(', ')
    : 'Пока никто не назначен.';
  const selected = selectedUserId ? `<@${selectedUserId}>` : 'никто';
  const embed = new EmbedBuilder()
    .setColor(POLITICS_COLOR)
    .setTitle('👑 Кабинет Президента')
    .setDescription(
      `**Президент:** <@${state.office.presidentId}>\n` +
      `**Партия:** ${party ? `${partyEmoji(party)} ${party.name}` : 'не найдена'}\n` +
      `**Выбранный участник:** ${selected}`
    )
    .addFields({
      name: `🛡️ Помощники · ${state.office.assistants.length}/${state.settings.moderatorLimit}`,
      value: truncate(assistants, 1_024)
    });

  const components = [
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(POLITICS_IDS.CABINET_MEMBER)
        .setPlaceholder('Выберите однопартийца')
        .setMinValues(1)
        .setMaxValues(1)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(POLITICS_IDS.CABINET_ASSIGN)
        .setLabel('Назначить помощником')
        .setEmoji('🛡️')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!selectedUserId),
      new ButtonBuilder()
        .setCustomId(POLITICS_IDS.CABINET_REMOVE)
        .setLabel('Снять с должности')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!selectedUserId),
      new ButtonBuilder()
        .setCustomId(POLITICS_IDS.CABINET_BACK)
        .setLabel('Назад к партиям')
        .setEmoji('↩️')
        .setStyle(ButtonStyle.Secondary)
    )
  ];

  return { content: notice ?? null, embeds: [embed], components, allowedMentions: { parse: [] } };
}

export function buildElectionStartedEmbed(state) {
  return new EmbedBuilder()
    .setColor(POLITICS_COLOR)
    .setTitle('🗳️ Выборы открыты')
    .setDescription(
      `Зарегистрировано партий: **${state.parties.length}**.\n` +
      `Голосование завершится <t:${Math.floor(state.election.endsAt / 1000)}:F>.\n\n` +
      'Используйте команду **/election**, чтобы выбрать партию и проголосовать.'
    );
}

export function buildElectionFinishedEmbed(state, outcome = getElectionOutcome(state)) {
  const embed = buildElectionResultsEmbed(state);
  if (outcome.type === 'winner') {
    embed
      .setTitle('🏆 Выборы завершены')
      .addFields({
        name: 'Победитель',
        value: `${partyEmoji(outcome.winner)} **${outcome.winner.name}**\nПрезидент: <@${outcome.winner.leaderId}>`
      });
  } else if (outcome.type === 'tie') {
    embed
      .setTitle('🤝 Выборы завершены ничьей')
      .addFields({
        name: 'Лидеры',
        value: truncate(outcome.winners.map((party) => `${partyEmoji(party)} ${party.name}`).join(', '), 1_024)
      });
  } else {
    embed.setTitle('⚪ Выборы завершены без голосов');
  }
  return embed;
}
