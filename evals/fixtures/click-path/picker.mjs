export function createPicker() {
  const state = { open: true, selected: null };
  function select(id) { state.selected = id; }
  function close() { state.open = false; state.selected = null; }
  function choose(id) { select(id); close(); }
  function cancel() { close(); }
  return { state, select, close, choose, cancel };
}
