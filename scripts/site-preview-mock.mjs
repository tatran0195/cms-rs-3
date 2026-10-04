#!/usr/bin/env node
/**
 * Dependency-free mock of the public site API used by the published-docs reader.
 *
 * Serves a bilingual (en + ar/RTL) documentation site for four mock project ids
 * so the reader (apps/app, port 4310) can be exercised without Docker, Postgres,
 * or the real API:
 *
 *   preview-harbor      theme preset "harbor"
 *   preview-manuscript  theme preset "manuscript"
 *   preview-signal      theme preset "signal"
 *   preview-legacy      no `theme` config (legacy palette branch)
 *
 * Endpoints (mirroring apps/server/src/modules/public/sites/handlers.ts):
 *   GET  /api/public/sites/:id?lang=&version=            -> { data: SiteShell }
 *   GET  /api/public/sites/:id/page?path=&lang=&version= -> { data: SitePage } (404 JSON for unknown paths)
 *   GET  /api/public/sites/:id/search                    -> { data: { hits: [] } }
 *   GET  /api/public/sites/:id/changelog                 -> { data: [] }
 *   GET  /api/public/assets/*                            -> a generated SVG (the sample image)
 *   ANY  /api/**                                         -> 204 (events, analytics, anything else)
 *
 * Usage: node scripts/site-preview-mock.mjs [--port 4311]
 * Then:  bun --filter @cms/app dev   # proxies /api/** to http://localhost:4311
 *        open http://localhost:4310/sites/preview-harbor?lang=he
 */
import { createServer } from 'node:http';

const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const PORT = Number(portFlag === -1 ? (process.env.PORT ?? 4311) : args[portFlag + 1]) || 4311;

const GENERATED_AT = '2026-09-01T09:00:00.000Z';
const VERSIONS = [{ id: 'ver_latest', name: 'Latest', slug: 'latest', isDefault: true }];
const LANGUAGES = [
  { code: 'en', label: 'English', direction: 'LTR', isDefault: true, enabled: true },
  { code: 'he', label: 'עברית', direction: 'RTL', isDefault: false, enabled: true },
];

// ─── Sample image (served under /api/public/assets so the dev proxy routes it) ─

const DIAGRAM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 420" width="960" height="420" font-family="Segoe UI, sans-serif">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#c2410c"/></linearGradient></defs>
  <rect width="960" height="420" rx="18" fill="#f6f4ef"/>
  <rect x="48" y="60" width="240" height="120" rx="14" fill="#fff" stroke="#d6d3cd"/>
  <text x="168" y="112" text-anchor="middle" font-size="22" fill="#1c1917">Your app</text>
  <text x="168" y="144" text-anchor="middle" font-size="14" fill="#78716c">POST /v1/shipments</text>
  <rect x="360" y="60" width="240" height="120" rx="14" fill="#fff" stroke="#d6d3cd"/>
  <text x="480" y="112" text-anchor="middle" font-size="22" fill="#1c1917">Tidewater API</text>
  <text x="480" y="144" text-anchor="middle" font-size="14" fill="#78716c">Bearer tw_live_…</text>
  <rect x="672" y="60" width="240" height="120" rx="14" fill="#fff" stroke="#d6d3cd"/>
  <text x="792" y="112" text-anchor="middle" font-size="22" fill="#1c1917">Carrier network</text>
  <text x="792" y="144" text-anchor="middle" font-size="14" fill="#78716c">12 carriers, 40 ports</text>
  <path d="M288 120 H360 M600 120 H672" stroke="url(#g)" stroke-width="4" fill="none"/>
  <rect x="360" y="250" width="240" height="100" rx="14" fill="#fff" stroke="#d6d3cd"/>
  <text x="480" y="295" text-anchor="middle" font-size="20" fill="#1c1917">Webhooks</text>
  <text x="480" y="322" text-anchor="middle" font-size="14" fill="#78716c">shipment.updated</text>
  <path d="M480 180 V250" stroke="url(#g)" stroke-width="4" fill="none" stroke-dasharray="8 6"/>
</svg>`;

// ─── Content ─────────────────────────────────────────────────────────────────
// Each page has the same slug in both languages (alternates map 1:1). The
// Markdown deliberately covers everything the reader renders: h2/h3, inline
// code, links, ordered + bulleted lists, tables, bash + ts fences, callouts,
// Tabs, CardGroup/Card, Steps, Accordion, an image, a blockquote.

const GROUPS = [
  { slug: 'getting-started', icon: 'rocket', title: { en: 'Getting started', he: 'התחלה' } },
  { slug: 'guides', icon: 'book-open', title: { en: 'Guides', he: 'מדריכים' } },
  { slug: 'reference', icon: 'braces', title: { en: 'Reference', he: 'תיעוד' } },
];

const CURL_SHIPMENT = `\`\`\`bash
curl https://api.tidewater.dev/v1/shipments \\
  -H "Authorization: Bearer tw_live_9f3c…" \\
  -H "Content-Type: application/json" \\
  -d '{"origin":"AEJEA","destination":"NLRTM","containers":2}'
\`\`\``;

const TS_CLIENT = `\`\`\`ts title="shipments.ts"
import { Tidewater } from '@tidewater/sdk';

const client = new Tidewater({ apiKey: process.env.TIDEWATER_KEY! });

const shipment = await client.shipments.create({
  origin: 'AEJEA',
  destination: 'NLRTM',
  containers: 2,
});

console.log(shipment.id, shipment.eta);
\`\`\``;

