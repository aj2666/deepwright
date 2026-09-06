export async function request(operation) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}
