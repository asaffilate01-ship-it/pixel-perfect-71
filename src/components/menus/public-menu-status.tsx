import { usePublicMenu } from "./use-public-menu";

export function PublicMenuStatus() {
  const menu = usePublicMenu();
  return (
    <div className="lm-public-menu-status" role="status" aria-live="polite">
      <p>{menu.message}</p>
      {!menu.ready && !menu.loading && (
        <button type="button" onClick={menu.retry}>
          Try menu again
        </button>
      )}
    </div>
  );
}