const PAGES = [
  {
    group: 'getting-started',
    slug: 'introduction',
    icon: 'compass',
    en: {
      title: 'Introduction',
      description: 'Tidewater is a shipping API for booking, tracking, and settling container freight from one integration.',
      content: `Tidewater gives your product a single, well-documented surface for the messy world of ocean freight. You create a **shipment**, we negotiate with carriers, and you receive \`shipment.updated\` webhooks as the containers move.

## What you can build

<CardGroup cols="2">
  <Card title="Book freight" icon="ship" href="/guides/webhooks">
    Create shipments between any of 40 supported ports with one request.
  </Card>
  <Card title="Track containers" icon="radar" href="/guides/webhooks">
    Subscribe to live position and customs events instead of polling.
  </Card>
  <Card title="Authenticate" icon="key" href="/guides/authentication">
    Scoped API keys, rotating secrets, and per-environment credentials.
  </Card>
  <Card title="Handle errors" icon="shield-alert" href="/guides/errors">
    Every failure has a stable code, a human message, and a retry hint.
  </Card>
</CardGroup>

## How it fits together

<Frame caption="A shipment request flows through the API to the carrier network; state changes come back as webhooks.">
![Tidewater architecture](/api/public/assets/preview/architecture.svg)
</Frame>

The API is organised around three resources:

- **Shipments** — a booking between an origin and a destination port.
- **Containers** — the physical boxes attached to a shipment, each with its own tracking history.
- **Documents** — bills of lading, customs declarations, and invoices generated on your behalf.

<Callout type="info">
All endpoints are versioned under \`/v1\`. Breaking changes ship under a new prefix and the previous version stays available for at least twelve months.
</Callout>

## Next steps

1. [Install the SDK](/getting-started/installation) for your language.
2. Follow the [quickstart](/getting-started/quickstart) to book a test shipment.
3. Read about [authentication](/guides/authentication) before going live.`,
    },
    he: {
      title: 'מבוא',
      description: 'Tidewater היא ממשק API לשילוח ימי המאפשר הזמנה, מעקב והסדרה של מטעני מכולות מאינטגרציה אחת.',
      content: `Tidewater מעניקה למוצר שלכם ממשק אחיד ומתועד היטב לעולם המורכב של שילוח ימי. אתם יוצרים **משלוח**, אנחנו מנהלים משא ומתן עם המובילים, ואתם מקבלים התראות \`shipment.updated\` ככל שהמכולות נעות.

## מה ניתן לבנות

<CardGroup cols="2">
  <Card title="הזמנת שילוח" icon="ship" href="/guides/webhooks">
    צרו משלוחים בין כל אחד מ-40 הנמלים הנתמכים בבקשה אחת.
  </Card>
  <Card title="מעקב אחר מכולות" icon="radar" href="/guides/webhooks">
    הירשמו לאירועי מיקום ומכס חיים במקום ביצוע פניות חוזרות.
  </Card>
  <Card title="אימות" icon="key" href="/guides/authentication">
    מפתחות API מוגדרי טווח, סודות מתחלפים ואישורי גישה לכל סביבה.
  </Card>
  <Card title="טיפול בשגיאות" icon="shield-alert" href="/guides/errors">
    לכל כשל יש קוד קבוע, הודעה ברורה ורמז לניסיון חוזר.
  </Card>
</CardGroup>

## כיצד החלקים משתלבים

<Frame caption="בקשת משלוח עוברת דרך ה-API לרשת המובילים; שינויי סטטוס חוזרים כהתראות webhook.">
![ארכיטקטורת Tidewater](/api/public/assets/preview/architecture.svg)
</Frame>

ה-API מאורגן סביב שלושה משאבים:

- **משלוחים** — הזמנה בין נמל מוצא לנמל יעד.
- **מכולות** — הקופסאות הפיזיות המשויכות למשלוח, לכל אחת היסטוריית מעקב משלה.
- **מסמכים** — שטרי מטען, הצהרות מכס וחשבוניות המופקים עבורכם.

<Callout type="info">
כל נקודות הקצה מנוהלות תחת \`/v1\`. שינויים מהותיים יוצאים תחת קידומת חדשה והגרסה הקודמת נשארת זמינה למשך 12 חודשים לפחות.
</Callout>

## הצעדים הבאים

1. [התקינו את ה-SDK](/getting-started/installation) עבור השפה שלכם.
2. עקבו אחר [מדריך ההתחלה המהירה](/getting-started/quickstart) להזמנת משלוח ניסיון.
3. קראו על [אימות](/guides/authentication) לפני העלייה לסביבת ייצור.`,
    },
  },
  {
    group: 'getting-started',
    slug: 'installation',
    icon: 'download',
    en: {
      title: 'Installation',
      description: 'Install the official SDK or call the REST API directly.',
      content: `The SDK wraps the REST API with typed methods, automatic retries, and webhook signature verification.

## Install the SDK

<Tabs>
  <Tab title="npm">
\`\`\`bash
npm install @tidewater/sdk
\`\`\`
  </Tab>
  <Tab title="pnpm">
\`\`\`bash
pnpm add @tidewater/sdk
\`\`\`
  </Tab>
  <Tab title="Python">
\`\`\`bash
pip install tidewater
\`\`\`
  </Tab>
</Tabs>

## Configure credentials

<Steps>
  <Step title="Create an API key">
    Open **Settings → API keys** in the dashboard and create a key scoped to the \`sandbox\` environment.
  </Step>
  <Step title="Store it as an environment variable">
\`\`\`bash
export TIDEWATER_KEY="tw_test_4b1e…"
\`\`\`
  </Step>
  <Step title="Verify the connection">
    Call \`client.ping()\` — a healthy response returns the environment name and the rate-limit headroom.
  </Step>
</Steps>

<Callout type="warning">
Never commit live keys. Sandbox keys start with \`tw_test_\`, live keys with \`tw_live_\`; the API rejects a live key sent to the sandbox host.
</Callout>

## Supported runtimes

| Runtime | Minimum version | Notes |
| --- | --- | --- |
| Node.js | 20 | Native \`fetch\`, ESM and CJS builds |
| Bun | 1.1 | Uses the Node build |
| Python | 3.10 | Async client via \`tidewater.aio\` |
| Deno | 1.44 | Import from npm: specifier |`,
    },
    he: {
      title: 'התקנה',
      description: 'התקינו את ה-SDK הרשמי או בצעו קריאות ישירות ל-REST API.',
      content: `ה-SDK עוטף את ה-REST API במתודות בעלות טיפוסים, ניסיונות חוזרים אוטומטיים ואימות חתימות של webhooks.

## התקנת ה-SDK

<Tabs>
  <Tab title="npm">
\`\`\`bash
npm install @tidewater/sdk
\`\`\`
  </Tab>
  <Tab title="pnpm">
\`\`\`bash
pnpm add @tidewater/sdk
\`\`\`
  </Tab>
  <Tab title="Python">
\`\`\`bash
pip install tidewater
\`\`\`
  </Tab>
</Tabs>

## הגדרת פרטי גישה

<Steps>
  <Step title="יצירת מפתח API">
    פתחו את **הגדרות ← מפתחות API** בלוח הבקרה וצרו מפתח המוגבל לסביבת \`sandbox\`.
  </Step>
  <Step title="שמירה כמשתנה סביבה">
\`\`\`bash
export TIDEWATER_KEY="tw_test_4b1e…"
\`\`\`
  </Step>
  <Step title="אימות החיבור">
    קראו ל-\`client.ping()\` — תגובה תקינה מחזירה את שם הסביבה ואת מגבלת הקצב הנותרת.
  </Step>
</Steps>

<Callout type="warning">
לעולם אל תשמרו מפתחות ייצור (live) במאגר הקוד. מפתחות בדיקה מתחילים ב-\`tw_test_\`, מפתחות ייצור ב-\`tw_live_\`; ה-API דוחה מפתח ייצור שנשלח לשרת הבדיקות (sandbox).
</Callout>

## סביבות הרצה נתמכות

| סביבת הרצה | גרסה מינימלית | הערות |
| --- | --- | --- |
| Node.js | 20 | \`fetch\` מובנה, גרסאות ESM ו-CJS |
| Bun | 1.1 | משתמש בגרסת Node |
| Python | 3.10 | לקוח אסינכרוני דרך \`tidewater.aio\` |
| Deno | 1.44 | ייבוא באמצעות מזהה npm: |`,
    },
  },
  {
    group: 'getting-started',
    slug: 'quickstart',
    icon: 'zap',
    tag: 'New',
    en: {
      title: 'Quickstart',
      description: 'Book your first sandbox shipment in under five minutes.',
      content: `This walkthrough creates a shipment from Jebel Ali to Rotterdam in the sandbox and watches it move.

## Create a shipment

${TS_CLIENT}

The same call over plain HTTP:

${CURL_SHIPMENT}

## Read the response

\`\`\`json
{
  "id": "shp_01J9X3K2",
  "status": "booked",
  "eta": "2026-09-28T06:00:00Z",
  "containers": ["cnt_7f1a", "cnt_7f1b"]
}
\`\`\`

## Watch it move

In the sandbox, shipments advance through their lifecycle every thirty seconds so you can test your webhook handlers without waiting for a real vessel.

1. Register a webhook endpoint (see [Webhooks](/guides/webhooks)).
2. Create the shipment above.
3. Expect \`shipment.updated\` events for \`booked → loaded → at_sea → arrived\`.

<Tip>
Pass \`"speed": "fast"\` in the sandbox request body to compress the whole lifecycle into about two minutes.
</Tip>

> Sandbox data is wiped every Sunday at 02:00 UTC. Anything you need to keep should be recreated by your test setup.`,
    },
    he: {
      title: 'מדריך התחלה מהירה',
      description: 'הזמינו את משלוח הבדיקה הראשון שלכם תוך פחות מחמש דקות.',
      content: `מדריך זה יוצר משלוח מג'בל עלי לרוטרדם בסביבת הבדיקות ועוקב אחר התקדמותו.

## יצירת משלוח

${TS_CLIENT}

אותה קריאה באמצעות HTTP ישיר:

${CURL_SHIPMENT}

## קריאת התגובה

\`\`\`json
{
  "id": "shp_01J9X3K2",
  "status": "booked",
  "eta": "2026-09-28T06:00:00Z",
  "containers": ["cnt_7f1a", "cnt_7f1b"]
}
\`\`\`

## מעקב אחר המשלוח

בסביבת הבדיקות, משלוחים מתקדמים במחזור החיים שלהם בכל שלושים שניות כדי שתוכלו לבדוק את מטפלי ה-webhook מבלי להמתין לאונייה אמיתית.

1. רשמו נקודת קצה ל-webhook (ראו [Webhooks](/guides/webhooks)).
2. צרו את המשלוח שלמעלה.
3. צפו לאירועי \`shipment.updated\` עבור המצבים \`booked → loaded → at_sea → arrived\`.

<Tip>
העבירו \`"speed": "fast"\` בגוף הבקשה בסביבת הבדיקות כדי לדחוס את כל מחזור החיים לכשתי דקות.
</Tip>

> הנתונים בסביבת הבדיקות נמחקים מדי יום ראשון בשעה 02:00 UTC. כל מה שנדרש להמשך יש לשחזר באמצעות תהליך הבדיקות שלכם.`,
    },
  },
  {
    group: 'guides',
    slug: 'authentication',
    icon: 'key',
    en: {
      title: 'Authentication',
      description: 'Authenticate requests with scoped API keys, and rotate them without downtime.',
      content: `Every request to Tidewater carries a bearer token. Keys are scoped to an **environment** (\`sandbox\` or \`live\`) and to a set of **permissions**, so a key that only tracks containers can never create a booking.

## Send the token

Pass the key in the \`Authorization\` header. Requests without it — or with a key from the wrong environment — return \`401 unauthorized\`.

${CURL_SHIPMENT}

### From the SDK

The SDK reads \`TIDEWATER_KEY\` automatically, or you can pass it explicitly:

\`\`\`ts
import { Tidewater } from '@tidewater/sdk';

export const tidewater = new Tidewater({
  apiKey: process.env.TIDEWATER_KEY!,
  environment: 'live',
  maxRetries: 3,
});
\`\`\`

<Callout type="info">
Keys are hashed at rest and shown only once when created. If you lose one, revoke it and create a replacement.
</Callout>

## Choose a key type

<Tabs>
  <Tab title="Server keys">
    Full-permission keys for trusted backends. Never ship them in a browser or a mobile app.

    - Prefix: \`tw_live_\` or \`tw_test_\`
    - Rate limit: 600 requests per minute
  </Tab>
  <Tab title="Restricted keys">
    Keys with an explicit permission list — ideal for partners, CI, or internal tools.

    - Prefix: \`tw_rk_\`
    - Rate limit: 120 requests per minute
  </Tab>
  <Tab title="Publishable keys">
    Read-only keys safe to embed in client code for tracking widgets.

    - Prefix: \`tw_pk_\`
    - Rate limit: 60 requests per minute per IP
  </Tab>
</Tabs>

## Permissions

| Permission | Grants | Typical use |
| --- | --- | --- |
| \`shipments:read\` | List and retrieve shipments | Dashboards, tracking pages |
| \`shipments:write\` | Create, amend, and cancel shipments | Booking flows |
| \`documents:read\` | Download generated documents | Customs brokers |
| \`webhooks:manage\` | Register and rotate endpoints | Infrastructure automation |

<Warning>
A key with \`shipments:write\` can incur real charges in the live environment. Restrict it to the services that need it.
</Warning>

## Rotate a key without downtime

<Steps>
  <Step title="Create the replacement">
    Create a new key with the same permissions. Both keys are valid at the same time.
  </Step>
  <Step title="Deploy the new key">
    Update your secret store and roll your services. Watch the **Last used** column in the dashboard.
  </Step>
  <Step title="Revoke the old key">
    Once the old key shows no traffic for a full day, revoke it. Revocation is immediate and cannot be undone.
  </Step>
</Steps>

## Common questions

<AccordionGroup>
  <Accordion title="Can one key work in both environments?">
    No. Environments are fully isolated; a sandbox key sent to the live host is rejected before any handler runs.
  </Accordion>
  <Accordion title="How do I authenticate webhooks?">
    Webhooks are signed with a separate secret. See [Webhooks](/guides/webhooks) for the verification snippet.
  </Accordion>
  <Accordion title="Do you support OAuth?" defaultOpen>
    OAuth 2.0 client credentials are available on the Enterprise plan for partners who act on behalf of many accounts.
  </Accordion>
</AccordionGroup>

<CardGroup cols="2">
  <Card title="Webhooks" icon="webhook" href="/guides/webhooks">
    Verify signatures and handle retries.
  </Card>
  <Card title="Error codes" icon="shield-alert" href="/guides/errors">
    Every \`401\` and \`403\` explained.
  </Card>
</CardGroup>

> Treat API keys like passwords: store them in a secrets manager, never in source control, and rotate them on a schedule.`,
    },
    he: {
      title: 'אימות',
      description: 'אימות בקשות באמצעות מפתחות API מוגדרי טווח, והחלפתם ללא השבתה.',
      content: `כל בקשה ל-Tidewater נושאת טוקן מסוג Bearer. המפתחות מוגדרים לפי **סביבה** (\`sandbox\` או \`live\`) ולפי קבוצת **הרשאות**, כך שמפתח המשמש רק למעקב מכולות אינו יכול ליצור הזמנה.

## שליחת הטוקן

העבירו את המפתח בכותרת \`Authorization\`. בקשות ללא המפתח — או עם מפתח מסביבה שגויה — יחזירו תגובת \`401 unauthorized\`.

${CURL_SHIPMENT}

### באמצעות ה-SDK

ה-SDK קורא את \`TIDEWATER_KEY\` באופן אוטומטי, או שתוכלו להעביר אותו מפורשות:

\`\`\`ts
import { Tidewater } from '@tidewater/sdk';

export const tidewater = new Tidewater({
  apiKey: process.env.TIDEWATER_KEY!,
  environment: 'live',
  maxRetries: 3,
});
\`\`\`

<Callout type="info">
מפתחות נשמרים כ-hash ומוצגים פעם אחת בלבד בעת יצירתם. אם איבדתם מפתח, בטלו אותו וצרו מפתח חלופי.
</Callout>

## בחירת סוג מפתח

<Tabs>
  <Tab title="מפתחות שרת">
    מפתחות בעלי הרשאות מלאות עבור שרתי backend מהימנים. לעולם אל תפיצו אותם בדפדפן או באפליקציית מובייל.

    - קידומת: \`tw_live_\` או \`tw_test_\`
    - מגבלת קצב: 600 בקשות לדקה
  </Tab>
  <Tab title="מפתחות מוגבלים">
    מפתחות עם רשימת הרשאות מפורשת — אידיאליים לשותפים, CI או כלים פנימיים.

    - קידומת: \`tw_rk_\`
    - מגבלת קצב: 120 בקשות לדקה
  </Tab>
  <Tab title="מפתחות לקריאה בלבד">
    מפתחות לקריאה בלבד שניתן להטמיע בבטחה בקוד צד לקוח עבור יישומוני מעקב.

    - קידומת: \`tw_pk_\`
    - מגבלת קצב: 60 בקשות לדקה לכל כתובת IP
  </Tab>
</Tabs>

## הרשאות

| הרשאה | הענקת גישה | שימוש נפוץ |
| --- | --- | --- |
| \`shipments:read\` | הצגת וקבלת משלוחים | לוחות בקרה, דפי מעקב |
| \`shipments:write\` | יצירה, עדכון וביטול משלוחים | תהליכי הזמנה |
| \`documents:read\` | הורדת מסמכים שנוצרו | עמילי מכס |
| \`webhooks:manage\` | רישום ורוטציית נקודות קצה | אוטומציית תשתית |

<Warning>
מפתח עם הרשאת \`shipments:write\` עלול לחייב עלויות ממשיות בסביבת הייצור. הגבילו אותו לשירותים שזקוקים לו בלבד.
</Warning>

## רוטציית מפתחות ללא השבתה

<Steps>
  <Step title="יצירת מפתח חלופי">
    צרו מפתח חדש עם אותן הרשאות. שני המפתחות תקפים בו-זמנית.
  </Step>
  <Step title="פריסת המפתח החדש">
    עדכנו את מנהל הסודות שלכם ופרסו את השירותים מחדש. עקבו אחר עמודת **שימוש אחרון** בלוח הבקרה.
  </Step>
  <Step title="ביטול המפתח הישן">
    ברגע שהמפתח הישן אינו מציג תעבורה במשך יום שלם, בטלו אותו. הביטול מיידי ואינו ניתן להפיכה.
  </Step>
</Steps>

## שאלות נפוצות

<AccordionGroup>
  <Accordion title="האם מפתח אחד יכול לפעול בשתי הסביבות?">
    לא. הסביבות מבודדות לחלוטין; מפתח sandbox שנשלח לשרת הייצור יידחה לפני הפעלת מטפל כלשהו.
  </Accordion>
  <Accordion title="כיצד מאמתים webhooks?">
    Webhooks נחתמים באמצעות סוד נפרד. ראו [Webhooks](/guides/webhooks) לקוד האימות.
  </Accordion>
  <Accordion title="האם יש תמיכה ב-OAuth?" defaultOpen>
    אישורי לקוח OAuth 2.0 זמינים במסגרת תוכנית Enterprise עבור שותפים הפועלים בשם חשבונות מרובים.
  </Accordion>
</AccordionGroup>

<CardGroup cols="2">
  <Card title="Webhooks" icon="webhook" href="/guides/webhooks">
    אימות חתימות וטיפול בניסיונות חוזרים.
  </Card>
  <Card title="קודי שגיאה" icon="shield-alert" href="/guides/errors">
    הסבר מפורט על כל שגיאת \`401\` ו-\`403\`.
  </Card>
</CardGroup>

> התייחסו למפתחות API כאל סיסמאות: שמרו אותם במנהל סודות, לעולם לא בניהול גרסאות, ובצעו רוטציה תקופתית.`,
    },
  },
  {
    group: 'guides',
    slug: 'webhooks',
    icon: 'webhook',
    en: {
      title: 'Webhooks',
      description: 'Receive shipment events on your own endpoint and verify their signatures.',
      content: `Webhooks push state changes to an HTTPS endpoint you control, so you never poll.

## Register an endpoint

\`\`\`bash
curl -X POST https://api.tidewater.dev/v1/webhooks \\
  -H "Authorization: Bearer tw_live_9f3c…" \\
  -d '{"url":"https://example.com/hooks/tidewater","events":["shipment.updated"]}'
\`\`\`

## Verify the signature

\`\`\`ts
import { verifyWebhook } from '@tidewater/sdk';

export async function handler(request: Request) {
  const event = await verifyWebhook(request, process.env.TIDEWATER_WEBHOOK_SECRET!);
  if (event.type === 'shipment.updated') {
    await db.shipments.update(event.data.id, { status: event.data.status });
  }
  return new Response(null, { status: 204 });
}
\`\`\`

## Event catalogue

| Event | When | Payload |
| --- | --- | --- |
| \`shipment.updated\` | Any lifecycle change | The full shipment |
| \`container.position\` | Every AIS position fix | Container id, coordinates, timestamp |
| \`document.ready\` | A generated document is available | Document id and download URL |

<Callout type="tip">
Respond with a \`2xx\` within five seconds. Slower endpoints are retried with exponential backoff for up to 24 hours.
</Callout>`,
    },
    he: {
      title: 'Webhooks',
      description: 'קבלו אירועי משלוחים בנקודת קצה משלכם ואמתו את חתימותיהם.',
      content: `Webhooks דוחפים שינויי סטטוס לנקודת קצה מסוג HTTPS שבשליטתכם, ללא צורך בפניות חוזרות (polling).

## רישום נקודת קצה

\`\`\`bash
curl -X POST https://api.tidewater.dev/v1/webhooks \\
  -H "Authorization: Bearer tw_live_9f3c…" \\
  -d '{"url":"https://example.com/hooks/tidewater","events":["shipment.updated"]}'
\`\`\`

## אימות החתימה

\`\`\`ts
import { verifyWebhook } from '@tidewater/sdk';

export async function handler(request: Request) {
  const event = await verifyWebhook(request, process.env.TIDEWATER_WEBHOOK_SECRET!);
  if (event.type === 'shipment.updated') {
    await db.shipments.update(event.data.id, { status: event.data.status });
  }
  return new Response(null, { status: 204 });
}
\`\`\`

## קטלוג אירועים

| אירוע | מתי נשלח | תוכן המטען |
| --- | --- | --- |
| \`shipment.updated\` | כל שינוי במחזור החיים | נתוני המשלוח המלאים |
| \`container.position\` | כל עדכון מיקום מ-AIS | מזהה מכולה, קואורדינטות, חותמת זמן |
| \`document.ready\` | מסמך שנוצר זמין להורדה | מזהה מסמך וכתובת URL להורדה |

<Callout type="tip">
החזירו קוד \`2xx\` בתוך 5 שניות. עבור נקודות קצה איטיות יותר יבוצעו ניסיונות חוזרים במרווחי זמן מעריכיים למשך עד 24 שעות.
</Callout>`,
    },
  },
  {
    group: 'guides',
    slug: 'errors',
    icon: 'shield-alert',
    en: {
      title: 'Error handling',
      description: 'Every error carries a stable code, a readable message, and whether a retry is safe.',
      content: `Errors use conventional HTTP status codes and a JSON body you can branch on.

\`\`\`json
{
  "error": {
    "code": "port_not_supported",
    "message": "Port 'XXABC' is not in the Tidewater network.",
    "retryable": false
  }
}
\`\`\`

## Status codes

| Status | Meaning | Retry? |
| --- | --- | --- |
| \`400\` | Malformed request body | No |
| \`401\` | Missing or invalid API key | No |
| \`403\` | Key lacks the required permission | No |
| \`404\` | Resource does not exist in this environment | No |
| \`409\` | The shipment changed while you were amending it | Yes, after refetch |
| \`429\` | Rate limit exceeded | Yes, after \`Retry-After\` |
| \`5xx\` | Tidewater problem | Yes, with backoff |

<Danger>
Do not retry \`400\`–\`404\` responses automatically: the request will fail identically and count against your rate limit.
</Danger>

## Idempotency

Send an \`Idempotency-Key\` header on every \`POST\`. Replays within 24 hours return the original response instead of creating a duplicate booking.`,
    },
    he: {
      title: 'טיפול בשגיאות',
      description: 'כל שגיאה כוללת קוד קבוע, הודעה קריאה וחיווי האם ניסיון חוזר הינו בטוח.',
      content: `שגיאות משתמשות בקודי מצב מקובלים של HTTP ובגוף JSON המאפשר הסתעפות לוגית.

\`\`\`json
{
  "error": {
    "code": "port_not_supported",
    "message": "Port 'XXABC' is not in the Tidewater network.",
    "retryable": false
  }
}
\`\`\`

## קודי מצב

| קוד | משמעות | ניסיון חוזר? |
| --- | --- | --- |
| \`400\` | גוף בקשה לא תקין | לא |
| \`401\` | מפתח API חסר או לא תקין | לא |
| \`403\` | למפתח חסרה ההרשאה הנדרשת | לא |
| \`404\` | המשאב אינו קיים בסביבה זו | לא |
| \`409\` | המשלוח עודכן בזמן שערכתם אותו | כן, לאחר שליפה מחדש |
| \`429\` | חריגה ממגבלת הקצב | כן, לאחר הזמן המצוין ב-\`Retry-After\` |
| \`5xx\` | תקלה במערכת Tidewater | כן, עם השהיה מעריכית |

<Danger>
אל תבצעו ניסיונות חוזרים אוטומטיים לתגובות \`400\`–\`404\`: הבקשה תיכשל שוב באותו אופן ותיגרע ממגבלת הקצב שלכם.
</Danger>

## Idempotency (פעולות ללא השפעה כפולה)

שלחו כותרת \`Idempotency-Key\` בכל בקשת \`POST\`. פניות חוזרות בתוך 24 שעות יחזירו את התגובה המקורית במקום ליצור הזמנה כפולה.`,
    },
  },
  {
    group: 'reference',
    slug: 'shipments',
    icon: 'ship',
    en: {
      title: 'Shipments',
      description: 'Create, retrieve, amend, and cancel shipments.',
      content: `## Create a shipment

\`POST /v1/shipments\`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| \`origin\` | string | yes | UN/LOCODE of the loading port |
| \`destination\` | string | yes | UN/LOCODE of the discharge port |
| \`containers\` | integer | yes | Number of 40ft containers (1–200) |
| \`incoterm\` | string | no | Defaults to \`FOB\` |
| \`speed\` | string | sandbox only | \`normal\` or \`fast\` |

${CURL_SHIPMENT}

## Retrieve a shipment

\`GET /v1/shipments/{id}\`

Returns the shipment with its containers, current position, and document links.

## Cancel a shipment

\`POST /v1/shipments/{id}/cancel\`

Cancellation is free until the containers are gated in at the origin port; after that a carrier fee applies and is itemised in the response.`,
    },
    he: {
      title: 'משלוחים',
      description: 'יצירה, קבלה, עדכון וביטול משלוחים.',
      content: `## יצירת משלוח

\`POST /v1/shipments\`

| שדה | סוג | חובה | תיאור |
| --- | --- | --- | --- |
| \`origin\` | string | כן | קוד UN/LOCODE של נמל הטעינה |
| \`destination\` | string | כן | קוד UN/LOCODE של נמל הפריקה |
| \`containers\` | integer | כן | מספר מכולות של 40 רגל (1–200) |
| \`incoterm\` | string | לא | ברירת מחדל היא \`FOB\` |
| \`speed\` | string | סביבת בדיקות בלבד | \`normal\` או \`fast\` |

${CURL_SHIPMENT}

## קבלת פרטי משלוח

\`GET /v1/shipments/{id}\`

מחזיר את פרטי המשלוח יחד עם המכולות שלו, המיקום הנוכחי וקישורי המסמכים.

## ביטול משלוח

\`POST /v1/shipments/{id}/cancel\`

הביטול הוא ללא עלות עד שהמכולות נכנסות לשער נמל המוצא; לאחר מכן יחולו דמי מוביל שיפורטו בתגובה.`,
    },
  },
  {
    group: 'reference',
    slug: 'rate-limits',
    icon: 'gauge',
    en: {
      title: 'Rate limits',
      description: 'Per-key request budgets and the headers that report them.',
      content: `Limits are enforced per API key over a sliding sixty-second window.

| Key type | Requests per minute | Burst |
| --- | --- | --- |
| Server | 600 | 100 |
| Restricted | 120 | 30 |
| Publishable | 60 per IP | 10 |

Every response includes:

- \`RateLimit-Limit\` — the budget for the current window
- \`RateLimit-Remaining\` — requests left in the window
- \`RateLimit-Reset\` — seconds until the window resets

<Note>
Need more headroom? Enterprise plans include dedicated capacity and per-endpoint limits.
</Note>`,
    },
    he: {
      title: 'מגבלות קצב',
      description: 'תקציב בקשות לפי מפתח והכותרות המדווחות עליו.',
      content: `המגבלות נאכפות לכל מפתח API בחלון זמן נע של 60 שניות.

| סוג מפתח | בקשות לדקה | התפרצות (Burst) |
| --- | --- | --- |
| שרת (Server) | 600 | 100 |
| מוגבל (Restricted) | 120 | 30 |
| ניתן לפרסום (Publishable) | 60 לכל כתובת IP | 10 |

כל תגובה כוללת את הכותרות הבאות:

- \`RateLimit-Limit\` — התקציב עבור חלון הזמן הנוכחי
- \`RateLimit-Remaining\` — יתרת הבקשות בחלון הזמן
- \`RateLimit-Reset\` — מספר שניות עד לאיפוס חלון הזמן

<Note>
זקוקים למכסה גבוהה יותר? תוכניות Enterprise כוללות קיבולת ייעודית ומגבלות מותאמות אישית לכל נקודת קצה.
</Note>`,
    },
  },
];

