export async function request(operation) {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) { if (attempt === 2) throw error; }
  }
}
