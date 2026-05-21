import path from "node:path";
import fs from "node:fs/promises";

export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

export async function ensureClientDir(clientId: string) {
  const dir = path.join(UPLOAD_ROOT, clientId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function publicPath(absPath: string) {
  const rel = path.relative(UPLOAD_ROOT, absPath);
  return `/api/uploads/${rel.split(path.sep).join("/")}`;
}