// ─── Projects ────────────────────────────────────────────────────────────────

const SITE_NAME = { en: 'Tidewater Docs', he: 'תיעוד Tidewater' };
const SITE_DESCRIPTION = {
  en: 'Developer documentation for the Tidewater shipping API.',
  he: 'תיעוד מפתחים עבור ה-API של Tidewater.',
};

const baseConfig = () => ({
  visibility: 'public',
  styling: { theme: 'light' },
  navbar: {
    ctaLabel: 'Get an API key',
    ctaUrl: 'https://example.com/tidewater/signup',
    links: [
      { label: 'Guides', href: '/guides' },
      { label: 'Reference', href: '/reference' },
      { label: 'Status', href: 'https://status.example.com', external: true },
    ],
    showSearch: true,
    changelog: true,
  },
  footer: {
    copyright: '© 2026 Tidewater Labs. All rights reserved.',
    github: 'https://github.com/example/tidewater',
    x: 'https://x.com/example',
    madeWithBadge: true,
  },
  search: { placeholder: 'Search the docs…', hotkey: 'cmdk' },
  addons: { feedback: true, feedbackPlacement: 'after-content', feedbackPresentation: 'compact' },
});

const THEME_META = {
  harbor: { name: 'Harbor', description: 'Reference layout with a calm, structured sidebar.' },
  manuscript: { name: 'Manuscript', description: 'Editorial layout that reads like a printed manual.' },
  signal: { name: 'Signal', description: 'Console layout with a dark rail and dense navigation.' },
};

