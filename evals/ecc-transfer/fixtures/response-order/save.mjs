export async function saveAndObserve(page, signal) {
  await page.clickSave();
  return page.waitForResponse(
    (response) => response.method === "POST" && response.path === "/save",
    { signal },
  );
}
