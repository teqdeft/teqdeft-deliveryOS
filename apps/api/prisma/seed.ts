/**
 * Demo data so the product is explorable the moment it starts.
 *
 * The Northwind project is deliberately messy: the proposal, the call and a
 * later email disagree in the ways real projects disagree, so the Requirements
 * Studio, the conflict screen and the health rules all have something real to
 * show before any AI key is configured.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { extractFragments } from '../src/modules/sources/extract.js';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'DeliveryOS2026!';

const PEOPLE = [
  { email: 'kulwant@teqdeft.com', name: 'Kulwant Singh', role: 'FOUNDER', jobTitle: 'Founder', color: '#00A8FF' },
  { email: 'delivery@teqdeft.com', name: 'Anita Rao', role: 'DELIVERY_HEAD', jobTitle: 'Delivery Head', color: '#10B981' },
  { email: 'cto@teqdeft.com', name: 'Rahul Menon', role: 'CTO', jobTitle: 'Technical Lead', color: '#8B5CF6' },
  { email: 'pm@teqdeft.com', name: 'Priya Sharma', role: 'PROJECT_MANAGER', jobTitle: 'Project Manager', color: '#F59E0B' },
  { email: 'dev@teqdeft.com', name: 'Sam Fernandes', role: 'TEAM_MEMBER', jobTitle: 'Full-stack Developer', color: '#06B6D4' },
  { email: 'qa@teqdeft.com', name: 'Divya Nair', role: 'QA_ENGINEER', jobTitle: 'QA Engineer', color: '#EC4899' },
  { email: 'sales@teqdeft.com', name: 'Arjun Patel', role: 'SALES', jobTitle: 'Business Development', color: '#0086CC' },
] as const;

const PROPOSAL = `TEQDEFT — PROPOSAL: NORTHWIND ORGANICS WEBSITE REBUILD

Prepared for Northwind Organics Pvt Ltd. Valid for 30 days from the date of issue.

1. SCOPE OF WORK

Teqdeft will design and build a new marketing website for Northwind Organics comprising eight page templates: home, about, product listing, product detail, our farms, journal listing, journal article, and contact. Each template will be designed at desktop, tablet and mobile breakpoints and delivered as a fully responsive build.

The website will be built on WordPress with a custom theme. All content areas identified in the wireframes will be editable through the WordPress admin without developer involvement, using Advanced Custom Fields.

A product catalogue of up to 60 products will be migrated from the existing Shopify store into the new WordPress product listing. Product data will be supplied by the client as a spreadsheet export. This is a presentation-only catalogue; the new site does not process transactions and checkout continues to run on the existing Shopify store.

2. SEARCH AND PERFORMANCE

The build will include on-page SEO fundamentals: unique meta titles and descriptions per template, semantic heading structure, XML sitemap, robots.txt, canonical tags, and Open Graph tags for social sharing. 301 redirects will be mapped from all existing URLs to their new equivalents to preserve search rankings.

The site must achieve a Google Lighthouse performance score of 90 or above on mobile for the home page and product listing page, measured on the production environment after launch.

3. EXCLUSIONS

The following are explicitly excluded from this engagement and are not included in the quoted price: written copy for any page, product photography and lifestyle imagery, translation into any language other than English, ongoing hosting, ongoing maintenance and support after the warranty period, email marketing platform setup, and any e-commerce or checkout functionality.

Content is the responsibility of the client. All written copy and imagery must be supplied no later than two weeks before the agreed launch date. Delays in content delivery will move the launch date accordingly.

4. TIMELINE AND COMMERCIALS

The engagement is quoted at INR 8,50,000 excluding taxes, payable 40% on signature, 30% on design approval and 30% on launch. The indicative timeline is ten weeks from signature to launch, assuming content is supplied on schedule and feedback is returned within three working days at each review stage.

Two rounds of revisions are included at the design stage. Further revision rounds will be quoted separately at our standard hourly rate.

5. WARRANTY

Teqdeft will fix defects reported within 30 days of launch at no cost, where the defect relates to work delivered under this proposal.`;

const TRANSCRIPT = `00:00:08 Priya: Thanks for making time. I want to walk through the proposal and make sure we're aligned before we start.

00:00:24 Meera: Of course. We're excited. The main thing for us is the trade show — we're exhibiting at Organic India Expo and the site absolutely has to be live before that.

00:00:41 Priya: Understood. When is the expo exactly?

00:00:47 Meera: It opens on the fifteenth of March. So we'd want to be live by, say, the tenth to be safe.

00:01:12 Priya: That's tighter than the ten weeks in the proposal. I'll need to check with our technical lead on what's achievable. Let me flag that as something we need to resolve this week.

00:01:38 Meera: Also — and I know this wasn't in the proposal — we've been talking internally about the journal. Our marketing person wants to be able to schedule posts in advance rather than publishing manually.

00:01:59 Priya: Scheduling is standard WordPress behaviour, so that's fine, it's included.

00:02:15 Meera: Good. And one more thing, we'd like the site in Hindi as well as English. Not the whole thing necessarily, but the main pages.

00:02:31 Priya: That's outside the current scope — the proposal excludes translation. We'd need to look at that as a change request. Can I come back to you with what that would involve?

00:02:48 Meera: Yes, please do. It's not a dealbreaker for launch but we do want it eventually.

00:03:10 Priya: Noted. On the product catalogue, the proposal says up to sixty products migrated from the spreadsheet you'll provide. Is sixty still right?

00:03:22 Meera: It's closer to ninety now, we've added the new range.

00:03:35 Priya: Right, I'll need to check whether that changes the migration effort. Let me get back to you on that too.

00:04:02 Meera: One last thing. Our founder is quite particular about the photography. She'll want to sign off the design personally, and she travels a lot, so factor that into the review timings.

00:04:20 Priya: That's useful to know. I'll build the review windows around her availability rather than assuming three working days.`;

const EMAIL = `From: Meera Krishnan <meera@northwindorganics.in>
To: Priya Sharma <pm@teqdeft.com>
Subject: Re: Northwind website — kickoff notes

Hi Priya,

Thanks for the notes. Two corrections after speaking to the team internally.

First, on the launch date. I said the tenth of March on our call but our marketing lead has now confirmed the expo actually opens on the twenty-second, not the fifteenth. So we have a little more room than I thought — being live by the eighteenth of March would be fine. Sorry for the confusion.

Second, on the product count. I checked with our operations team and the correct number for launch is seventy-four products, not ninety. The remaining products in the new range won't have photography ready in time and we'll add them ourselves afterwards through the CMS.

Also, please make sure the contact form sends an enquiry to sales@northwindorganics.in as well as storing it in the site, our sales team works out of that inbox.

Best,
Meera`;

async function main() {
  console.log('Seeding Teqdeft Delivery OS…');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const users: Record<string, string> = {};

  for (const person of PEOPLE) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: {},
      create: {
        email: person.email,
        name: person.name,
        role: person.role,
        jobTitle: person.jobTitle,
        avatarColor: person.color,
        passwordHash,
      },
    });
    users[person.role] = user.id;
  }
  console.log(`  ${PEOPLE.length} users`);

  const client = await prisma.client.upsert({
    where: { name: 'Northwind Organics' },
    update: {},
    create: {
      name: 'Northwind Organics',
      contactName: 'Meera Krishnan',
      contactEmail: 'meera@northwindorganics.in',
      confidentiality: 'STANDARD',
      communicationNotes: 'All client communication goes through Meera. Founder signs off design personally and travels often.',
    },
  });

  const secondClient = await prisma.client.upsert({
    where: { name: 'Harbourline Logistics' },
    update: {},
    create: { name: 'Harbourline Logistics', contactName: 'Vikram Desai', contactEmail: 'vikram@harbourline.co' },
  });

  const existing = await prisma.project.findUnique({ where: { code: 'NWO-01' } });
  if (existing) {
    console.log('  demo project already present — nothing further to seed');
    return;
  }

  const project = await prisma.project.create({
    data: {
      code: 'NWO-01',
      name: 'Northwind Organics website rebuild',
      summary: 'Eight-template WordPress marketing site with a presentation-only product catalogue migrated from Shopify.',
      clientId: client.id,
      engagementType: 'MARKETING_WEBSITE',
      stage: 'AI_ANALYSIS',
      projectManagerId: users.PROJECT_MANAGER!,
      technicalLeadId: users.CTO!,
      startDate: new Date('2026-01-12'),
      targetLaunchDate: new Date('2026-03-18'),
      contractValue: 850000,
      currency: 'INR',
      intakeChecklist: {
        PROPOSAL: { done: true, note: 'Signed 9 January', by: 'Arjun Patel', at: '2026-01-09T10:00:00Z' },
        DEADLINES: { done: false, note: 'Expo date changed twice — see conflict', by: null, at: null },
        DESIGNS: { done: false, note: null, by: null, at: null },
        CONTENT_OWNERSHIP: { done: true, note: 'Client supplies all copy and imagery', by: 'Priya Sharma', at: '2026-01-12T09:00:00Z' },
        CREDENTIALS: { done: false, note: 'Awaiting Shopify export access', by: null, at: null },
        CLIENT_DEPENDENCIES: { done: false, note: null, by: null, at: null },
      } as Prisma.InputJsonValue,
      members: {
        create: [
          { userId: users.PROJECT_MANAGER!, projectRole: 'PROJECT_MANAGER' },
          { userId: users.CTO!, projectRole: 'CTO' },
          { userId: users.TEAM_MEMBER!, projectRole: 'TEAM_MEMBER' },
          { userId: users.QA_ENGINEER!, projectRole: 'QA_ENGINEER' },
          { userId: users.SALES!, projectRole: 'SALES' },
        ],
      },
    },
  });

  await prisma.project.create({
    data: {
      code: 'HBL-01',
      name: 'Harbourline shipment tracking portal',
      summary: 'Customer-facing portal for live shipment tracking, built against their existing TMS API.',
      clientId: secondClient.id,
      engagementType: 'CUSTOM_PORTAL',
      stage: 'DELIVERY_INTAKE',
      projectManagerId: users.PROJECT_MANAGER!,
      technicalLeadId: users.CTO!,
      targetLaunchDate: new Date('2026-05-30'),
      contractValue: 1450000,
      currency: 'INR',
      members: { create: [{ userId: users.PROJECT_MANAGER!, projectRole: 'PROJECT_MANAGER' }] },
    },
  });

  const sources: {
    title: string;
    kind: 'PROPOSAL' | 'TRANSCRIPT' | 'EMAIL';
    authority: 'SIGNED_CONTRACT' | 'CALL_TRANSCRIPT' | 'CLIENT_EMAIL';
    statedAt: string;
    text: string;
    uploader: string;
  }[] = [
    { title: 'Signed proposal — Northwind Organics website rebuild', kind: 'PROPOSAL', authority: 'SIGNED_CONTRACT', statedAt: '2026-01-09', text: PROPOSAL, uploader: 'SALES' },
    { title: 'Kickoff call with Meera Krishnan', kind: 'TRANSCRIPT', authority: 'CALL_TRANSCRIPT', statedAt: '2026-01-14', text: TRANSCRIPT, uploader: 'PROJECT_MANAGER' },
    { title: 'Re: Northwind website — kickoff notes', kind: 'EMAIL', authority: 'CLIENT_EMAIL', statedAt: '2026-01-16', text: EMAIL, uploader: 'PROJECT_MANAGER' },
  ];

  for (const source of sources) {
    const fragments = extractFragments(source.text, source.kind);
    await prisma.source.create({
      data: {
        projectId: project.id,
        title: source.title,
        kind: source.kind,
        authority: source.authority,
        statedAt: new Date(source.statedAt),
        mimeType: 'text/plain',
        byteSize: Buffer.byteLength(source.text, 'utf8'),
        extractedChars: source.text.length,
        processingState: 'READY',
        uploadedById: users[source.uploader]!,
        fragments: {
          create: fragments.map((f) => ({
            ordinal: f.ordinal,
            locator: f.locator,
            text: f.text,
            charStart: f.charStart,
            charEnd: f.charEnd,
          })),
        },
      },
    });
    console.log(`  source "${source.title}" — ${fragments.length} fragments`);
  }

  await prisma.auditEvent.create({
    data: {
      projectId: project.id,
      actorId: users.SALES!,
      action: 'project.created',
      entityType: 'Project',
      entityId: project.id,
      summary: 'Arjun Patel created NWO-01 — Northwind Organics website rebuild',
      detail: { seeded: true } as Prisma.InputJsonValue,
    },
  });

  console.log(`\nDone. Sign in with any of:\n`);
  for (const person of PEOPLE) console.log(`  ${person.email.padEnd(24)} ${person.role}`);
  console.log(`\nPassword for every demo account: ${DEMO_PASSWORD}`);
  console.log(`\nOpen NWO-01 and run the AI analysis to see the studio populate.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