const PROJECTS = {
  'preview-harbor': { preset: 'harbor' },
  'preview-manuscript': { preset: 'manuscript' },
  'preview-signal': { preset: 'signal' },
  'preview-legacy': { preset: null },
};

const projectConfig = (preset) => {
  const config = baseConfig();
  if (preset) {
    config.theme = { version: 1, preset, metadata: THEME_META[preset] };
  } else {
    config.styling.primaryColor = '#5546e8';
  }
  return config;
};

// Per-language chrome overrides (mirrors LanguageConfig; merged into
// project.config for non-default languages like the real server does).
const LANGUAGE_CONFIG = {
  en: { name: SITE_NAME.en, description: SITE_DESCRIPTION.en },
  he: {
    name: SITE_NAME.he,
    description: SITE_DESCRIPTION.he,
    navbar: {
      ctaLabel: 'קבל מפתח API',
      links: [
        { label: 'מדריכים', href: '/guides' },
        { label: 'תיעוד', href: '/reference' },
        { label: 'סטטוס', href: 'https://status.example.com', external: true },
      ],
    },
    footer: { copyright: '© 2026 Tidewater Labs. כל הזכויות שמורות.' },
    search: { placeholder: 'חיפוש בתיעוד…' },
  },
};

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const mergeLanguageChrome = (config, languageConfig) => {
  if (!languageConfig) return config;
  let merged = null;
  for (const section of ['navbar', 'footer', 'banner', 'search']) {
    const override = languageConfig[section];
    if (!isPlainObject(override)) continue;
    const entries = Object.entries(override).filter(
      ([, value]) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0),
    );
    if (entries.length === 0) continue;
    merged = merged ?? { ...(config ?? {}) };
    const base = merged[section];
    merged[section] = { ...(isPlainObject(base) ? base : {}), ...Object.fromEntries(entries) };
  }
  return merged ?? config;
};

