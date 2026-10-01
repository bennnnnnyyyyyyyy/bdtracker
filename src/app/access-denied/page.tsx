import Link from 'next/link';

export default function AccessDeniedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6" style={{ background: '#09090b', color: '#f4f4f5' }}>
      <section className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <h1 className="font-serif text-2xl font-bold text-white">Access pending</h1>
        <p className="mt-3 text-sm leading-6 text-text-dim">This Google account has not been approved for the BD Manager Dashboard. Ask an administrator to add your email and opener mapping.</p>
        <Link href="/login" className="mt-6 inline-block rounded-lg bg-gold-dim px-4 py-2 text-sm font-semibold text-gold-light">Try another account</Link>
      </section>
    </main>
  );
}
