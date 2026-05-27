import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { prisma } from "@/lib/db";
import AppShell from "./_shell/app-shell";

const heebo = Heebo({
  subsets: ["latin", "hebrew"],
  variable: "--font-heebo",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "לבל אפ — סוכנות שיווק ואימון מכירות",
  description: "ניהול לקוחות, קמפיינים במטא, דפי נחיתה וניתוח משפך עם AI.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let unread = 0;
  try {
    unread = await prisma.lead.count({ where: { viewedAt: null } });
  } catch {
    // Lead table may not exist yet on a fresh checkout; tolerate gracefully.
  }

  return (
    <html lang="he" dir="rtl" className={heebo.variable} suppressHydrationWarning>
      <head>
        {/* Apply saved accent theme + night mode before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement;if(localStorage.getItem('astral-theme')==='blue')d.setAttribute('data-theme','blue');if(localStorage.getItem('astral-mode')==='dark')d.setAttribute('data-mode','dark')}catch(e){}`,
          }}
        />
      </head>
      <body>
        <AppShell unread={unread}>{children}</AppShell>
      </body>
    </html>
  );
}
