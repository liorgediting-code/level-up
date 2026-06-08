import { prisma } from "@/lib/db";
import TeamClient from "./team-client";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  // Seed on first load if table is empty
  const count = await prisma.teamMember.count();
  if (count === 0) {
    await prisma.teamMember.createMany({
      data: [
        { name: "ליאב", role: "מנהל שיווק", isAI: false, order: 0 },
        { name: "ליאור", role: "מנהל לקוחות", isAI: false, order: 1 },
        { name: "AI 🤖", role: "בינה מלאכותית", isAI: true, order: 99 },
      ],
    });
  }

  const members = await prisma.teamMember.findMany({
    orderBy: { order: "asc" },
    include: {
      responsibilities: { orderBy: { order: "asc" } },
    },
  });

  return (
    <TeamClient
      members={members.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        isAI: m.isAI,
        responsibilities: m.responsibilities.map((r) => ({
          id: r.id,
          label: r.label,
          isAiHandled: r.isAiHandled,
        })),
      }))}
    />
  );
}
