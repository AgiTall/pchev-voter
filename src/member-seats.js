export function createHumanSeat(member) {
  if (member.user.bot) return null;
  return {
    userId: member.id,
    displayName: member.displayName,
    avatarUrl: member.displayAvatarURL({ extension: 'png', forceStatic: true, size: 128 })
  };
}

export function createHumanSeats(members) {
  return [...members]
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'ru'))
    .map(createHumanSeat)
    .filter(Boolean);
}

export async function collectHumanSeats(guild) {
  const members = await guild.members.fetch();
  return createHumanSeats(members.values());
}
