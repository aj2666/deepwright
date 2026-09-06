export const BATCH_SIZE = 250;
export const WORKER_CONCURRENCY = 4;

export async function importRecords(records, send) {
  for (let offset = 0; offset < records.length; offset += BATCH_SIZE * WORKER_CONCURRENCY) {
    const jobs = [];
    for (let worker = 0; worker < WORKER_CONCURRENCY; worker += 1) {
      const batch = records.slice(offset + worker * BATCH_SIZE, offset + (worker + 1) * BATCH_SIZE);
      if (batch.length) jobs.push(send(batch));
    }
    await Promise.all(jobs);
  }
}
