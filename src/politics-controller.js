import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { parseDuration } from './duration.js';
import { PoliticsError } from './politics-service.js';
import {
  buildCabinetMessage,
  buildCreatePartyModal,
  buildElectionMessage,
  buildElectionResultsEmbed,
  buildPartiesMessage,
  buildPartyEmojiModal,
  buildRoyalMessage,
  buildSettingsModal,
  findUserParty,
  POLITICS_IDS
} from './politics-ui.js';

const MIN_ELECTION_DURATION = 60_000;
const MAX_ELECTION_DURATION = 30 * 86_400_000;

export class PoliticsController {
  constructor(service, store) {
    this.service = service;
    this.store = store;
    this.partySelections = new Map();
    this.electionSelections = new Map();
    this.cabinetSelections = new Map();
  }

  selectionKey(interaction) {
    return `${interaction.guildId}:${interaction.user.id}:${interaction.message?.id ?? 'new'}`;
  }

  setSelection(map, key, value) {
    map.set(key, value);
    if (map.size > 5_000) map.delete(map.keys().next().value);
  }

  isAdministrator(interaction) {
    return (
      interaction.guild?.ownerId === interaction.user.id ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    );
  }

  requireGuild(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
      throw new PoliticsError('Политическая система доступна только на сервере.');
    }
  }

  requireAdministrator(interaction) {
    this.requireGuild(interaction);
    if (!this.isAdministrator(interaction)) {
      throw new PoliticsError('Эта панель доступна только владельцу и администраторам сервера.');
    }
  }

  requirePresident(interaction) {
    this.requireGuild(interaction);
    this.service.assertPresident(this.store.get(interaction.guildId), interaction.user.id);
  }

  async respondError(interaction, message) {
    const response = { content: `⚠️ ${message}`, flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response);
    } else {
      await interaction.reply(response);
    }
  }

  async handle(interaction) {
    const isCommand =
      interaction.isChatInputCommand() &&
      ['parties', 'election', 'royal'].includes(interaction.commandName);
    const isComponent =
      (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) &&
      interaction.customId.startsWith('politics:');
    if (!isCommand && !isComponent) return false;

    try {
      if (isCommand) await this.handleCommand(interaction);
      else if (interaction.isModalSubmit()) await this.handleModal(interaction);
      else if (interaction.isAnySelectMenu()) await this.handleSelect(interaction);
      else await this.handleButton(interaction);
    } catch (error) {
      if (!(error instanceof PoliticsError)) throw error;
      await this.respondError(interaction, error.message);
    }
    return true;
  }

  async handleCommand(interaction) {
    this.requireGuild(interaction);
    const state = this.store.get(interaction.guildId);
    const key = this.selectionKey(interaction);

    if (interaction.commandName === 'parties') {
      const selectedPartyId = this.partySelections.get(key);
      await interaction.reply({
        ...buildPartiesMessage(state, interaction.user.id, { selectedPartyId }),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.commandName === 'election') {
      if (state.election.status !== 'active' || Date.now() >= state.election.endsAt) {
        throw new PoliticsError('Сейчас нет активных выборов.');
      }
      const selectedPartyId = this.electionSelections.get(key);
      await interaction.reply({
        ...buildElectionMessage(state, interaction.user.id, { selectedPartyId }),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    this.requireAdministrator(interaction);
    await interaction.reply({
      ...buildRoyalMessage(state),
      flags: MessageFlags.Ephemeral
    });
  }

  async handleSelect(interaction) {
    this.requireGuild(interaction);
    const state = this.store.get(interaction.guildId);
    const key = this.selectionKey(interaction);

    if (interaction.customId === POLITICS_IDS.PARTY_SELECT) {
      const partyId = interaction.values[0];
      if (!state.parties.some((party) => party.id === partyId)) {
        throw new PoliticsError('Выбранная партия больше не существует.');
      }
      this.setSelection(this.partySelections, key, partyId);
      await interaction.update(
        buildPartiesMessage(state, interaction.user.id, { selectedPartyId: partyId })
      );
      return;
    }

    if (interaction.customId === POLITICS_IDS.ELECTION_SELECT) {
      if (state.election.status !== 'active' || Date.now() >= state.election.endsAt) {
        throw new PoliticsError('Выборы уже завершены.');
      }
      const partyId = interaction.values[0];
      if (!state.parties.some((party) => party.id === partyId)) {
        throw new PoliticsError('Выбранная партия больше не участвует в выборах.');
      }
      this.setSelection(this.electionSelections, key, partyId);
      await interaction.update(
        buildElectionMessage(state, interaction.user.id, { selectedPartyId: partyId })
      );
      return;
    }

    if (interaction.customId === POLITICS_IDS.CABINET_MEMBER) {
      this.requirePresident(interaction);
      const memberId = interaction.values[0];
      const party = state.parties.find((candidate) => candidate.id === state.office.partyId);
      if (!party?.members.includes(memberId)) {
        throw new PoliticsError('Выберите участника своей партии. Discord показывает весь сервер, поэтому бот проверяет состав после выбора.');
      }
      this.setSelection(this.cabinetSelections, key, memberId);
      await interaction.update(buildCabinetMessage(state, { selectedUserId: memberId }));
    }
  }

  async handleModal(interaction) {
    this.requireGuild(interaction);
    const key = this.selectionKey(interaction);

    if (interaction.customId === POLITICS_IDS.PARTY_CREATE_MODAL) {
      const result = await this.service.createParty(
        interaction.guildId,
        interaction.user.id,
        interaction.fields.getTextInputValue('name'),
        interaction.fields.getTextInputValue('description'),
        interaction.fields.getTextInputValue('emoji')
      );
      this.setSelection(this.partySelections, key, result.party.id);
      const costNote = result.configuredCost > 0
        ? ` Настроенная стоимость ${result.configuredCost} сохранена как справочная: внешний кошелёк к боту не подключён.`
        : '';
      await interaction.update(
        buildPartiesMessage(this.store.get(interaction.guildId), interaction.user.id, {
          selectedPartyId: result.party.id,
          notice: `✅ Партия **${result.party.name}** создана.${costNote}`
        })
      );
      return;
    }

    if (interaction.customId === POLITICS_IDS.PARTY_EMOJI_MODAL) {
      const party = await this.service.updatePartyEmoji(
        interaction.guildId,
        interaction.user.id,
        interaction.fields.getTextInputValue('emoji')
      );
      this.setSelection(this.partySelections, key, party.id);
      await interaction.update(
        buildPartiesMessage(this.store.get(interaction.guildId), interaction.user.id, {
          selectedPartyId: party.id,
          notice: `✅ Логотип партии **${party.name}** обновлён: ${party.emoji}`
        })
      );
      return;
    }

    if (interaction.customId === POLITICS_IDS.ROYAL_SETTINGS_MODAL) {
      this.requireAdministrator(interaction);
      const durationMs = parseDuration(interaction.fields.getTextInputValue('duration'));
      const moderatorLimit = Number(interaction.fields.getTextInputValue('moderator-limit'));
      const partyCreationCost = Number(interaction.fields.getTextInputValue('party-cost'));
      const state = this.store.get(interaction.guildId);

      if (
        !durationMs ||
        durationMs < MIN_ELECTION_DURATION ||
        durationMs > MAX_ELECTION_DURATION
      ) {
        throw new PoliticsError('Длительность выборов должна быть от 1 минуты до 30 дней.');
      }
      if (!Number.isInteger(moderatorLimit) || moderatorLimit < 0 || moderatorLimit > 10) {
        throw new PoliticsError('Лимит помощников должен быть целым числом от 0 до 10.');
      }
      if (moderatorLimit < state.office.assistants.length) {
        throw new PoliticsError('Сначала снимите лишних помощников, затем уменьшайте лимит.');
      }
      if (
        !Number.isSafeInteger(partyCreationCost) ||
        partyCreationCost < 0 ||
        partyCreationCost > 1_000_000_000
      ) {
        throw new PoliticsError('Стоимость должна быть целым числом от 0 до 1 000 000 000.');
      }

      await this.service.updateSettings(interaction.guildId, {
        electionDurationMs: durationMs,
        moderatorLimit,
        partyCreationCost
      });
      await interaction.update(
        buildRoyalMessage(this.store.get(interaction.guildId), {
          notice: '✅ Настройки сохранены.'
        })
      );
    }
  }

  async handleButton(interaction) {
    this.requireGuild(interaction);
    const state = this.store.get(interaction.guildId);
    const key = this.selectionKey(interaction);

    if (interaction.customId === POLITICS_IDS.PARTY_CREATE) {
      if (findUserParty(state, interaction.user.id)) {
        throw new PoliticsError('Вы уже состоите в партии.');
      }
      if (state.election.status === 'active') {
        throw new PoliticsError('Во время выборов список партий заморожен.');
      }
      await interaction.showModal(buildCreatePartyModal());
      return;
    }

    if (interaction.customId === POLITICS_IDS.PARTY_JOIN) {
      const partyId = this.partySelections.get(key);
      if (!partyId) throw new PoliticsError('Сначала выберите партию в списке.');
      const party = await this.service.joinParty(interaction.guildId, interaction.user.id, partyId);
      await interaction.update(
        buildPartiesMessage(this.store.get(interaction.guildId), interaction.user.id, {
          selectedPartyId: party.id,
          notice: `✅ Вы вступили в партию **${party.name}**.`
        })
      );
      return;
    }

    if (interaction.customId === POLITICS_IDS.PARTY_EMOJI) {
      const party = findUserParty(state, interaction.user.id);
      if (!party || party.leaderId !== interaction.user.id) {
        throw new PoliticsError('Менять логотип может только лидер партии.');
      }
      await interaction.showModal(buildPartyEmojiModal(party));
      return;
    }

    if (interaction.customId === POLITICS_IDS.PARTY_LEAVE) {
      const result = await this.service.leaveParty(interaction.guild, interaction.user.id);
      const leadership = result.newLeaderId ? ` Новый лидер: <@${result.newLeaderId}>.` : '';
      const deleted = result.deleted ? ' Партия распущена, потому что в ней никого не осталось.' : '';
      const warning = result.warnings.length ? ` ⚠️ ${result.warnings.join(' ')}` : '';
      await interaction.update(
        buildPartiesMessage(this.store.get(interaction.guildId), interaction.user.id, {
          notice: `✅ Вы вышли из партии **${result.party.name}**.${leadership}${deleted}${warning}`
        })
      );
      return;
    }

    if (interaction.customId === POLITICS_IDS.PARTY_CABINET) {
      this.requirePresident(interaction);
      const selectedUserId = this.cabinetSelections.get(key);
      await interaction.update(buildCabinetMessage(state, { selectedUserId }));
      return;
    }

    if (interaction.customId === POLITICS_IDS.PARTY_BACK || interaction.customId === POLITICS_IDS.CABINET_BACK) {
      await interaction.update(
        buildPartiesMessage(state, interaction.user.id, {
          selectedPartyId: this.partySelections.get(key)
        })
      );
      return;
    }

    if (interaction.customId === POLITICS_IDS.ELECTION_VOTE) {
      const partyId = this.electionSelections.get(key);
      if (!partyId) throw new PoliticsError('Сначала выберите партию в списке.');
      const party = await this.service.castBallot(interaction.guildId, interaction.user.id, partyId);
      await interaction.update(
        buildElectionMessage(this.store.get(interaction.guildId), interaction.user.id, {
          selectedPartyId: party.id,
          notice: `✅ Ваш голос за **${party.name}** учтён.`
        })
      );
      return;
    }

    if (interaction.customId === POLITICS_IDS.ELECTION_RESULTS) {
      if (state.election.status !== 'active') throw new PoliticsError('Выборы уже завершены.');
      await interaction.reply({
        embeds: [buildElectionResultsEmbed(state, { live: true })],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
      return;
    }

    if (interaction.customId.startsWith('politics:royal:')) {
      this.requireAdministrator(interaction);
    }

    if (interaction.customId === POLITICS_IDS.ROYAL_START) {
      await interaction.deferUpdate();
      const result = await this.service.startElection(interaction.guild, interaction.channelId);
      this.electionSelections.clear();
      await interaction.editReply(
        buildRoyalMessage(result.state, {
          notice: result.announcementSent
            ? '✅ Выборы запущены. Публичный анонс отправлен в канал.'
            : '✅ Выборы запущены. ⚠️ Анонс не отправлен: проверьте доступ бота к каналу.'
        })
      );
      return;
    }

    if (interaction.customId === POLITICS_IDS.ROYAL_FINISH) {
      await interaction.deferUpdate();
      const result = await this.service.finishElection(interaction.guild, { announce: true });
      const warning = result.warnings.length ? ` ⚠️ ${result.warnings.join(' ')}` : '';
      const announcementWarning = result.announcementSent
        ? ''
        : ' ⚠️ Итоговый анонс не отправлен в канал.';
      await interaction.editReply(
        buildRoyalMessage(result.state, {
          notice: `✅ Выборы завершены.${warning}${announcementWarning}`
        })
      );
      return;
    }

    if (interaction.customId === POLITICS_IDS.ROYAL_IMPEACH) {
      await interaction.deferUpdate();
      const result = await this.service.impeach(interaction.guild);
      const warning = result.warnings.length ? ` ⚠️ ${result.warnings.join(' ')}` : '';
      await interaction.editReply(
        buildRoyalMessage(result.state, { notice: `✅ Созыв обнулён, выданные роли сняты.${warning}` })
      );
      if (interaction.channel?.isTextBased()) {
        await interaction.channel.send({
          content: '❌ **Созыв распущен.** Президент и назначенные помощники сняты с должностей.',
          allowedMentions: { parse: [] }
        });
      }
      return;
    }

    if (interaction.customId === POLITICS_IDS.ROYAL_SETTINGS) {
      await interaction.showModal(buildSettingsModal(state.settings));
      return;
    }

    if (interaction.customId === POLITICS_IDS.CABINET_ASSIGN) {
      this.requirePresident(interaction);
      const memberId = this.cabinetSelections.get(key);
      if (!memberId) throw new PoliticsError('Сначала выберите однопартийца.');
      const current = await this.service.assignAssistant(
        interaction.guild,
        interaction.user.id,
        memberId
      );
      await interaction.update(
        buildCabinetMessage(current, {
          selectedUserId: memberId,
          notice: `✅ <@${memberId}> назначен помощником.`
        })
      );
      return;
    }

    if (interaction.customId === POLITICS_IDS.CABINET_REMOVE) {
      this.requirePresident(interaction);
      const memberId = this.cabinetSelections.get(key);
      if (!memberId) throw new PoliticsError('Сначала выберите помощника.');
      const result = await this.service.removeAssistant(
        interaction.guild,
        interaction.user.id,
        memberId
      );
      await interaction.update(
        buildCabinetMessage(result.state, {
          selectedUserId: memberId,
          notice: `✅ <@${memberId}> снят с должности.${result.warning ? ` ⚠️ ${result.warning}` : ''}`
        })
      );
    }
  }
}
