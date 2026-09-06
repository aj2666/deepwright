let processed = 0;
let sampled = 0;

setInterval(() => { sampled = processed; }, 1000);

export function recordProcessed() { processed += 1; }
export function readMetrics() { return { processed, sampled }; }
