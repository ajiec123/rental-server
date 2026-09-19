export interface StationTvPairing {
  stationId: string;
  tvChannel: string;
  label?: string;
  lastSeenAt?: number;
  createdAt?: number;
}

export function buildDerivedStationChannel(station: { id: string; consoleType: string }): string {
  const idDigits = station.id.replace(/\D/g, '');
  const lastTwo = idDigits.slice(-2).padStart(2, '0');
  const consoleShort = station.consoleType.replace(/\s+/g, '').toUpperCase().slice(0, 6);
  return `tv:${consoleShort}_${lastTwo}`;
}

export function resolveStationTvChannel(
  station: { id: string; consoleType: string },
  pairings: StationTvPairing[] = []
): string {
  const explicit = pairings.find((p) => p.stationId === station.id);
  return explicit?.tvChannel || buildDerivedStationChannel(station);
}

export function getTvChannelCandidates(
  station: { id: string; consoleType: string },
  pairings: StationTvPairing[] = [],
  presenceChannels: string[] = []
): string[] {
  const primary = resolveStationTvChannel(station, pairings);
  const base = primary.toUpperCase();
  const [baseConsole = '', baseSuffix = ''] = base.split('_');
  const baseConsoleShort = baseConsole.replace(/^TV:/, '');
  const suffixRegex = new RegExp(`^TV:${baseConsoleShort}_${baseSuffix}$`);
  const candidates = new Set<string>([primary, 'tv:all']);

  presenceChannels.forEach((channel) => {
    if (!channel.startsWith('tv:')) return;
    const normalized = channel.toUpperCase();
    if (normalized === base || normalized === 'TV:ALL') return;
    if (suffixRegex.test(normalized)) {
      candidates.add(channel);
    }
  });

  return Array.from(candidates);
}
