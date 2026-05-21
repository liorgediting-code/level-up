import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { ensureClientDir } from "./paths";
import { screenshotHtml, screenshotPdf, screenshotUrl } from "./screenshot";

type Common = { clientId: string; label: string };

export async function ingestUrl(p: Common & { url: string }) {
  const dir = await ensureClientDir(p.clientId);
  const stamp = Date.now();
  const screenshotPath = path.join(dir, `lp-${stamp}.png`);
  const htmlPath = path.join(dir, `lp-${stamp}.html`);
  const { html } = await screenshotUrl(p.url, screenshotPath);
  await fs.writeFile(htmlPath, html, "utf8");
  return prisma.landingPage.create({
    data: {
      clientId: p.clientId,
      label: p.label,
      sourceType: "url",
      sourceUrl: p.url,
      htmlPath,
      screenshotPath,
    },
  });
}

export async function ingestHtml(p: Common & { html: string }) {
  const dir = await ensureClientDir(p.clientId);
  const stamp = Date.now();
  const htmlPath = path.join(dir, `lp-${stamp}.html`);
  const screenshotPath = path.join(dir, `lp-${stamp}.png`);
  await fs.writeFile(htmlPath, p.html, "utf8");
  await screenshotHtml(p.html, screenshotPath);
  return prisma.landingPage.create({
    data: {
      clientId: p.clientId,
      label: p.label,
      sourceType: "html",
      htmlPath,
      screenshotPath,
    },
  });
}

export async function ingestPdf(p: Common & { bytes: Buffer }) {
  const dir = await ensureClientDir(p.clientId);
  const stamp = Date.now();
  const pdfPath = path.join(dir, `lp-${stamp}.pdf`);
  const screenshotPath = path.join(dir, `lp-${stamp}.png`);
  await fs.writeFile(pdfPath, p.bytes);
  await screenshotPdf(pdfPath, screenshotPath);
  return prisma.landingPage.create({
    data: {
      clientId: p.clientId,
      label: p.label,
      sourceType: "image",
      imagePath: pdfPath,
      screenshotPath,
    },
  });
}

export async function ingestImage(p: Common & { bytes: Buffer; extension: string }) {
  const dir = await ensureClientDir(p.clientId);
  const stamp = Date.now();
  const ext = p.extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
  const imagePath = path.join(dir, `lp-${stamp}.${ext}`);
  await fs.writeFile(imagePath, p.bytes);
  return prisma.landingPage.create({
    data: {
      clientId: p.clientId,
      label: p.label,
      sourceType: "image",
      imagePath,
      screenshotPath: imagePath,
    },
  });
}
