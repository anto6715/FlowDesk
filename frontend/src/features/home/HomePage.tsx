const cards = [
  {
    title: "Today cockpit",
    text: "Track the active task, waiting reasons, running experiments, and stalled work from one operational view."
  },
  {
    title: "Calendar and planning",
    text: "Keep work sessions separate from scheduled blocks so reports stay accurate while planning remains flexible."
  },
  {
    title: "Notes and reporting",
    text: "Capture journal, task, and experiment notes, then turn them into reports by task, macro-activity, and time range."
  }
];

export function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Local-first HPC task cockpit</p>
        <h1>Flow Desk</h1>
        <p className="hero-copy">
          The scaffold is in place. Next milestones will add the task model, timing services,
          experiment registry, journal, and calendar-driven planning.
        </p>
      </section>

      <section className="card-grid" aria-label="Platform goals">
        {cards.map((card) => (
          <article className="card" key={card.title}>
            <h2>{card.title}</h2>
            <p>{card.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

