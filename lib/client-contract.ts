import type { PublicEdition } from "./domain";
export type Ranking = {
  rows: {
    id: string;
    displayName: string;
    score: number;
    completedAt: string;
    rank: number;
    mine: boolean;
  }[];
  rank: number | null;
  participantCount: number;
  current: boolean;
};
export type Overview = {
  signedIn: boolean;
  profile: string | null;
  owner: boolean;
  edition: PublicEdition | null;
  editionId: string | null;
  available: { date: string; kind: string }[];
  resumeAttemptId: string | null;
  generation: {
    authorized: boolean;
    creditCapEnforced: boolean;
    dailyCreditLimit: number | null;
    reason: string;
  };
  leaderboard: Ranking | null;
  bests: { first: number | null; practice: number | null };
  today: string;
  status: string;
};
export type Play = {
  attempt: {
    id: string;
    kind: "ranked" | "practice";
    completedAt: string | null;
    score: number;
  };
  edition: PublicEdition;
};
