import { Component, type ReactNode } from "react";
import { Grid2X2, RotateCcw } from "lucide-react";

type GamePanelBoundaryProps = {
  children: ReactNode;
  onChooseGame: () => void;
};

/** Key this boundary by game ID so choosing another game clears a failed import. */
export class GamePanelBoundary extends Component<GamePanelBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;

    return (
      <section className="md-arcade-game" aria-label="Game loading problem">
        <div className="md-game-heading" role="alert">
          <div>
            <h2>This game didn’t load</h2>
            <p className="md-game-description">
              Check your connection, then reload the game. You can also choose another game from the
              library.
            </p>
          </div>
        </div>
        <div className="md-game-actions">
          <button
            type="button"
            className="md-game-button is-primary"
            onClick={() => window.location.reload()}
          >
            <RotateCcw size={18} aria-hidden="true" /> Reload game
          </button>
          <button type="button" className="md-game-button" onClick={this.props.onChooseGame}>
            <Grid2X2 size={18} aria-hidden="true" /> Choose another game
          </button>
        </div>
      </section>
    );
  }
}
