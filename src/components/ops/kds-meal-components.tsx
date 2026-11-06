import type { MealComponent } from "@/lib/mealdeck-meal-components";

/** Display only the canonical kitchen projection; names never imply a meal. */
export function KdsMealComponents({
  components,
  quantity,
}: {
  components: readonly MealComponent[];
  quantity: number;
}) {
  if (!components.length) return null;
  return (
    <section className="md-kds-meal-components" aria-label="Meal contents">
      <p>
        <strong>Meal includes</strong>
        {quantity > 1 && <span> · totals for {quantity} items</span>}
      </p>
      <ul>
        {components.map((component) => (
          <li key={component.slot}>
            <strong>{quantity * component.quantityPerParent}×</strong>
            <span>
              {component.name}
              {component.replacement && (
                <small>Replaces the standard {component.slot === "drink" ? "drink" : "side"}</small>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
