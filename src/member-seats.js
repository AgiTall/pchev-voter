export function createHumanSeats(members) {
  return [...members]
    .filter((member) => !member.user.bot)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'ru'))
    .map((member) => ({
      userId: member.id,
      displayName: member.displayName,
      avatarUrl: member.displayAvatarURL({ extension: 'png', forceStatic: true, size: 128 })
    }));
}

export async function collectHumanSeats(guild) {
  const members = await guild.members.fetch();
  return createHumanSeats(members.values());
}
