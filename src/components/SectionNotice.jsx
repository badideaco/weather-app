// Shown in place of a section whose data source failed, so a dead upstream is
// visible instead of the section silently disappearing. The next app refresh
// (every 10 min, or on reopen) retries.
export default function SectionNotice({ title, source, children }) {
  return (
    <section className="mb-6">
      {title && (
        <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em] mb-3 px-1">{title}</h2>
      )}
      <div className="glass-card px-4 py-3 flex items-center gap-3">
        <span className="text-text-muted text-base" aria-hidden="true">⚠︎</span>
        <p className="text-text-muted text-xs leading-relaxed">
          {children || <>Couldn&apos;t load{source ? <> from {source}</> : null}. Will retry on the next refresh.</>}
        </p>
      </div>
    </section>
  )
}
