import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  pricePerSalesperson: z.number().min(0).nullable().optional(),
  currency: z.string().optional(),
  excelUrl: z.string().url().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().formErrors.join(", ") || "קלט לא תקין" },
      { status: 400 },
    );
  }

  const { pricePerSalesperson, currency, excelUrl } = parsed.data;

  if (excelUrl !== undefined) {
    await prisma.client.update({ where: { id }, data: { excelUrl } });
  }
  if (pricePerSalesperson !== undefined || currency !== undefined) {
    await prisma.recruitmentProfile.update({
      where: { clientId: id },
      data: {
        ...(pricePerSalesperson !== undefined ? { pricePerSalesperson } : {}),
        ...(currency !== undefined ? { currency } : {}),
      },
    });
  }
  return NextResponse.json({ ok: true });
}
