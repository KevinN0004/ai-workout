/**
 * The root error boundary: main.jsx renders App inside it, so a crash anywhere
 * in the app leaves a message on screen rather than an empty page.
 */
import { Component } from "react";

/**
 * Renders `children` until one of them throws while rendering or in an effect,
 * then a message asking for a reload. React only logs an error a boundary
 * catches, so componentDidCatch passes it to reportError, which is how an
 * uncaught error reaches Sentry's global handler (app/errorTracking.js). Errors
 * in event handlers and async code never reach a boundary.
 */
export default class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    reportError(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="page">
        <h1>Something went wrong</h1>
        <p role="alert">Reload the page to try again.</p>
      </main>
    );
  }
}
