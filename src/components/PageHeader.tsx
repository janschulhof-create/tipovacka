export function PageHeader({
  icon,
  title,
  subtitle = 'Chance liga tipovačka',
}: {
  icon?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-5">
      <div className="eyebrow">
        <span className="flag-chip" /> {subtitle}
      </div>
      <h1 className="mt-1 font-display text-2xl font-bold tracking-wide text-white sm:text-3xl">
        {icon ? `${icon} ` : ''}
        {title}
      </h1>
    </header>
  );
}
