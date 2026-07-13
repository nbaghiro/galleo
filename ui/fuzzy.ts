export function fuzzyScore(query: string, text: string): number | null {
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    if (!q) return 0;
    let qi = 0;
    let score = 0;
    let prev = -2;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] !== q[qi]) continue;
        let s = 1;
        if (ti === prev + 1) s += 3; // consecutive run
        if (ti === 0 || /[\s\-_/.]/.test(t[ti - 1]!)) s += 4; // start of a word
        s -= ti * 0.02; // earlier matches read as more relevant
        score += s;
        prev = ti;
        qi += 1;
    }
    return qi === q.length ? score : null;
}

export function rankItems<T>(query: string, items: T[], haystack: (item: T) => string): T[] {
    const q = query.trim();
    if (!q) return items;
    const scored: { item: T; score: number }[] = [];
    for (const item of items) {
        const s = fuzzyScore(q, haystack(item));
        if (s !== null) scored.push({ item, score: s });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((r) => r.item);
}
