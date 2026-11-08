/** Use outside product buttons so the terms remain a separate, accessible link. */
export function MilkcakeOfferTerms({ explained = false }: { explained?: boolean }) {
  return (
    <span className="md-milkcake-offer-terms">
      {explained &&
        "One milkcake per order is 99p after the 30% discount. Additional milkcakes are £3.99 each before the usual 30% discount. "}
      <a
        href="/offers#sunday-milk-cake"
        target="_blank"
        rel="noopener"
        aria-label="Milkcake offer terms (opens in a new tab)"
      >
        T&amp;Cs apply
      </a>
    </span>
  );
}
