import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export class SupabaseRankingService {
  constructor(options = {}) {
    this.url = options.url ?? "";
    this.key = options.key ?? "";
    this.table = options.table ?? "leaderboard_scores";
    this.maxNicknameLength = options.maxNicknameLength ?? 24;

    this.client =
      this.url && this.key
        ? createClient(this.url, this.key, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          })
        : null;
  }

  isReady() {
    return !!this.client;
  }

  sanitizeNickname(name) {
    const value = String(name ?? "Player").trim() || "Player";
    return value.slice(0, this.maxNicknameLength);
  }

sanitizeScore(score) {
  const num = Number(score ?? 0);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.trunc(num);
}

  sanitizeBlocks(blocks) {
    const value = Math.trunc(Number(blocks ?? 0));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  async submitScore(payload = {}) {
    if (!this.client) {
      throw new Error("Supabase client is not configured.");
    }

    const row = {
      nickname: this.sanitizeNickname(payload.nickname),
      score: this.sanitizeScore(payload.score),
      blocks_used: this.sanitizeBlocks(payload.blocksUsed),
      game_version: String(payload.version ?? ""),
    };

    const { data, error } = await this.client
      .from(this.table)
      .insert(row)
      .select("id, nickname, score, blocks_used, game_version, created_at")
      .single();

    if (error) throw error;

    const { count, error: countError } = await this.client
      .from(this.table)
      .select("id", { count: "exact", head: true })
      .gt("score", row.score);

    if (countError) {
      return {
        entry: data,
        rank: null,
      };
    }

    const { count: tieAheadCount, error: tieError } = await this.client
      .from(this.table)
      .select("id", { count: "exact", head: true })
      .eq("score", row.score)
      .lt("blocks_used", row.blocks_used);

    if (tieError) {
      return {
        entry: data,
        rank: null,
      };
    }

    const rank = (count ?? 0) + (tieAheadCount ?? 0) + 1;

    return {
      entry: data,
      rank,
    };
  }

  async fetchTop(limit = 100) {
    if (!this.client) {
      throw new Error("Supabase client is not configured.");
    }

    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit || 100)));

    const { data, error } = await this.client
      .from(this.table)
      .select("id, nickname, score, blocks_used, game_version, created_at")
      .order("score", { ascending: false })
      .order("blocks_used", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(safeLimit);

    if (error) throw error;
    return data ?? [];
  }
}