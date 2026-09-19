export function getChannelPublishTargets(channel: string): string[] {
  const normalized = channel?.trim() || '';
  if (!normalized || normalized === 'tv:all') return ['tv:all'];
  return [normalized, 'tv:all'];
}