// ─── Derivations (nav, headings, neighbours) ─────────────────────────────────

// github-slugger-compatible enough for the sample content: lowercase, drop
// punctuation, keep Unicode letters/marks/numbers, spaces -> hyphens, dedupe.
const makeSlugger = () => {
  const seen = new Map();
  return (text) => {
    const base = text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{M}\p{N} -]/gu, '')
      .replace(/ /g, '-');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
};

const stripInlineMarkdown = (text) =>
  text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$2')
    .trim();

const extractHeadings = (markdown) => {
  const headings = [];
  const slug = makeSlugger();
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = stripInlineMarkdown(match[2]);
    headings.push({ depth: match[1].length, text, id: slug(text) });
  }
  return headings;
};

// The authored samples above indent component children for readability, but
// CommonMark treats 4-space-indented lines as code blocks. Strip that
// indentation outside fenced code so the reader renders the real components.
const dedentOutsideFences = (markdown) => {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (line.trimStart().startsWith('```')) {
        inFence = !inFence;
        return line.trimStart();
      }
      return inFence ? line : line.replace(/^ +/, '');
    })
    .join('\n');
};

const pagePath = (page) => `${page.group}/${page.slug}`;
const pageId = (page, lang) => `pg_${lang}_${page.group}_${page.slug}`;

