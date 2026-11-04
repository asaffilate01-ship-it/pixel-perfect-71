import { useState } from "react";
import { logoDimensionsBySrc } from "@/lib/brand-logos";

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
      width={logoDimensionsBySrc[src]?.width ?? 320}
      height={logoDimensionsBySrc[src]?.height ?? 190}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
