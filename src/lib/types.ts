export type MatchStatus =
  | 'scheduled'
  | 'live'
  | 'finished'
  | 'postponed'
  | 'cancelled';

export interface Player {
  id: number;
  name: string;
  is_active: boolean;
}

export interface Match {
  id: number;
  season_id: number;
  external_api_id: number | null;
  round: number;
  kickoff: string; // ISO
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: MatchStatus;
  minute?: number | null;
  duration?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  reg_home?: number | null; // skóre v 90:00 (Pán nastavení)
  reg_away?: number | null;
  extra_home?: number | null;
  extra_away?: number | null;
  pen_home?: number | null;
  pen_away?: number | null;
  clock?: string | null; // živá minuta z ESPN ("90'+8'")
  detail?: import('./espn').MatchDetail | null;
}

export interface Prediction {
  id: number;
  player_id: number;
  match_id: number;
  predicted_home: number;
  predicted_away: number;
  points: number | null;
}

export interface StandingRow {
  player_id: number;
  name: string;
  season_id: number;
  points: number;
  scored_matches: number;
  exact_hits: number;
  avg_points: number;
  success_rate: number;
}

export interface GoalStatRow {
  player_id: number;
  name: string;
  season_id: number;
  predictions_count: number;
  total_pred_goals: number;
  avg_pred_goals: number;
}

export interface MissRow {
  player_id: number;
  name: string;
  season_id: number;
  zeros: number;
  missed: number;
}

export interface RoundPrediction {
  match_id: number;
  name: string;
  predicted_home: number;
  predicted_away: number;
  points: number | null;
}
