import { useState } from "react";
import { Modal, Icon } from "./components";

export default function CloudAccount({ cloud }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signUp, setSignUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function close() {
    setOpen(false); setPassword(""); setError(""); setMessage("");
  }
  async function submit(event) {
    event.preventDefault();
    if (!cloud.client || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const credentials = { email: email.trim(), password };
      const result = signUp
        ? await cloud.client.auth.signUp({ ...credentials,
            options: { emailRedirectTo: `${location.origin}${location.pathname}` },
          })
        : await cloud.client.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      setPassword("");
      if (signUp && !result.data.session) {
        setMessage("Check your email to confirm your account, then sign in here.");
        setSignUp(false);
      } else close();
    } catch (failure) {
      setError(failure.message || "Couldn't sign in. Please try again.");
    } finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const { error } = await cloud.client.auth.signOut();
      if (error) throw error;
      close();
    } catch { setError("Couldn't sign out. Please try again."); }
    finally { setBusy(false); }
  }

  return <>
    <button className="button subtle cloud-account-button" title={cloud.status}
      aria-label={cloud.user ? "Sync account" : "Sign in to sync devices"}
      onClick={() => setOpen(true)}>
      <Icon name="cloud" size={17} /> {cloud.user ? "Account" : "Sync devices"}
    </button>
    {open && <Modal title={cloud.user ? "Your synced workspace" : "Study on any device"} onClose={close}>
      {!cloud.configured ? <>
        <p className="dialog-description">Cloud sync setup is not finished yet. Your cards and progress still save on this device.</p>
        <p className="dialog-description">Once setup is complete, sign in to the same account on your phone and computer to share cards and progress.</p>
        <div className="modal-actions"><button className="button" onClick={close}>Close</button></div>
      </> : cloud.user ? <>
        <p className="dialog-description">Signed in as <strong>{cloud.user.email}</strong>. Use this same account on your other devices.</p>
        <p className="sync-status" role="status">{cloud.status}</p>
        <p className="dialog-description">Cards and color ratings save here immediately and sync when connected. This device keeps a local copy when you sign out.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="button" onClick={signOut} disabled={busy}>Sign out</button>
          <button className="button primary" onClick={cloud.syncNow}>Sync now</button>
        </div>
      </> : <form onSubmit={submit} className="cloud-auth-form">
        <p className="dialog-description">{signUp ? "Create an account, then use it on both devices." : "Sign in with the same account on your phone and computer. Your cards and color ratings will sync."}</p>
        <label className="field-label">Email
          <input type="email" autoComplete="email" required value={email}
            onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="field-label">Password
          <input type="password" autoComplete={signUp ? "new-password" : "current-password"}
            required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {message && <p className="sync-status" role="status">{message}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="text-button" disabled={busy}
            onClick={() => { setSignUp((value) => !value); setError(""); }}>
            {signUp ? "Already have an account?" : "Create an account"}
          </button>
          <button className="button primary" disabled={busy || !cloud.client}>
            {busy ? "Please wait…" : signUp ? "Create account" : "Sign in"}
          </button>
        </div>
      </form>}
    </Modal>}
  </>;
}
