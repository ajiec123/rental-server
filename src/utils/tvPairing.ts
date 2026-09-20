export interface StationTvPairing {
  stationId: string;
  tvChannel: string;
  label?: string;
  lastSeenAt?: number;
  createdAt?: number;
}

export function buildDerivedStationChannel(station: { id: string; name?: string; consoleType: string }): string {
  // Zero-setup convention: channel = tv:STATION_<2-digit station number>.
  // Number is taken from the trailing digits of the station name
  // (e.g. "Station 04" → 04), falling back to the station id digits.
  const nameMatch = (station.name || '').match(/(\d+)\s*$/);
  const idDigits = station.id.replace(/\D/g, '');
  const num = (nameMatch ? nameMatch[1] : idDigits.slice(-2)).padStart(2, '0');
  return `tv:STATION_${num}`;
}

export function resolveStationTvChannel(
  station: { id: string; name?: string; consoleType: string },
  pairings: StationTvPairing[] = []
): string {
  const explicit = pairings.find((p) => p.stationId === station.id);
  return explicit?.tvChannel || buildDerivedStationChannel(station);
}

export function getTvChannelCandidates(
  station: { id: string; name?: string; consoleType: string },
  pairings: StationTvPairing[] = [],
  presenceChannels: string[] = []
): string[] {
  const primary = resolveStationTvChannel(station, pairings);
  const base = primary.toUpperCase();
  const [baseConsole = '', baseSuffix = ''] = base.split('_');
  const baseConsoleShort = baseConsole.replace(/^TV:/, '');
  const suffixRegex = new RegExp(`^TV:${baseConsoleShort}_${baseSuffix}$`);
  // NOTE: "tv:all" is a BROADCAST channel (every TV subscribes to it), so it
  // must NOT be a status candidate — otherwise one TV's presence pollutes the
  // status of every station (e.g. "Connect" on one station flickers all).
  const candidates = new Set<string>([primary]);

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
