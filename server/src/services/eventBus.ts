import { EventEmitter } from 'node:events';

export interface MatchEvent {
  type: 'goal' | 'red_card' | 'status_change' | 'score_update';
  matchId: string;
  timestamp: number;
  data: {
    homeScore?: number;
    awayScore?: number;
    status?: string;
    elapsed?: number;
    team?: string;
    player?: string;
  };
}

const bus = new EventEmitter();
bus.setMaxListeners(100);

export function emitMatchEvent(event: MatchEvent): void {
  bus.emit('match', event);
}

export function onMatchEvent(handler: (event: MatchEvent) => void): () => void {
  bus.on('match', handler);
  return () => {
    bus.off('match', handler);
  };
}
