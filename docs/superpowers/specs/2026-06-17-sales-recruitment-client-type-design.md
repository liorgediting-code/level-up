# סוג לקוח חדש: השמת אנשי מכירות — מסמך עיצוב

תאריך: 2026-06-17

## רקע ומטרה

כיום לכל לקוח באפליקציה יש שני מרחבי עבודה קבועים: **אימון מכירות** ו**שיווק**
(ראו `src/app/clients/[id]/client-tabs.tsx` — שני הקישורים מקודדים קשיח). אין כל
מושג של "סוג לקוח".

המטרה: להוסיף סוג לקוח חדש — **השמת אנשי מכירות** — שאינו שיווק ואינו מכירות, אלא
תהליך השמה בעל שלבים גלובליים, תמחור לפי איש מכירות, בקרת התקדמות מלאה, וכפתור
לקישור "האקסל של הלקוח" שמוזן ידנית.

## החלטות שהתקבלו (מתוך תהליך הסיעור)

1. **מודל מעקב:** שלבים **גלובליים ללקוח** (סדרתי, gated — שלב אחד פעיל בכל רגע,
   נעול עד שמסיימים את הקודם), כמו מסעות השיווק הקיימים. **לא** פייפליין למועמדים.
2. **תמחור:** רק **מחיר לאיש מכירות** (ללא יעד כמות קבוע). מספר אנשי המכירות גמיש.
3. **מעקב אנשים:** **ללא** רשימת שמות. רק **מונה "כמה נסגרו"** + תשלומים שנוצרים
   אוטומטית לפי המחיר.
4. **כפתור אקסל:** מופיע **רק ללקוחות השמה**, בתוך מרחב ההשמה.
5. **תשלום השמה** נוצר כ-`type: "closed"` כדי לזרום לכרטיסי הפיננסים והמטריקות
   הקיימים.
