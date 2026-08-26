export function PageHeader({
  title,
  description,
  showBrand = true,
}: {
  title: string;
  description: string;
  showBrand?: boolean;
}) {
  return (
    <div className="mb-6 md:mb-8">
      {showBrand ? (
        <div className="mb-3 flex items-center gap-3">
          <span className="h-[2px] w-8 rounded-full bg-[#a7282d]" />

          <span className="text-[0.65rem] font-black uppercase tracking-[0.24em] text-[#a7282d]">
            The Zen Wolves
          </span>
        </div>
      ) : null}

      <h1 className="text-3xl font-black tracking-[-0.035em] text-[#201f1d] md:text-4xl">
        {title}
      </h1>

      <p className="mt-2 max-w-3xl text-sm leading-6 app-muted md:text-base">
        {description}
      </p>
    </div>
  );
}