import { useState } from "react";

export function FranchiseBrandLogo({
  src,
  name,
  decorative = false,
  lazy = false,
}: {
  src: string;
  name: string;
  decorative?: boolean;
  lazy?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className="md-franchise-logo-fallback" aria-hidden={decorative || undefined}>
        {name}
      </span>
    );
  return (
    <img
      src={src}
      alt={decorative ? "" : `${name} logo`}
      loading={lazy ? "lazy" : "eager"}
      width={320}
      height={190}
      onError={() => setFailed(true)}
    />
  );
}
