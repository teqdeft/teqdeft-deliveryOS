import { useState, type FormEvent } from 'react';
import { Logo } from '../components/Logo.js';
import { Button, ErrorNote, Field } from '../components/ui.js';
import { useSession } from '../lib/session.js';

const DEMO_ACCOUNTS = [
  { email: 'kulwant@teqdeft.com', label: 'Founder' },
  { email: 'pm@teqdeft.com', label: 'Project Manager' },
  { email: 'cto@teqdeft.com', label: 'Technical Lead' },
  { email: 'dev@teqdeft.com', label: 'Developer' },
];

export function SignIn() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('pm@teqdeft.com');
  const [password, setPassword] = useState('DeliveryOS2026!');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Logo size={30} tone="dark" />
          <h1 className="mt-8 text-2xl font-bold tracking-tight text-ink-900">Delivery OS</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Sign in to see what was promised, what remains, and what is at risk.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <Field label="Email" required>
              <input
                className="input"
                type="email"
                value={email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password" required>
              <input
                className="input"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>

            {error !== null && <ErrorNote error={error} />}

            <Button type="submit" variant="primary" loading={busy} className="w-full">
              Sign in
            </Button>
          </form>

          <div className="mt-8 rounded-lg border border-ink-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Demo accounts</p>
            <p className="mt-1 text-xs text-ink-400">
              Every seeded account uses the password <code className="font-mono text-ink-600">DeliveryOS2026!</code>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => setEmail(account.email)}
                  className="rounded-md border border-ink-200 px-2 py-1.5 text-left text-xs text-ink-600 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800"
                >
                  {account.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-400">
              Roles differ: the developer account cannot see contract values or approve scope.
            </p>
          </div>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-ink-900 lg:block">
        <div
          className="absolute inset-0 opacity-40"
          style={{ background: 'radial-gradient(900px 500px at 75% 15%, #00A8FF33, transparent 65%)' }}
          aria-hidden
        />
        <div className="relative flex h-full flex-col justify-center px-14">
          <p className="max-w-md text-2xl font-semibold leading-snug text-white">
            Every deliverable connected to the exact promise that created it.
          </p>
          <div className="mt-10 space-y-5 border-l-2 border-brand-500/40 pl-5">
            {[
              ['What did we promise?', 'The signed proposal, the call and the email — reconciled, with the disagreements surfaced rather than averaged away.'],
              ['What remains?', 'Requirements traced to deliverables, milestones and tasks, each with evidence attached.'],
              ['Will we deliver on time?', 'Health that shows the facts behind the colour, so a red project is defensible in a room.'],
            ].map(([question, answer]) => (
              <div key={question}>
                <p className="text-sm font-semibold text-brand-300">{question}</p>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-300">{answer}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
