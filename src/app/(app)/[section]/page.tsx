import { notFound } from 'next/navigation';
const sections = ['feedback', 'issues', 'decisions', 'reports', 'data-lab'];
export function generateStaticParams() { return sections.map(section => ({ section })); }
export default async function Section({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return <><h1>{section}</h1><p>Minimal navigation shell for Antigravity handoff. API contracts are frozen in docs/API_CONTRACT.md.</p></>;
}
