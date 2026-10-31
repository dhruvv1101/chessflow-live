export const DIFFICULTIES = Object.freeze({
  Easy: Object.freeze({ skill: 3, movetime: 200 }),
  Medium: Object.freeze({ skill: 8, movetime: 400 }),
  Hard: Object.freeze({ skill: 14, movetime: 800 }),
  Max: Object.freeze({ skill: 20, movetime: 1500 }),
});

export const ENGINE = Object.freeze({ hashMb: 32, multiPv: 3, pvPlies: 10, timeoutMs: 15000, hintTime: 4000 });
