import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const CATEGORIES = ["salary", "tools", "office", "other"] as const;

const Body = z.object({
  label: z.string().min(1).max(120),
  amount: z.number().positive(),
  date: z.string().min(8), // ISO date string YYYY-MM-DD
  category: z.enum(CATEGORIES).default("other"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const d = parsed.data;
  const expense = await prisma.businessExpense.create({
    data: {
      label: d.label.trim(),
      amount: d.amount,
      date: new Date(d.date),
      category: d.category,
    },
  });
  return NextResponse.json(
    {
      id: expense.id,
      label: expense.label,
      amount: expense.amount,
      date: expense.date.toISOString(),
      category: expense.category,
    },
    { status: 201 }
  );
}
