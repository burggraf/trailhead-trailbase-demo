import { Braces, Database, FileImage, Radio, ShieldCheck, Workflow } from 'lucide-react'
import { Card, Badge } from '../components/ui'

const comparisons = [
  ['Postgres RLS', 'Collection rules', 'Record API ACL + SQL access rules'],
  ['Edge Functions', 'JavaScript hooks', 'Rust/TypeScript WASM components'],
  ['Storage buckets', 'Record file fields', '`std.FileUpload` constrained columns'],
  ['Realtime channels', 'Record subscriptions', 'Record API SSE/WebSocket subscriptions'],
  ['Database functions', 'Custom routes/hooks', 'SQLite + WASM transactions and jobs'],
]

export function LearnPage() {
  return <div className="mx-auto max-w-5xl"><p className="eyebrow">Under the hood</p><h1 className="mt-2 text-4xl font-black sm:text-5xl">TrailBase, by example</h1><p className="mt-4 max-w-3xl text-lg text-muted">Trailhead intentionally keeps TrailBase visible. Open your browser network panel while using each feature.</p>
    <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3"><Concept icon={<ShieldCheck />} title="Tenant isolation" api="config.textproto"><code>EXISTS (SELECT 1 FROM trip_members … _USER_.id)</code><p>Every Record API request is authorized server-side. UI filtering is never security.</p></Concept><Concept icon={<Database />} title="Typed CRUD" api="/api/records/v1/*"><p>SQLite STRICT tables become paginated, filterable REST endpoints with JSON schemas.</p></Concept><Concept icon={<Radio />} title="Realtime" api="…/subscribe/*"><p>Itinerary, checklist, membership, activity, and weather changes invalidate live queries.</p></Concept><Concept icon={<FileImage />} title="Files" api="std.FileUpload"><p>Cover metadata stays in SQLite while bytes live in TrailBase’s object store. Avatars use the auth API.</p></Concept><Concept icon={<Braces />} title="User-aware WASM" api="/trailhead/*"><p>The Rust component reads <code>req.user()</code>, runs transactions, and calls Nominatim/Open-Meteo.</p></Concept><Concept icon={<Workflow />} title="Scheduled jobs" api="Guest::job_handlers"><p>Hourly weather and daily invitation cleanup demonstrate system context without a request user.</p></Concept></div>
    <section className="mt-12"><h2 className="section-title">Concept map</h2><div className="mt-5 overflow-x-auto rounded-2xl border border-border"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-stone"><tr><th>Supabase</th><th>PocketBase</th><th>TrailBase</th></tr></thead><tbody>{comparisons.map((row) => <tr key={row[0]} className="border-t border-border">{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div></section>
    <Card className="mt-12 overflow-hidden"><div className="border-b border-border bg-forest p-5 text-white"><Badge tone="amber">Try it</Badge><h2 className="mt-3 text-2xl font-black">Two-browser tenant test</h2></div><ol className="grid gap-3 p-6 text-sm text-muted sm:grid-cols-2"><li><strong>1.</strong> Register Alice and create a trip.</li><li><strong>2.</strong> Open an incognito window and register Bob.</li><li><strong>3.</strong> Alice invites Bob as editor; copy the token.</li><li><strong>4.</strong> Bob accepts it from the dashboard.</li><li><strong>5.</strong> Edit a checklist in both windows and watch realtime.</li><li><strong>6.</strong> Register Eve and confirm the trip is invisible.</li></ol></Card>
  </div>
}

function Concept({ icon, title, api, children }: { icon: React.ReactNode; title: string; api: string; children: React.ReactNode }) {
  return <Card className="p-5"><div className="flex items-start"><span className="grid size-10 place-items-center rounded-xl bg-stone text-forest dark:text-emerald-300">{icon}</span><Badge tone="neutral"><span className="ml-auto">{api}</span></Badge></div><h2 className="mt-5 text-lg font-bold">{title}</h2><div className="mt-2 grid gap-2 text-sm leading-relaxed text-muted">{children}</div></Card>
}
