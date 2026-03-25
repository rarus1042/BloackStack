export class RankingService {
  constructor(options = {}) {
    this.storageKey = options.storageKey ?? "blockstack_rankings_v1";
    this.maxEntries = options.maxEntries ?? 50;
  }

  load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Ranking load failed:", error);
      return [];
    }
  }

  save(entries) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(entries));
    } catch (error) {
      console.warn("Ranking save failed:", error);
    }
  }

  sort(entries) {
    return [...entries].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.blocksUsed !== b.blocksUsed) return a.blocksUsed - b.blocksUsed;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }

  submit(payload = {}) {
    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      nickname: String(payload.nickname ?? "Player").trim() || "Player",
      score: Number(payload.score ?? 0),
      blocksUsed: Math.max(0, Math.trunc(payload.blocksUsed ?? 0)),
      version: String(payload.version ?? ""),
      createdAt: new Date().toISOString(),
    };

    const entries = this.load();
    entries.push(entry);

    const sorted = this.sort(entries).slice(0, this.maxEntries);
    this.save(sorted);

    const rank = sorted.findIndex((item) => item.id === entry.id) + 1;

    return {
      entry,
      rank: rank > 0 ? rank : null,
      entries: sorted,
    };
  }

  getTop(limit = 10) {
    return this.sort(this.load()).slice(0, limit);
  }
}