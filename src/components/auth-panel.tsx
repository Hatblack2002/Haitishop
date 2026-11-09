"use client";

import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { X, Mail, Lock, LoaderCircle } from "lucide-react";
import { auth, firebaseReady } from "@/lib/firebase";

export function AuthPanel({ onClose }: { onClose: () => void }) {
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

  return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close" onClick={onClose} aria-label="Fermer"><X/></button><div className="auth-mark">H</div><span className="eyebrow">BIENVENUE SUR HAÏTISHOP</span><h2 id="auth-title">{mode==="login"?"Content de vous revoir":"Créer votre compte"}</h2><p>Connectez-vous pour continuer vos achats et gérer votre activité.</p><div className="auth-tabs"><button className={mode==="login"?"chosen":""} onClick={()=>{setMode("login");setMessage("");}}>Connexion</button><button className={mode==="signup"?"chosen":""} onClick={()=>{setMode("signup");setMessage("");}}>Inscription</button></div><form onSubmit={submit}><label>Adresse e-mail<div className="field"><Mail size={17}/><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="nom@exemple.com"/></div></label><label>Mot de passe<div className="field"><Lock size={17}/><input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="6 caractères minimum"/></div></label><button type="button" className="link-btn" onClick={sendReset} disabled={busy}>Mot de passe oublié ?</button><button className="auth-submit" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:null}{mode==="login"?"Se connecter":"Créer mon compte"}</button></form>{message&&<div className="auth-message" role="status">{message}</div>}<small className="auth-note">Démonstration HaïtiShop · Authentification Firebase</small></section></div>;
}