const buildNav = (lang) =>
  GROUPS.map((group) => ({
    id: `grp_${lang}_${group.slug}`,
    kind: 'GROUP',
    title: group.title[lang],
    path: group.slug,
    icon: group.icon,
    tag: null,
    children: PAGES.filter((page) => page.group === group.slug).map((page) => ({
      id: pageId(page, lang),
      kind: 'PAGE',
      title: page[lang].title,
      path: pagePath(page),
      icon: page.icon ?? null,
      tag: page.tag ?? null,
      children: [],
    })),
  }));

const resolveLanguage = (lang) => LANGUAGES.find((language) => language.code === lang) ?? LANGUAGES.find((language) => language.isDefault);
const resolveVersion = (version) => VERSIONS.find((item) => item.slug === version) ?? VERSIONS.find((item) => item.isDefault);

const cleanPath = (raw) => {
  let path = raw ?? '';
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep as-is
  }
  path = path.replace(/^\/+|\/+$/g, '');
  const [first, ...rest] = path.split('/');
  if (first && VERSIONS.some((item) => item.slug === first)) {
    path = rest.join('/');
  }
  return path;
};

const findPage = (path) => {
  if (!path) return PAGES[0];
  const direct = PAGES.find((page) => pagePath(page) === path);
  if (direct) return direct;
  const group = GROUPS.find((item) => item.slug === path);
  return group ? PAGES.find((page) => page.group === group.slug) : undefined;
};

