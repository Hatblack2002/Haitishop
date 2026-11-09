"use client";

import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { X, Mail, Lock, LoaderCircle } from "lucide-react";
import { auth, firebaseReady } from "@/lib/firebase";

export function AuthPanel({ onClose, onAuthSuccess }: { onClose: () => void; onAuthSuccess?: (kind: "login"|"signup") => void }) {
  const [mode, setMode] = useState<"login"|"signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !firebaseReady) {
      setMessage("Firebase n’est pas encore configuré dans les variables d’environnement.");
      return;
    }
    setBusy(true); setMessage("");
    try {
      if (mode === "signup") await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
      setMessage(mode === "signup" ? "Compte créé avec succès." : "Connexion réussie.");
      onAuthSuccess?.(mode);
      setTimeout(onClose, 900);
    } catch (error) {
      const code = (error as {code?:string}).code ?? "";
      const messages: Record<string,string> = {
        "auth/email-already-in-use": "Cette adresse e-mail est déjà utilisée.",
        "auth/invalid-credential": "Adresse e-mail ou mot de passe incorrect.",
        "auth/invalid-login-credentials": "Adresse e-mail ou mot de passe incorrect.",
        "auth/user-not-found": "Aucun compte n’existe avec cette adresse e-mail.",
        "auth/wrong-password": "Adresse e-mail ou mot de passe incorrect.",
        "auth/weak-password": "Le mot de passe doit contenir au moins 6 caractères.",
        "auth/invalid-email": "Adresse e-mail invalide.",
        "auth/operation-not-allowed": "La connexion par e-mail est désactivée dans Firebase.",
        "auth/too-many-requests": "Trop de tentatives. Réessayez dans quelques minutes.",
        "auth/network-request-failed": "Erreur réseau. Vérifiez votre connexion."
      };
      setMessage(messages[code] ?? "Impossible de terminer l’opération. Vérifiez la configuration Firebase.");
    } finally { setBusy(false); }
  }

  async function sendReset() {
    if (!auth || !firebaseReady) { setMessage("Firebase n’est pas encore configuré dans les variables d’environnement."); return; }
    if (!email) { setMessage("Saisissez votre adresse e-mail, puis cliquez sur « Mot de passe oublié ? »."); return; }
    setBusy(true); setMessage("");
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("E-mail de réinitialisation envoyé. Vérifiez votre boîte de réception.");
    } catch (error) {
      const code = (error as {code?:string}).code ?? "";
      const messages: Record<string,string> = {
        "auth/user-not-found": "Aucun compte n’existe avec cette adresse e-mail.",
        "auth/invalid-email": "Adresse e-mail invalide.",
        "auth/too-many-requests": "Trop de tentatives. Réessayez dans quelques minutes.",
        "auth/network-request-failed": "Erreur réseau. Vérifiez votre connexion."
      };
      setMessage(messages[code] ?? "Impossible d’envoyer l’e-mail de réinitialisation. Vérifiez la configuration Firebase.");
    } finally { setBusy(false); }
  }

  async function google() {
    if (!auth || !firebaseReady) { setMessage("Firebase n’est pas encore configuré dans les variables d’environnement."); return; }
    setBusy(true); setMessage("");
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const isNew = (result as { additionalUserInfo?: { isNewUser?: boolean } }).additionalUserInfo?.isNewUser ?? false;
      setMessage(isNew ? "Compte créé avec Google." : "Connexion réussie.");
      onAuthSuccess?.(isNew ? "signup" : "login");
      setTimeout(onClose, 900);
    } catch (error) {
      const code = (error as {code?:string}).code ?? "";
      const messages: Record<string,string> = {
        "auth/popup-closed-by-user": "Fenêtre Google fermée avant de terminer. Réessayez.",
        "auth/cancelled-popup-request": "Connexion Google annulée.",
        "auth/popup-blocked": "Le navigateur a bloqué la fenêtre Google. Autorisez les pop-ups pour ce site.",
        "auth/operation-not-allowed": "La connexion Google n’est pas encore activée dans la console Firebase (Authentication → Sign-in method → Google → Activer).",
        "auth/unauthorized-domain": "Ce domaine n’est pas autorisé dans Firebase Authentication.",
        "auth/network-request-failed": "Erreur réseau. Vérifiez votre connexion."
      };
      setMessage(messages[code] ?? "Impossible de se connecter avec Google. Réessayez.");
    } finally { setBusy(false); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close" onClick={onClose} aria-label="Fermer"><X/></button><div className="auth-mark">H</div><span className="eyebrow">BIENVENUE SUR HAÏTISHOP</span><h2 id="auth-title">{mode==="login"?"Content de vous revoir":"Créer votre compte"}</h2><p>Connectez-vous pour continuer vos achats et gérer votre activité.</p><div className="auth-tabs"><button className={mode==="login"?"chosen":""} onClick={()=>{setMode("login");setMessage("");}}>Connexion</button><button className={mode==="signup"?"chosen":""} onClick={()=>{setMode("signup");setMessage("");}}>Inscription</button></div><form onSubmit={submit}><label>Adresse e-mail<div className="field"><Mail size={17}/><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="nom@exemple.com"/></div></label><label>Mot de passe<div className="field"><Lock size={17}/><input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="6 caractères minimum"/></div></label><button type="button" className="link-btn" onClick={sendReset} disabled={busy}>Mot de passe oublié ?</button><button className="auth-submit" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:null}{mode==="login"?"Se connecter":"Créer mon compte"}</button></form><div className="auth-divider"><span>ou</span></div><button type="button" className="google-btn" onClick={google} disabled={busy}><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Continuer avec Google</button>{message&&<div className="auth-message" role="status">{message}</div>}<small className="auth-note">Démonstration HaïtiShop · Authentification Firebase</small></section></div>;
}