6. מרחב ההשמה **אינו** מציג את חלקי השיווק/מכירות (הקלטות, ניתוח AI וכו') — מחוץ
   לסקופ.

## ארכיטקטורה

תהליך Next.js 15 יחיד (App Router), Prisma מול **PostgreSQL** (לא SQLite — ה-CLAUDE.md
מיושן בנקודה זו). מיגרציות דרך `pnpm db:push && pnpm db:generate`. עברית RTL לאורך כל
הדרך. עמודים הם server components שמעבירים נתונים מסודרים ל-`*-client.tsx`.

הפיצ'ר עוקב אחרי הדפוסים הקיימים:
- שלבים סדרתיים בהשראת `src/lib/journeys/*` (status `locked`/`active`/`done`,
  קידום/החזרה ב-`$transaction`), אך **במודל ייעודי ופשוט** ולא דרך מנגנון ה-Journey
  הווידאו-צנטרי על כל ה-sync שלו ל-Task. שלב גלובלי פשוט אינו דורש את כל המנגנון.
- תמחור דרך מודל ה-`Payment` הקיים (`src/lib/finance.ts`).

## שינויי סכמה (`prisma/schema.prisma`)

### `Client` — שני שדות חדשים
```prisma
clientType String  @default("standard")  // "standard" | "recruitment"
excelUrl   String?                        // קישור אקסל ידני (לקוחות השמה)
```
`"standard"` שומר על ההתנהגות הקיימת (שיווק+מכירות) עבור כל הלקוחות הנוכחיים.

### `Client` — relation חדש
```prisma
recruitment RecruitmentProfile?
```

### `Payment` — שדה חדש
```prisma
source String?  // "recruitment" לתשלומים שנוצרו מ"נסגר איש מכירות"; null אחרת
```
מאפשר לספור/לבטל בדיוק את תשלומי ההשמה בלי מקור-אמת כפול.

### מודל חדש `RecruitmentProfile` (1:1 עם Client)
```prisma
model RecruitmentProfile {
  clientId            String  @id
  pricePerSalesperson Float?
  currency            String  @default("ILS")
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  client Client             @relation(fields: [clientId], references: [id], onDelete: Cascade)
  stages RecruitmentStage[]
}
```

### מודל חדש `RecruitmentStage`
```prisma
model RecruitmentStage {
  id          String    @id @default(cuid())
  clientId    String
  index       Int       // 0..3
  kind        String    // "characterize" | "bring" | "interviews" | "closing"
  status      String    @default("locked")  // "locked" | "active" | "done"
  completedAt DateTime?
  note        String    @default("")

  profile RecruitmentProfile @relation(fields: [clientId], references: [clientId], onDelete: Cascade)

  @@unique([clientId, index])
  @@index([clientId])
}
```

**ארבעת השלבים** (תבנית קבועה ב-`src/lib/recruitment/stages.ts`):

| index | kind         | תווית בעברית              |
|-------|--------------|---------------------------|
| 0     | characterize | אפיון סוג איש מכירות      |
| 1     | bring        | הבאת איש מכירות           |
| 2     | interviews   | ראיונות                   |
| 3     | closing      | סגירה והכנסת איש מכירות   |

**מונה "כמה נסגרו"** = `prisma.payment.count({ where: { clientId, source: "recruitment" } })`.
אין שדה counter נפרד.

## זרימת נתונים

### יצירת לקוח
טופס `src/app/clients/new-client-form.tsx` (כיום 2 שלבים) → **3 שלבים**:
- **שלב בחירת סוג** (חדש, ראשון): שתי כרטיסיות — "שיווק / מכירות" (`standard`) או
  "השמת אנשי מכירות" (`recruitment`).
- אם `recruitment`: שדה "מחיר לאיש מכירות" + בורר מטבע. שלב מסלולי השיווק **מדולג**.
- אם `standard`: הזרימה הקיימת ללא שינוי.

`POST /api/clients` (`src/app/api/clients/route.ts`) — סכמת ה-Zod מתרחבת:
```ts
clientType: z.enum(["standard", "recruitment"]).default("standard"),
pricePerSalesperson: z.number().min(0).nullable().optional(),
currency: z.string().optional(),
```
בתוך ה-`$transaction`: אם `recruitment` — יוצר את ה-`Client` עם `clientType`, יוצר
`RecruitmentProfile`, וזורע 4 `RecruitmentStage` (index 0 = `active`, השאר `locked`).
לא נוצרים journeys.

### ניתוב / טאבים
`src/app/clients/[id]/layout.tsx` כבר טוען את הלקוח — יוסיף `clientType` ל-select ויעביר
ל-`ClientTabs`. `client-tabs.tsx` יקבל `clientType`:
- `recruitment` → כרטיס יחיד "השמת אנשי מכירות" → `/clients/[id]/recruitment`.
- `standard` → שני הכרטיסים הקיימים (אימון מכירות + שיווק).

### מרחב ההשמה `/clients/[id]/recruitment`
`page.tsx` (server) טוען `RecruitmentProfile` + `stages` (ממוין לפי index) + מונה
התשלומים, ומעביר ל-`recruitment-client.tsx`. רכיבים:

1. **בקרת שלבים** — 4 שלבים סדרתיים עם progress bar. לכל שלב סטטוס ויזואלי
   (נעול/פעיל/הושלם). כפתור "סמן כהושלם" על השלב הפעיל → מקדם (השלב → `done`,
   הבא → `active`). כפתור "החזר" על השלב האחרון שהושלם → מחזיר (הנוכחי → `locked`,
   הקודם → `active`). שדה הערה לכל שלב (אופציונלי).
2. **תמחור + מונה** — מחיר לאיש (עריך inline), מונה "נסגרו", כפתור
   "+ נסגר איש מכירות" (יוצר תשלום), "בטל אחרון". סה"כ הכנסה = מונה × מחיר.
3. **אקסל של הלקוח** — שדה URL עם כפתור שמירה ו"פתח" (target=_blank).

### API routes חדשים (כולם `runtime = "nodejs"`)
- `PATCH /api/clients/[id]/recruitment` — body `{ pricePerSalesperson?, currency?, excelUrl? }`.
  מעדכן את ה-`RecruitmentProfile` ו/או `Client.excelUrl`.
- `PATCH /api/clients/[id]/recruitment/stages` — body `{ index, action: "advance" | "revert" }`
  או `{ index, note }`. מבצע את המעבר בתוך `$transaction` (לוגיקה ב-`src/lib/recruitment/progress.ts`).
- `POST /api/clients/[id]/recruitment/placements` — יוצר
  `Payment{ type: "closed", amount: pricePerSalesperson, currency, source: "recruitment", note: "השמת איש מכירות" }`.
  מחזיר 409 אם אין מחיר מוגדר.
- `DELETE /api/clients/[id]/recruitment/placements` — מוחק את תשלום ההשמה האחרון
  (`source="recruitment"`, ממוין `occurredAt desc`).

## טיפול בשגיאות

- Zod `safeParse` → 400 על קלט לא תקין (דפוס קיים). שגיאות שמגיעות ל-`alert()` בצד
  לקוח — משוטחות למחרוזת.
- קידום שלב שאינו `active`, או החזרה של שלב שאינו `done` → 409 עם הודעה ברורה.
- יצירת placement ללא `pricePerSalesperson` → 409.
- ביטול placement כשאין תשלומי השמה → 409.
- צד לקוח `fetch()` ואז `router.refresh()` (אין cache בצד לקוח).

## בידוד ובדיקות

- `src/lib/recruitment/stages.ts` — תבנית השלבים (טהור, ניתן לבדיקה ללא DB).
- `src/lib/recruitment/progress.ts` — `advanceStageInTx` / `revertStageInTx` (פונקציות
  טרנזקציה ממוקדות, בהשראת `src/lib/journeys/advance.ts`).
- אין test suite בריפו; אימות דרך `pnpm typecheck` והרצת זרימה ידנית.

## מחוץ לסקופ

- רשימת מועמדים בשמות / פייפליין למועמד בודד.
- יעד כמות אנשי מכירות.
- מרחבי שיווק/מכירות עבור לקוח השמה.
- שינוי סוג לקוח קיים (אפשר להוסיף מאוחר יותר).
