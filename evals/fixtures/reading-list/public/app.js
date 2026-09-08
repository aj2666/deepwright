const list = document.querySelector("#items");
const status = document.querySelector("#list-status");
const count = document.querySelector("#item-count");

function render(items) {
  list.replaceChildren();
  for (const [index, item] of items.entries()) {
    const row = document.createElement("li");
    const number = document.createElement("span");
    number.className = "item-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const link = document.createElement("a");
    link.href = item.url;
    link.className = "item-link";
    const title = document.createElement("span");
    title.className = "item-title";
    title.textContent = item.title;
    const address = document.createElement("span");
    address.className = "item-address";
    address.textContent = new URL(item.url).hostname;
    link.append(title, address);
    const arrow = document.createElement("span");
    arrow.className = "item-arrow";
    arrow.textContent = "↗";
    arrow.setAttribute("aria-hidden", "true");
    row.append(number, link, arrow);
    list.append(row);
  }
  count.textContent = `${items.length} ${items.length === 1 ? "item" : "items"}`;
  status.textContent = items.length ? "" : "Your shelf is ready for its first good read.";
}

async function load() {
  try {
    const response = await fetch("/api/items");
    if (!response.ok) throw new Error("Unable to load your shelf. Please refresh to try again.");
    const { items } = await response.json();
    render(items);
  } catch (error) {
    status.textContent = error.message;
  }
}
load();
