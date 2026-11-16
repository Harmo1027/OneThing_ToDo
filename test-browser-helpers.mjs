export async function openTodo(page) {
  await page.locator('#workspace-switcher [data-workspace="todo"]').click();
  await page.locator("#todo-view").waitFor({ state: "visible" });
}

export async function openDaily(page) {
  await page.locator("#daily-button").click();
  await page.locator("#daily-dialog").waitFor({ state: "visible" });
}

export async function openCalendar(page) {
  await page.locator('#workspace-switcher [data-workspace="calendar"]').click();
  await page.locator("#calendar-view").waitFor({ state: "visible" });
}
