import { prisma } from "@/lib/db";
import JourneysClient, { type JourneyView } from "./journeys-client";

export const dynamic = "force-dynamic";

export default async function JourneysPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const journeys = await prisma.journey.findMany({
    where: { clientId: id },
    orderBy: { kind: "asc" },
    include: {
      stages: {
        orderBy: { index: "asc" },
        include: {
          videoItems: { orderBy: { index: "asc" } },
        },
      },
    },
  });
  const view: JourneyView[] = journeys.map((j) => ({
    id: j.id,
    kind: j.kind as "organic" | "paid",
    videoCount: j.videoCount,
    status: j.status as "active" | "completed",
    currentStageIndex: j.currentStageIndex,
    stages: j.stages.map((s) => ({
      id: s.id,
      index: s.index,
      kind: s.kind as JourneyView["stages"][number]["kind"],
      mode: s.mode as "single" | "per_video",
      status: s.status as "locked" | "active" | "done",
      docLink: s.docLink,
      filmingDate: s.filmingDate?.toISOString() ?? null,
      videoItems: s.videoItems.map((v) => ({ index: v.index, done: v.done })),
    })),
  }));
  return <JourneysClient clientId={id} journeys={view} />;
}
