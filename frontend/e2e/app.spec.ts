import { test, expect } from "@playwright/test";

test("overview renders live metrics, geographic map and topology switching", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Сүлжээний ерөнхий төлөв" }),
  ).toBeVisible();
  await expect(page.locator(".metric-value").first()).toHaveText("22хот");
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.locator(".leaflet-interactive")).not.toHaveCount(0);
  await page.getByRole("button", { name: "MST", exact: true }).click();
  await expect(page.locator(".metric-value").nth(2)).toHaveText("21холбоос");
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Full Mesh", exact: true }).click();
  await expect(page.locator(".metric-sub").nth(1)).toHaveText(
    "231 онолын холбоос",
  );
  expect(errors).toEqual([]);
});

test("single cut shows outage and reset restores network", async ({ page }) => {
  await page.goto("/#disaster");
  await page.getByRole("button", { name: "MST", exact: true }).click();
  await page.getByRole("button", { name: /Кабель тасрах/ }).click();
  // Leaflet paths are real click targets; choose a line clear of its node.
  const route = page
    .locator(".leaflet-overlay-pane path")
    .filter({ hasNot: page.locator("nothing") });
  await expect(page.locator(".leaflet-overlay-pane path")).not.toHaveCount(0);
  await page
    .locator(".leaflet-overlay-pane path.leaflet-interactive")
    .nth(1)
    .evaluate((el) =>
      el.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
  await page.getByRole("button", { name: "Симуляц эхлүүлэх" }).click();
  await expect(page.getByText("СИМУЛЯЦЫН ҮР ДҮН")).toBeVisible();
  await expect(page.locator(".result-numbers b").nth(2)).toHaveText("2");
  await expect(page.locator(".recovery-row").first()).toBeVisible();
  await page.getByRole("button", { name: "Симуляц шинэчлэх" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Симуляц ажиллуулахад бэлэн" }),
  ).toBeVisible();
  void route;
});

test("flood and shared corridor simulations report real multi-failures", async ({
  page,
}) => {
  await page.goto("/#disaster");
  await page.getByRole("button", { name: "Симуляц эхлүүлэх" }).click();
  await expect(page.getByText("СИМУЛЯЦЫН ҮР ДҮН")).toBeVisible();
  await expect(
    page.locator(".result-summary .mini-tag").first(),
  ).not.toHaveText("0 FAILURES");
  await page.screenshot({
    path: "test-results/disaster-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Симуляц шинэчлэх" }).first().click();
  await page.getByRole("button", { name: /Хамтын коридор/ }).click();
  await page.getByLabel(/Хамтын эрсдэлийн бүлэг/).selectOption("western-pass");
  await page.getByRole("button", { name: "Симуляц эхлүүлэх" }).click();
  await expect(page.getByText("СИМУЛЯЦЫН ҮР ДҮН")).toBeVisible();
});

test("Dijkstra route, optimization and reproducible report export", async ({
  page,
}) => {
  await page.goto("/#routes");
  await page.getByRole("button", { name: "Зам тооцоолох" }).click();
  await expect(page.locator(".route-analysis-results")).toContainText(
    "Улаанбаатар",
  );
  await expect(
    page.locator(".route-analysis-results h3").first(),
  ).toContainText("км");
  await page
    .getByRole("button", { name: "Топологи оновчлол", exact: true })
    .click();
  await page.getByRole("slider").first().fill("2");
  await page.getByRole("button", { name: "Оновчлол ажиллуулах" }).click();
  await expect(page.locator(".metric-value").nth(2)).toHaveText("0холбоос");
  await page
    .getByRole("button", { name: "Тайлан, экспорт", exact: true })
    .click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON тайлан" }).click();
  const file = await event;
  expect(file.suggestedFilename()).toBe("fiberguard-report.json");
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV экспорт" }).click();
  expect((await csv).suggestedFilename()).toBe("fiberguard-report.csv");
});

test("data authoring edits and persists a node, then restores the value", async ({
  page,
}) => {
  await page.goto("/#data");
  await expect(page.locator("tbody tr")).toHaveCount(22);
  await page.getByRole("button", { name: "olgii засах", exact: true }).click();
  const field = page.getByRole("textbox", { name: "English name" });
  const original = await field.inputValue();
  await field.fill("Ölgii QA");
  await page.getByRole("button", { name: "Хадгалах", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("Ölgii QA");
  await page.reload();
  await expect(page.locator("tbody")).toContainText("Ölgii QA");
  await page.getByRole("button", { name: "olgii засах", exact: true }).click();
  await page.getByRole("textbox", { name: "English name" }).fill(original);
  await page.getByRole("button", { name: "Хадгалах", exact: true }).click();
  await expect(page.locator("tbody")).toContainText(original);
});

test("mobile navigation and data-dense layout remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".metrics-row")).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
  await page.screenshot({
    path: "test-results/overview-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Цэс нээх" }).click();
  await page.getByRole("button", { name: /Гамшгийн симуляц/ }).click();
  await expect(
    page.getByRole("heading", { name: "Гамшгийн удирдлагын төв" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Симуляц эхлүүлэх" }).click();
  await expect(page.getByText("СИМУЛЯЦЫН ҮР ДҮН")).toBeVisible();
  await page.screenshot({
    path: "test-results/disaster-mobile.png",
    fullPage: true,
  });
});

test("default road alignments and cached route updates are explicit", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".road-data-banner")).toContainText("45 / 45");
  await expect(page.locator(".map-scale-label")).toHaveText(
    "OSM / OSRM авто зам дагасан маршрут",
  );
  await page
    .getByRole("button", { name: "Дэд бүтцийн өгөгдөл", exact: true })
    .click();
  await page.getByRole("button", { name: /Чиглэл 45/ }).click();
  const row = page
    .locator("tbody tr")
    .filter({
      has: page.getByRole("button", {
        name: "fg-029 авто замын маршрут авах",
        exact: true,
      }),
    });
  await expect(row).toContainText("OSM авто замын маршрут");
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("/edges/fg-029/road-route") &&
      r.request().method() === "POST",
  );
  await row
    .getByRole("button", {
      name: "fg-029 авто замын маршрут авах",
      exact: true,
    })
    .click();
  const result = await saved;
  expect(result.status()).toBe(200);
  const body = await result.json();
  expect(body.edge.distance_source).toBe("osm_road_route");
  expect(body.edge.geometry.length).toBeGreaterThan(2);
  await expect(page.locator(".road-data-banner")).toContainText("45 / 45");
});