const projectPayload = (id, preset, language) => {
  const languageConfig = LANGUAGE_CONFIG[language.code];
  const config = projectConfig(preset);
  return {
    id,
    name: SITE_NAME.en,
    slug: id,
    description: SITE_DESCRIPTION.en,
    config: language.isDefault ? config : mergeLanguageChrome(config, languageConfig),
    primaryDomain: null,
  };
};

const siteShell = (id, preset, query) => {
  const language = resolveLanguage(query.get('lang'));
  const version = resolveVersion(query.get('version'));
  return {
    project: projectPayload(id, preset, language),
    nav: buildNav(language.code),
    languages: LANGUAGES,
    versions: VERSIONS,
    activeLanguage: language.code,
    activeVersion: version.slug,
    languageConfig: LANGUAGE_CONFIG[language.code],
    version: 1,
    generatedAt: GENERATED_AT,
    openapi: null,
  };
};

const sitePage = (id, preset, query) => {
  const language = resolveLanguage(query.get('lang'));
  const version = resolveVersion(query.get('version'));
  const page = findPage(cleanPath(query.get('path')));
  if (!page) return null;
  const lang = language.code;
  const index = PAGES.indexOf(page);
  const prev = PAGES[index - 1];
  const next = PAGES[index + 1];
  const group = GROUPS.find((item) => item.slug === page.group);
  const localized = { ...page[lang], content: dedentOutsideFences(page[lang].content) };
  return {
    project: projectPayload(id, preset, language),
    page: {
      id: pageId(page, lang),
      createdAt: '2026-08-12T10:00:00.000Z',
      updatedAt: '2026-08-30T14:30:00.000Z',
      title: localized.title,
      description: localized.description,
      icon: page.icon ?? null,
      path: pagePath(page),
      content: localized.content,
      headings: extractHeadings(localized.content),
      config: page.tag ? { tag: page.tag } : null,
    },
    activeLanguage: lang,
    activeVersion: version.slug,
    versions: VERSIONS,
    languageConfig: LANGUAGE_CONFIG[lang],
    languages: LANGUAGES.map((item) => ({ code: item.code, isDefault: item.isDefault, path: pagePath(page) })),
    breadcrumbs: [
      { title: group.title[lang], path: group.slug },
      { title: localized.title, path: pagePath(page) },
    ],
    prev: prev ? { title: prev[lang].title, path: pagePath(prev) } : null,
    next: next ? { title: next[lang].title, path: pagePath(next) } : null,
  };
};

