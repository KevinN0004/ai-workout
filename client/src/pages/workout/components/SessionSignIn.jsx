/**
 * What /workout shows with nobody signed in (roadmap B6): a session is kept per
 * account, so there is none to open until someone signs in. Rendered by App.
 */
import "../SessionPage.css";

/** Asks to sign in, and `onSignIn` opens the sign-in page. */
export default function SessionSignIn({ onSignIn }) {
  return (
    <main className="session-page">
      <section className="panel center-panel">
        <p>Sign in to continue your workout.</p>
        <button type="button" className="cta" onClick={onSignIn}>
          Sign in
        </button>
      </section>
    </main>
  );
}
