import { chromium } from "playwright";

export async function screenshotUrl(url: string, outPath: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    const html = await page.content();
    await page.screenshot({ path: outPath, fullPage: true });
    return { html };
  } finally {
    await browser.close();
  }
}

export async function screenshotHtml(html: string, outPath: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: "networkidle", timeout: 30_000 });
    await page.screenshot({ path: outPath, fullPage: true });
  } finally {
    await browser.close();
  }
}

/** Render the first page of a PDF file to a PNG using Chromium's built-in viewer. */
export async function screenshotPdf(pdfPath: string, outPath: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 1800 } });
    const page = await ctx.newPage();
    const url = `file://${pdfPath}`;
    await page.goto(url, { waitUntil: "load", timeout: 30_000 }).catch(() => {});
    // The PDF viewer renders the page into a canvas; wait briefly for it to paint.
    await page.waitForTimeout(2000);
    await page.screenshot({ path: outPath, fullPage: false });
  } finally {
    await browser.close();
  }
}
