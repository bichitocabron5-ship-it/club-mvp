export function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6 md:mb-8">
      <h1 className="text-3xl font-black tracking-tight md:text-4xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 app-muted md:text-base">
        {description}
      </p>
    </div>
  );
}
