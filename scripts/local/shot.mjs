// Screenshot a page of the local app as the seeded user, at phone size.
// Needs `npm run local:dev` running and Google Chrome installed.
//
//   node scripts/local/shot.mjs /g/local-group-trip/expenses/new \
//     --click "Enter manually" --fill "Amount=24" --out shot.png [--light]
//
// Steps run in the order given: --click <button or link name>,
// --fill <label>=<value>, --scroll <px> (scrolls the app pane).
import { chromium } from "playwright-core";
import { LOCAL_URL } from "./env.mjs";

const args = process.argv.slice(2);
const path = args.find((arg) => arg.startsWith("/")) ?? "/";
const steps = [];
let out = "shot.png";
let colorScheme = "dark";
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--out") out = args[++i];
  else if (arg === "--light") colorScheme = "light";
  else if (arg === "--click" || arg === "--fill" || arg === "--scroll") {
    steps.push([arg.slice(2), args[++i]]);
  }
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme,
  });

  await page.goto(`${LOCAL_URL}/signin?callbackUrl=${encodeURIComponent(path)}`);
  await page.getByRole("button", { name: "Verify sign-in" }).click();
  await page.waitForURL((url) => url.pathname === path);
  await page.waitForLoadState("networkidle");

  for (const [kind, value] of steps) {
    if (kind === "click") {
      await page
        .getByRole("button", { name: value })
        .or(page.getByRole("link", { name: value }))
        .first()
        .click();
    } else if (kind === "fill") {
      const [label, ...rest] = value.split("=");
      await page.getByLabel(label).first().fill(rest.join("="));
    } else if (kind === "scroll") {
      await page.mouse.wheel(0, Number(value));
    }
    await page.waitForTimeout(300);
  }

  // Hide the Next.js dev badge so it doesn't cover the tab bar.
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({ path: out });
  console.log(out);
} finally {
  await browser.close();
}