// ─── HTTP ────────────────────────────────────────────────────────────────────

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

const SITE_ROUTE = /^\/api\/public\/sites\/([^/]+)(?:\/(.*))?$/;

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const { pathname, searchParams } = url;

  if (pathname.startsWith('/api/public/assets/')) {
    res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store' });
    res.end(DIAGRAM_SVG);
    return;
  }

  const match = SITE_ROUTE.exec(pathname);
  if (match && req.method === 'GET') {
    const [, id, rest = ''] = match;
    const project = PROJECTS[id];
    if (!project) {
      json(res, 404, { error: { code: 'not_found', message: 'Site not found.' } });
      return;
    }
    if (rest === '') {
      json(res, 200, { data: siteShell(id, project.preset, searchParams) });
      return;
    }
    if (rest === 'page') {
      const page = sitePage(id, project.preset, searchParams);
      if (!page) {
        json(res, 404, { error: { code: 'not_found', message: 'Page not found.' } });
        return;
      }
      json(res, 200, { data: page });
      return;
    }
    if (rest === 'search') {
      json(res, 200, { data: { hits: [] } });
      return;
    }
    if (rest === 'changelog') {
      json(res, 200, { data: [] });
      return;
    }
  }

  if (pathname.startsWith('/api/')) {
    res.writeHead(204, { 'cache-control': 'no-store' });
    res.end();
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('site-preview-mock: not an API path');
});

// No host: bind dual-stack so the dev proxy reaches us via ::1 or 127.0.0.1.
server.listen(PORT, () => {
  process.stdout.write(`site-preview-mock listening on http://localhost:${PORT} (projects: ${Object.keys(PROJECTS).join(', ')})\n`);
});
