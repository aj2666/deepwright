export async function request(operation, { maxRetries = 1 } = {}) {
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
    throw new RangeError("maxRetries must be an integer from 0 to 5");
  }
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt === maxRetries) throw error;
    }
  }
}
