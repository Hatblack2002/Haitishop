"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query,
  serverTimestamp, setDoc, updateDoc, where
} from "firebase/firestore";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import {
  Apple, ArrowRight, BadgeCheck, Camera, Check, ChevronDown, ChevronRight,
  CircleUserRound, ClipboardList, Eye, FileText, House, Laptop, LoaderCircle, LogOut,
  MapPin, Package, Search, ShoppingBag, Shirt, SlidersHorizontal,
  Sparkles, Store, Truck, X, Hammer
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { AuthPanel } from "@/components/auth-panel";
import { SEED_PRODUCTS } from "@/data/catalog-seed";

type Product = {
  id: string; name: string; description: string; price: number; category: string;
  condition: string; stock: number; location: string; sellerName: string;
  sellerId: string; imageUrl: string; brand?: string; variants?: string;
  createdAt?: { seconds?: number };
};
type CartLine = { product: Product; quantity: number };
type SellerApplication = { id: string; uid: string; email: string; displayName: string; phone: string; location: string; documentName: string; documentUrl?: string; status: string };
type SellerPayoutView = { sellerId: string; sellerName: string; gross: number; commission: number; payout: number };
type MyOrder = {
  id: string; status: string; createdAt: string | null; total: number; paymentMethod: string;
  items: { name: string; quantity: number; price: number }[]; deliveryCode: string | null;
  codeLocked: boolean; deliveredMarkedAt: string | null; confirmedAt: string | null;
  dispute: { status: string; type: string } | null;
  confirmLink: { active: boolean; expiresAt: string | null }; canResend: boolean;
};
type SellerOrder = {
  id: string; status: string; createdAt: string | null;
  myItems: { name: string; quantity: number; price: number }[];
  myGross: number; myCommission: number; myPayout: number;
  codeLocked: boolean; deliveredMarkedAt: string | null; canDeliver: boolean;
};
type AdminOrder = {
  id: string; status: string; statusLabel: string; buyerEmail: string; phone: string; address: string;
  paymentMethod: string; createdAt: string | null; total: number; commissionTotal: number;
  payoutTotal: number; sellerPayouts: SellerPayoutView[]; items: { name: string; quantity: number }[];
  codeLocked: boolean; codeAttempts: number; paidAt: string | null; releasedAt: string | null;
  deliveredMarkedAt: string | null; confirmedAt: string | null;
};
type DisputeView = { id: string; orderId?: string; type?: string; reason?: string; photos?: string[]; status?: string; openedByEmail?: string; openedAt?: { seconds?: number } };
type EventView = { id: string; orderId?: string; actor?: string; action?: string; note?: string; at?: string };
type OrderResult = { orderId: string; code: string; confirmUrl: string; total: number; emailSent: boolean };

const categories = [
  { name: "Électronique", icon: Laptop }, { name: "Mode", icon: Shirt },
  { name: "Maison", icon: House }, { name: "Beauté", icon: Sparkles },
  { name: "Alimentation", icon: Apple }, { name: "Construction", icon: Hammer }
];
const money = (v: number) => new Intl.NumberFormat("fr-HT", { maximumFractionDigits: 0 }).format(v) + " HTG";
const STATUS_LABELS: Record<string, string> = {
  pendiente_pago: "En attente de paiement",
  pagado_retenido: "Paiement sécurisé",
  entregado_confirmado: "Livraison confirmée",
  pago_liberable: "Paiement libérable",
  pago_liberado: "Paiement versé au vendeur",
  en_disputa: "En litige",
  cancelado: "Annulée",
  awaiting_confirmation: "Ancienne commande"
};
const STATUS_CLASS: Record<string, string> = {
  pendiente_pago: "st-grey", pagado_retenido: "st-blue", entregado_confirmado: "st-teal",
  pago_liberable: "st-amber", pago_liberado: "st-green", en_disputa: "st-red", cancelado: "st-grey",
  awaiting_confirmation: "st-grey"
};
const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";
const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dcclzhsim";
const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "haitishop_demo_unsigned";

export function MarketplaceApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  // Catálogo de demostración visible de inmediato; Firestore lo sustituye en cuanto haya productos publicados.
  const [products, setProducts] = useState<Product[]>(SEED_PRODUCTS);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tout");
  const [sort, setSort] = useState("recent");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [sellerOpen, setSellerOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [sellerStatus, setSellerStatus] = useState("none");
  const [isAdmin, setIsAdmin] = useState(false);
  const [applications, setApplications] = useState<SellerApplication[]>([]);
  const [detail, setDetail] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({ name:"", description:"", price:"", category:"Électronique", condition:"Neuf", stock:"1", location:"Port-au-Prince", brand:"", variants:"" });
  const [sellerForm, setSellerForm] = useState({ displayName:"", phone:"", location:"", documentName:"" });
  const [checkout, setCheckout] = useState({ phone:"", address:"", payment:"MonCash (simulation)" });
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  const [sellerOrders, setSellerOrders] = useState<SellerOrder[]>([]);
  const [adminTab, setAdminTab] = useState<"commandes"|"litiges"|"historique">("commandes");
  const [adminOrders, setAdminOrders] = useState<AdminOrder[]>([]);
  const [adminStatusFilter, setAdminStatusFilter] = useState("");
  const [disputes, setDisputes] = useState<DisputeView[]>([]);
  const [events, setEvents] = useState<EventView[]>([]);
  const [deliverCodes, setDeliverCodes] = useState<Record<string,string>>({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (current) => {
      setUser(current);
      setSellerStatus("none");
      setIsAdmin(false);
      if (!current) return;
      try {
        const [seller, admin] = await Promise.all([
          getDoc(doc(db, "sellerApplications", current.uid)),
          getDoc(doc(db, "admins", current.uid))
        ]);
        setSellerStatus(seller.exists() ? String(seller.data().status || "pending") : "none");
        setIsAdmin(admin.exists());
      } catch { setNotice("Impossible de charger les autorisations du compte."); }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "products"), (snapshot) => {
      const live = snapshot.docs.map((item) => ({ id:item.id, ...item.data() } as Product)).filter((p) => p.stock > 0);
      setProducts(live.length ? live : SEED_PRODUCTS);
    }, () => setNotice("Catalogue Firestore indisponible \u2014 affichage du catalogue de d\u00e9monstration."));
    return () => unsub();
  }, []);

  async function checkoutOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) { setCheckoutOpen(false); setAuthOpen(true); return; }
    if (!cart.length) return;
    setBusy(true); setNotice("");
    try {
      const data = await api("/api/checkout", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity })),
          phone: checkout.phone, address: checkout.address, paymentMethod: checkout.payment
        })
      });
      setOrderResult({
        orderId: String(data.orderId), code: String(data.code),
        confirmUrl: String(data.confirmUrl), total: Number(data.total),
        emailSent: Boolean(data.emailSent)
      });
      setCart([]); setCheckoutOpen(false);
      void loadMyOrders();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Commande non enregistrée.");
    } finally { setBusy(false); }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return products.filter((p) =>
      (category === "Tout" || p.category === category) &&
      (!term || [p.name,p.description,p.category,p.brand,p.location,p.sellerName].join(" ").toLocaleLowerCase().includes(term))
    ).sort((a,b) => sort === "price-up" ? a.price-b.price : sort === "price-down" ? b.price-a.price : (b.createdAt?.seconds || 0)-(a.createdAt?.seconds || 0));
  }, [products, category, search, sort]);

  const cartCount = cart.reduce((sum,line)=>sum+line.quantity,0);
  const cartTotal = cart.reduce((sum,line)=>sum+line.product.price*line.quantity,0);
  const updateQuantity = (id:string, delta:number) => setCart((old)=>old.flatMap((line)=>line.product.id!==id?line:line.quantity+delta<=0?[]:[{...line,quantity:Math.min(line.quantity+delta,line.product.stock)}]));

  async function uploadImage(file: File, folder = "haitishop-demo/products"): Promise<string> {
    const body = new FormData();
    body.append("file", file);
    body.append("upload_preset", uploadPreset);
    body.append("folder", folder);
    const response = await fetch("https://api.cloudinary.com/v1_1/"+cloudName+"/image/upload", { method:"POST", body });
    if (!response.ok) throw new Error("Cloudinary a refusé l’image. Vérifiez le preset unsigned.");
    const data = await response.json() as { secure_url?:string };
    if (!data.secure_url) throw new Error("Cloudinary n’a pas retourné d’URL d’image.");
    return data.secure_url;
  }

  async function publishProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || sellerStatus !== "approved") { setNotice("Votre compte vendeur doit être approuvé avant de publier."); return; }
    const form = event.currentTarget;
    const file = (form.elements.namedItem("photo") as HTMLInputElement).files?.[0];
    if (!file) { setNotice("Ajoutez une photo du produit."); return; }
    if (!file.type.startsWith("image/") || file.size > 8*1024*1024) { setNotice("Image invalide : formats image, 8 Mo maximum."); return; }
    setBusy(true); setNotice("");
    try {
      const imageUrl = await uploadImage(file);
      await addDoc(collection(db,"products"), {
        ...productForm, price:Number(productForm.price), stock:Number(productForm.stock),
        sellerId:user.uid, sellerName:user.displayName || user.email || "Vendeur HaïtiShop",
        imageUrl, active:true, createdAt:serverTimestamp()
      });
      setProductForm({ name:"",description:"",price:"",category:"Électronique",condition:"Neuf",stock:"1",location:"Port-au-Prince",brand:"",variants:"" });
      form.reset(); setNotice("Produit publié dans le catalogue.");
    } catch (error) { setNotice(error instanceof Error?error.message:"Publication impossible."); }
    finally { setBusy(false); }
  }

  async function applyAsSeller(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) { setAuthOpen(true); return; }
    const form = event.currentTarget;
    const docFile = (form.elements.namedItem("doc") as HTMLInputElement | null)?.files?.[0];
    if (!docFile || !docFile.type.startsWith("image/")) { setNotice("Ajoutez une photo lisible du document de vérification."); return; }
    setBusy(true); setNotice("");
    try {
      const documentUrl = await uploadImage(docFile, "haitishop-demo/documents");
      await setDoc(doc(db,"sellerApplications",user.uid), {
        uid:user.uid, email:user.email || "", ...sellerForm, documentUrl, status:"pending", submittedAt:serverTimestamp()
      });
      form.reset();
      setSellerStatus("pending"); setNotice("Demande vendeur envoyée. Elle sera examinée par l’administration.");
    } catch { setNotice("Impossible d’envoyer la demande. Vérifiez les règles Firestore."); }
    finally { setBusy(false); }
  }

  async function approveSeller(application: SellerApplication) {
    try {
      await updateDoc(doc(db,"sellerApplications",application.uid), { status:"approved", reviewedAt:serverTimestamp() });
      await setDoc(doc(db,"sellerProfiles",application.uid), { uid:application.uid, displayName:application.displayName, status:"approved", approvedAt:serverTimestamp() });
      setNotice("Vendeur approuvé : "+application.displayName);
    } catch { setNotice("Approbation refusée. Vérifiez les règles Firestore et le compte administrateur."); }
  }

  useEffect(() => {
    if (!isAdmin) { setApplications([]); return; }
    return onSnapshot(query(collection(db, "sellerApplications"), where("status", "==", "pending")), (snap) => {
      setApplications(snap.docs.map((d) => ({ id:d.id, ...d.data() } as SellerApplication)));
    }, () => setNotice("Lecture des demandes vendeurs refusée par Firestore."));
  }, [isAdmin]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("haitishop-cart-v1");
      if (raw) setCart(JSON.parse(raw) as CartLine[]);
    } catch { localStorage.removeItem("haitishop-cart-v1"); }
  }, []);
  useEffect(() => {
    localStorage.setItem("haitishop-cart-v1", JSON.stringify(cart));
  }, [cart]);

  async function api(path: string, options: RequestInit = {}): Promise<Record<string, unknown>> {
    const token = user ? await user.getIdToken() : "";
    const res = await fetch(path, {
      ...options,
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...(options.headers || {}) }
    });
    const data = await res.json().catch(() => ({ error: "Réponse serveur illisible." }));
    if (!res.ok) throw new Error(String(data.error || "Erreur serveur."));
    return data as Record<string, unknown>;
  }

  async function loadMyOrders() {
    if (!user) { setMyOrders([]); return; }
    try { const data = await api("/api/orders/mine"); setMyOrders((data.orders as MyOrder[]) || []); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Commandes indisponibles."); }
  }
  async function loadSellerOrders() {
    if (!user || sellerStatus !== "approved") { setSellerOrders([]); return; }
    try { const data = await api("/api/seller/orders"); setSellerOrders((data.orders as SellerOrder[]) || []); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Ventes indisponibles."); }
  }
  async function loadAdminOrders() {
    try { const data = await api("/api/admin/orders"); setAdminOrders((data.orders as AdminOrder[]) || []); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Commandes admin indisponibles."); }
  }
  async function loadDisputes() {
    try { const data = await api("/api/admin/disputes"); setDisputes((data.disputes as DisputeView[]) || []); }
    catch { setDisputes([]); }
  }
  async function loadEvents() {
    try { const data = await api("/api/admin/events"); setEvents((data.events as EventView[]) || []); }
    catch { setEvents([]); }
  }

  useEffect(() => { void loadMyOrders(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [user]);
  useEffect(() => { void loadSellerOrders(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [user, sellerStatus]);
  useEffect(() => {
    if (!isAdmin) return;
    if (adminTab === "commandes") void loadAdminOrders();
    if (adminTab === "litiges") void loadDisputes();
    if (adminTab === "historique") void loadEvents();
    /* eslint-disable react-hooks/exhaustive-deps */
  }, [isAdmin, adminTab]);

  async function resendConfirmLink(orderId: string) {
    setBusy(true); setNotice("");
    try {
      const data = await api("/api/escrow/resend", { method: "POST", body: JSON.stringify({ orderId }) });
      setMyOrders((old) => old.map((o) => o.id === orderId ? { ...o, confirmLink: { active: true, expiresAt: String(data.confirmExpiresAt || "") } } : o));
      setNotice("Nouveau lien de confirmation envoyé par e-mail.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Impossible d'envoyer un nouveau lien."); }
    finally { setBusy(false); }
  }

  async function submitDeliver(orderId: string) {
    const code = (deliverCodes[orderId] || "").replace(/\D/g,"");
    if (code.length !== 6) { setNotice("Entrez le code à 6 chiffres du client."); return; }
    setBusy(true); setNotice("");
    try {
      await api("/api/seller/deliver", { method: "POST", body: JSON.stringify({ orderId, code }) });
      setDeliverCodes((old) => ({ ...old, [orderId]: "" }));
      setNotice("Livraison marquée. Le paiement sera libéré après confirmation du client (72 h max).");
      void loadSellerOrders();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Code refusé."); }
    finally { setBusy(false); }
  }

  async function adminPayment(orderId: string, action: "mark_paid"|"release"|"cancel") {
    setBusy(true); setNotice("");
    try {
      await api("/api/admin/payment", { method: "POST", body: JSON.stringify({ orderId, action }) });
      setNotice(action === "release" ? "Paiement marqué comme versé au vendeur." : action === "mark_paid" ? "Paiement reçu : fonds retenus par HaïtiShop." : "Commande annulée.");
      void loadAdminOrders();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Action impossible."); }
    finally { setBusy(false); }
  }

  async function resolveDispute(disputeId: string, resolution: "seller"|"customer") {
    setBusy(true); setNotice("");
    try {
      await api("/api/admin/disputes", { method: "POST", body: JSON.stringify({ disputeId, resolution }) });
      setNotice("Litige résolu.");
      void loadDisputes(); void loadAdminOrders();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Résolution impossible."); }
    finally { setBusy(false); }
  }

  async function removeProduct(id:string) {
    if (!user) return;
    try { await deleteDoc(doc(db,"products",id)); setNotice("Produit supprimé."); }
    catch { setNotice("Suppression refusée."); }
  }

  return <main>
    <div className="topline"><span>HaïtiShop</span><span>Le marketplace des commerçants haïtiens</span><span>FR&nbsp; | &nbsp;KRE&nbsp; | &nbsp;EN</span></div>
    <header className="header">
      <a className="brand" href="#"><img src="https://res.cloudinary.com/dcclzhsim/image/upload/q_auto:best/copy_of_file_000000004b4481f5856e94a87bad615e_awp5pa.png" alt="HaïtiShop"/><span>Haïti<span>Shop</span></span></a>
      <div className="market-search"><Search size={19}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")document.getElementById("catalogue")?.scrollIntoView({behavior:"smooth"});}} placeholder="Rechercher un produit, une marque ou un vendeur"/><button onClick={()=>document.getElementById("catalogue")?.scrollIntoView({behavior:"smooth"})}>Rechercher</button></div>
      <div className="header-actions">
        {user ? <button className="icon-btn" onClick={()=>signOut(auth)}><LogOut size={17}/><span>Déconnexion</span></button> : <button className="icon-btn" onClick={()=>setAuthOpen(true)}><CircleUserRound size={18}/><span>Compte</span></button>}
        <button className="bag-btn" onClick={()=>setCartOpen(true)}><ShoppingBag size={17}/> Panier <b>{cartCount}</b></button>
      </div>
    </header>
    <nav className="market-nav"><a href="#catalogue">Accueil</a><a href="#categories">Toutes les catégories</a>{categories.map(c=><a key={c.name} href="#catalogue" onClick={()=>setCategory(c.name)}>{c.name}</a>)}<a href="#vendeurs">Vendre sur HaïtiShop</a></nav>
    <section className="hero market-hero">
      <div className="hero-copy"><div className="eyebrow">LE COMMERCE HAÏTIEN, EN UN SEUL ENDROIT</div><h1>Découvrez. Comparez.<br/><em>Achetez local.</em></h1><p>Des produits proposés par des commerçants en Haïti. Parcourez le catalogue, trouvez les bonnes offres et commandez simplement.</p>
        <div className="hero-meta"><span><MapPin size={15}/> Des vendeurs partout en Haïti</span><span>Prix affichés en gourdes (HTG)</span></div>
      </div>
      <div className="market-hero-side"><div className="market-promo-tile"><span>HAÏTISHOP SÉLECTION</span><strong>Le meilleur du commerce local.</strong><small>Un catalogue qui réunit les vendeurs haïtiens.</small><a href="#catalogue">Explorer les produits <ChevronRight size={16}/></a></div><div className="market-promo-notes"><div><Truck size={18}/><span><b>Vendeurs locaux</b><small>Dans tout le pays</small></span></div><div><ShoppingBag size={18}/><span><b>Paiement sécurisé</b><small>Retenu jusqu’à la livraison</small></span></div></div></div>
    </section>
    <section className="section" id="categories"><div className="section-heading"><div><span className="eyebrow">EXPLORER</span><h2>Nos catégories</h2></div><a href="#catalogue">Tout explorer <ChevronRight size={16}/></a></div><div className="category-grid">{categories.map(({name,icon:Icon})=><button key={name} className={category===name?"category active":"category"} onClick={()=>{setCategory(name);document.getElementById("catalogue")?.scrollIntoView({behavior:"smooth"});}}><span><Icon size={22}/></span><b>{name}</b></button>)}</div></section>
    <section className="section catalogue" id="catalogue"><div className="section-heading"><div><span className="eyebrow">CATALOGUE EN DIRECT</span><h2>Produits disponibles</h2><p>{products.length} produits publiés par les vendeurs.</p></div><label className="sort-control"><SlidersHorizontal size={15}/><select value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Plus récents</option><option value="price-up">Prix croissant</option><option value="price-down">Prix décroissant</option></select></label></div>
      <div className="filter-row"><button className={category==="Tout"?"chip selected":"chip"} onClick={()=>setCategory("Tout")}>Tout</button>{categories.map(c=><button key={c.name} className={category===c.name?"chip selected":"chip"} onClick={()=>setCategory(c.name)}>{c.name}</button>)}</div>
      <div className="product-grid">{filtered.map(p=><article className="product" key={p.id}><div className="product-image live-product-image">{p.imageUrl?<img src={p.imageUrl} alt={p.name} onClick={()=>setDetail(p)} style={{cursor:"pointer"}}/>:<Package size={45}/>}<button aria-label="Ajouter au panier" onClick={()=>setCart(old=>{const line=old.find(x=>x.product.id===p.id);return line?old.map(x=>x.product.id===p.id?{...x,quantity:Math.min(x.quantity+1,p.stock)}:x):[...old,{product:p,quantity:1}];})}><ShoppingBag size={16}/></button></div><div className="product-info"><small>{p.category} · {p.condition}</small><h3 onClick={()=>setDetail(p)} style={{cursor:"pointer"}}>{p.name}</h3><b>{money(p.price)}</b><span><MapPin size={13}/>{p.location} · {p.sellerName}</span><span className="stock-line">{p.stock} en stock</span><button className="add-btn" onClick={()=>setCart(old=>{const line=old.find(x=>x.product.id===p.id);return line?old.map(x=>x.product.id===p.id?{...x,quantity:Math.min(x.quantity+1,p.stock)}:x):[...old,{product:p,quantity:1}];})}>Ajouter au panier</button></div></article>)}</div>{filtered.length===0&&<p className="empty">Aucun produit disponible. Les nouveaux produits apparaîtront ici après publication.</p>}</section>
    <section className="section how-it-works" id="comment-ca-marche"><div className="section-heading"><div><span className="eyebrow">SIMPLE COMME BONJOUR</span><h2>Comment ça marche</h2><p>Comme sur les grandes plateformes : acheter ne demande aucun compte, vendre commence par un compte gratuit.</p></div></div><div className="how-grid"><div className="how-card"><span className="how-tag"><ShoppingBag size={16}/> VOUS ACHETEZ</span><ol className="how-steps"><li><b>Parcourez librement.</b> Le catalogue est ouvert : aucune inscription pour chercher, comparer et remplir votre panier.</li><li><b>Créez votre compte au checkout.</b> Comme sur Temu ou Amazon, la commande demande un compte : e-mail + mot de passe, 30 secondes.</li><li><b>Paiement sécurisé.</b> Votre paiement reste retenu par HaïtiShop : il n’est versé au vendeur qu’après votre confirmation de livraison, avec un code à 6 chiffres et un lien de confirmation.</li></ol><button className="auth-submit" onClick={()=>{document.getElementById("catalogue")?.scrollIntoView({behavior:"smooth"});}}>Commencer mes achats <ChevronRight size={15}/></button></div><div className="how-card how-card-seller"><span className="how-tag"><Store size={16}/> VOUS VENDEZ</span><ol className="how-steps"><li><b>Créez votre compte gratuit.</b> Cliquez sur « Compte » puis « Inscription » : c’est instantané.</li><li><b>Envoyez votre demande vendeur.</b> Formulaire + photo d’un document d’identité ou commercial pour la vérification.</li><li><b>Publiez dès l’approbation.</b> Une fois vérifié par l’administration, votre boutique est active : photo, prix, stock et ventes.</li></ol><button className="auth-submit how-seller-btn" onClick={()=>{setSellerOpen(true);if(!user)setAuthOpen(true);else document.querySelector(".seller-console")?.scrollIntoView({behavior:"smooth"});}}>Devenir vendeur <ChevronRight size={15}/></button></div></div></section>
    <section className="seller-band" id="vendeurs"><div><span className="eyebrow">VOUS ÊTES COMMERÇANT ?</span><h2>Votre boutique mérite<br/>d’être découverte.</h2><p>Présentez vos produits à des clients partout en Haïti et gérez votre catalogue depuis votre espace vendeur.</p></div><button onClick={()=>{setSellerOpen(true);if(!user)setAuthOpen(true);}}>Espace vendeur <ChevronRight size={17}/></button></section>
    {user&&<section className="section my-orders" id="mes-commandes"><div className="section-heading"><div><span className="eyebrow">VOS ACHATS</span><h2>Mes commandes</h2><p>Suivi de vos commandes : le paiement reste retenu jusqu’à votre confirmation de livraison.</p></div><button className="refresh-btn" onClick={()=>void loadMyOrders()} title="Actualiser"><LoaderCircle className={busy?"spin":""} size={16}/></button></div>{myOrders.length?myOrders.map(o=><div className="order-card" key={o.id}><div className="order-head"><b>{o.id}</b><span className={"status-chip "+(STATUS_CLASS[o.status]||"st-grey")}>{STATUS_LABELS[o.status]||o.status}</span></div><small>{o.createdAt?new Date(o.createdAt).toLocaleDateString("fr-FR")+" · ":""}{o.paymentMethod||"—"}</small><div className="order-lines">{o.items.map((i,idx)=><span key={idx}>{i.quantity} × {i.name}</span>)}<b>Total : {money(o.total)}</b></div>{o.deliveryCode&&<div className="code-box"><span>Code de livraison</span><b>{o.deliveryCode}</b></div>}{o.codeLocked&&<p className="order-alert">Code bloqué après 5 essais erronés : contactez l’administration.</p>}{o.deliveredMarkedAt&&!o.confirmedAt&&<p className="order-note">Livraison marquée par le vendeur le {new Date(o.deliveredMarkedAt).toLocaleDateString("fr-FR")}. Confirmez la réception — sinon le paiement part automatiquement au vendeur après 72 h.</p>}{o.confirmedAt&&<p className="order-note ok">Réception confirmée le {new Date(o.confirmedAt).toLocaleDateString("fr-FR")}. Paiement en préparation pour le vendeur.</p>}{o.dispute&&<p className="order-alert">Litige {o.dispute.status==="open"?"ouvert":"résolu"} — l’administration examine votre dossier.</p>}{o.canResend&&<button className="link-btn" onClick={()=>void resendConfirmLink(o.id)} disabled={busy}>Recevoir un nouveau lien de confirmation</button>}{o.confirmLink.active&&o.confirmLink.expiresAt&&<small className="order-note">Lien de confirmation actif jusqu’au {new Date(o.confirmLink.expiresAt).toLocaleString("fr-FR")}.</small>}</div>):<p className="empty">Aucune commande pour le moment. Passez au checkout pour acheter en toute sécurité.</p>}</section>}
    {user&&sellerStatus==="approved"&&<section className="section seller-console"><div className="section-heading"><div><span className="eyebrow">ESPACE VENDEUR</span><h2>Publier un produit</h2><p>Une photo par produit. Les images sont envoyées vers Cloudinary.</p></div><BadgeCheck color="#16845d"/></div><form className="product-form" onSubmit={publishProduct}><label>Nom du produit<input required maxLength={100} value={productForm.name} onChange={e=>setProductForm({...productForm,name:e.target.value})}/></label><label>Description<textarea required maxLength={1500} value={productForm.description} onChange={e=>setProductForm({...productForm,description:e.target.value})}/></label><div className="form-grid"><label>Prix (HTG)<input required type="number" min="1" value={productForm.price} onChange={e=>setProductForm({...productForm,price:e.target.value})}/></label><label>Stock<input required type="number" min="0" value={productForm.stock} onChange={e=>setProductForm({...productForm,stock:e.target.value})}/></label><label>Catégorie<select value={productForm.category} onChange={e=>setProductForm({...productForm,category:e.target.value})}>{categories.map(c=><option key={c.name}>{c.name}</option>)}</select></label><label>État<select value={productForm.condition} onChange={e=>setProductForm({...productForm,condition:e.target.value})}><option>Neuf</option><option>Comme neuf</option><option>Occasion</option></select></label><label>Marque<input value={productForm.brand} onChange={e=>setProductForm({...productForm,brand:e.target.value})}/></label><label>Ville / localisation<input required value={productForm.location} onChange={e=>setProductForm({...productForm,location:e.target.value})}/></label><label>Variantes<input placeholder="Ex. S, M, L ou noir, blanc" value={productForm.variants} onChange={e=>setProductForm({...productForm,variants:e.target.value})}/></label><label>Photo du produit (8 Mo max)<input required name="photo" type="file" accept="image/png,image/jpeg,image/webp"/></label></div><button className="auth-submit" disabled={busy}>{busy?<LoaderCircle className="spin"/>:<Camera size={17}/>} Publier le produit</button></form>{user&&<><div className="my-products"><h3>Mes produits</h3>{products.filter(p=>p.sellerId===user.uid).map(p=><div className="my-product" key={p.id}><img src={p.imageUrl} alt=""/><span>{p.name}<small>{p.stock} en stock · {money(p.price)}</small></span><button onClick={()=>removeProduct(p.id)} aria-label="Supprimer"><X size={16}/></button></div>)}</div><div className="my-products seller-sales"><h3>Mes ventes</h3><p className="empty">Demandez le code à 6 chiffres au client au moment de la livraison : il prouve la remise du colis.</p>{sellerOrders.length?sellerOrders.map(o=><div className="order-card" key={o.id}><div className="order-head"><b>{o.id}</b><span className={"status-chip "+(STATUS_CLASS[o.status]||"st-grey")}>{STATUS_LABELS[o.status]||o.status}</span></div><small>{o.createdAt?new Date(o.createdAt).toLocaleDateString("fr-FR"):""}</small><div className="order-lines">{o.myItems.map((i,idx)=><span key={idx}>{i.quantity} × {i.name}</span>)}<b>Vous recevrez : {money(o.myPayout)}</b><small>dont commission HaïtiShop : {money(o.myCommission)}</small></div>{o.deliveredMarkedAt?<p className="order-note ok">Livraison marquée le {new Date(o.deliveredMarkedAt).toLocaleDateString("fr-FR")} — en attente de la confirmation du client (72 h max).</p>:o.canDeliver?<div className="deliver-row"><input inputMode="numeric" maxLength={6} placeholder="Code à 6 chiffres" value={deliverCodes[o.id]||""} onChange={e=>setDeliverCodes({...deliverCodes,[o.id]:e.target.value})}/><button className="auth-submit" onClick={()=>void submitDeliver(o.id)} disabled={busy}><Truck size={15}/> Marquer livrée</button></div>:o.codeLocked?<p className="order-alert">Code bloqué après 5 essais erronés — contactez l’administration.</p>:null}</div>):<p className="empty">Aucune vente enregistrée pour le moment.</p>}</div></>}</section>}
    {user&&sellerStatus!=="approved"&&sellerStatus!=="pending"&&<section className="section seller-console"><div className="section-heading"><div><span className="eyebrow">INSCRIPTION VENDEUR</span><h2>Ouvrir ma boutique</h2><p>Envoyez les informations de votre commerce pour vérification.</p></div><Store color="#1769d2"/></div><form className="product-form" onSubmit={applyAsSeller}><div className="form-grid"><label>Nom commercial<input required value={sellerForm.displayName} onChange={e=>setSellerForm({...sellerForm,displayName:e.target.value})}/></label><label>Téléphone<input required value={sellerForm.phone} onChange={e=>setSellerForm({...sellerForm,phone:e.target.value})}/></label><label>Ville<input required value={sellerForm.location} onChange={e=>setSellerForm({...sellerForm,location:e.target.value})}/></label><label>Document de vérification (photo lisible)<input required name="doc" type="file" accept="image/png,image/jpeg,image/webp"/></label><label>Référence du document (facultatif)<input value={sellerForm.documentName} onChange={e=>setSellerForm({...sellerForm,documentName:e.target.value})}/></label></div><button className="auth-submit" disabled={busy}>Envoyer ma demande</button></form></section>}
    {user&&sellerStatus==="pending"&&<section className="section"><div className="notice-card"><ClipboardList/> Votre demande vendeur est en attente de validation administrative.</div></section>}
    {user&&isAdmin&&<section className="section seller-console"><div className="section-heading"><div><span className="eyebrow">ADMINISTRATION</span><h2>Demandes vendeurs</h2><p>Comptes à examiner et autoriser.</p></div><BadgeCheck color="#1769d2"/></div>{applications.length?applications.map(a=><div className="my-product" key={a.uid}><span><b>{a.displayName}</b><small>{a.email} · {a.phone} · {a.location} · Document : {a.documentName || "—"}{a.documentUrl && <> · <a className="doc-link" href={a.documentUrl} target="_blank" rel="noopener noreferrer"><FileText size={12}/> Voir le document</a></>}</small></span><button className="approve-btn" onClick={()=>approveSeller(a)}><Check size={15}/> Approuver</button></div>):<p className="empty">Aucune demande en attente.</p>}
    <div className="section-heading admin-orders"><div><span className="eyebrow">ADMINISTRATION — ESCROW</span><h2>Gestion des paiements</h2><p>Paiement retenu jusqu’à confirmation de livraison. Vous transférez au vendeur, puis marquez « versé ».</p></div><ClipboardList color="#1769d2"/></div>
    <div className="admin-tabs"><button className={adminTab==="commandes"?"chosen":""} onClick={()=>setAdminTab("commandes")}>Commandes</button><button className={adminTab==="litiges"?"chosen":""} onClick={()=>setAdminTab("litiges")}>Litiges</button><button className={adminTab==="historique"?"chosen":""} onClick={()=>setAdminTab("historique")}>Historique</button></div>
    {adminTab==="commandes"&&<>
      <div className="filter-row"><button className={adminStatusFilter===""?"chip selected":"chip"} onClick={()=>setAdminStatusFilter("")}>Toutes</button>{["pendiente_pago","pagado_retenido","entregado_confirmado","pago_liberable","pago_liberado","en_disputa","cancelado"].map(s=><button key={s} className={adminStatusFilter===s?"chip selected":"chip"} onClick={()=>setAdminStatusFilter(adminStatusFilter===s?"":s)}>{STATUS_LABELS[s]}</button>)}<button className="refresh-btn" onClick={()=>void loadAdminOrders()} title="Actualiser"><LoaderCircle size={16}/></button></div>
      {adminOrders.filter(o=>!adminStatusFilter||o.status===adminStatusFilter).map(o=><div className="order-card admin-order" key={o.id}><div className="order-head"><b>{o.id}</b><span className={"status-chip "+(STATUS_CLASS[o.status]||"st-grey")}>{o.statusLabel}</span></div><small>{o.createdAt?new Date(o.createdAt).toLocaleDateString("fr-FR")+" · ":""}{o.buyerEmail||"—"} · {o.paymentMethod||"—"}{o.phone?" · "+o.phone:""}</small><div className="order-lines">{(o.items||[]).map((i,idx)=><span key={idx}>{i.quantity} × {i.name}</span>)}<b>Total : {money(o.total)}</b><small>Commission : {money(o.commissionTotal)} · À transférer : {money(o.payoutTotal)}</small></div>{(o.sellerPayouts||[]).map(p=><div className="payout-line" key={p.sellerId}><span>{p.sellerName}</span><small>{money(p.gross)} − commission {money(p.commission)} = <b>{money(p.payout)}</b></small></div>)}{o.codeAttempts>0&&<small className="order-alert">Code : {o.codeAttempts}/5 essais{o.codeLocked?" — BLOQUÉ":""}</small>}<div className="admin-actions">{o.status==="pendiente_pago"&&<button className="approve-btn" onClick={()=>void adminPayment(o.id,"mark_paid")} disabled={busy}><Check size={14}/> Paiement reçu (retenir)</button>}{o.status==="pendiente_pago"&&<button className="link-btn" onClick={()=>void adminPayment(o.id,"cancel")} disabled={busy}>Annuler</button>}{o.status==="pago_liberable"&&<button className="approve-btn release" onClick={()=>void adminPayment(o.id,"release")} disabled={busy}><Check size={14}/> Marquer paiement libéré</button>}{o.status==="en_disputa"&&<small>Voir l’onglet Litiges.</small>}</div></div>)}
      {adminOrders.filter(o=>!adminStatusFilter||o.status===adminStatusFilter).length===0&&<p className="empty">Aucune commande pour ce filtre.</p>}
    </>}
    {adminTab==="litiges"&&<>{disputes.length?disputes.map(d=><div className="order-card dispute-card" key={d.id}><div className="order-head"><b>{d.orderId||d.id}</b><span className={"status-chip "+(d.status==="open"?"st-red":"st-grey")}>{d.status==="open"?"Ouvert":"Résolu"}</span></div><small>{d.type==="undo"?"Annulation de confirmation":"Problème déclaré"} · {d.openedByEmail||"—"}</small><p className="dispute-reason">« {d.reason} »</p>{(d.photos||[]).length>0&&<div className="dispute-photos">{(d.photos||[]).map(u=><a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="Photo du litige"/></a>)}</div>}{d.status==="open"&&<div className="admin-actions"><button className="approve-btn" onClick={()=>void resolveDispute(d.id,"seller")} disabled={busy}><Check size={14}/> Favorable au vendeur (libérer)</button><button className="approve-btn refund" onClick={()=>void resolveDispute(d.id,"customer")} disabled={busy}>Favorable au client (rembourser)</button></div>}</div>):<p className="empty">Aucun litige. Les litiges ouverts apparaîtront ici.</p>}</>}
    {adminTab==="historique"&&<>{events.length?events.map(e=><div className="event-line" key={e.id}><span className={"status-chip st-grey "+(e.actor==="admin"?"st-blue":e.actor==="system"?"st-grey":"st-teal")}>{e.actor}</span><span><b>{e.action}</b> · {e.orderId}<small>{e.note||""}</small></span><time>{e.at?new Date(e.at).toLocaleString("fr-FR"):""}</time></div>):<p className="empty">Historique vide.</p>}</>}
    </section>}
    <nav className="mobile-bottom-nav" aria-label="Navigation principale"><a href="#"><House size={19}/><span>Accueil</span></a><a href="#categories"><Package size={19}/><span>Catégories</span></a><a href="#catalogue"><Search size={19}/><span>Recherche</span></a><button onClick={()=>setCartOpen(true)}><ShoppingBag size={19}/><span>Panier</span><b>{cartCount}</b></button><button onClick={()=>user?signOut(auth):setAuthOpen(true)}><CircleUserRound size={19}/><span>Compte</span></button></nav>
    <footer><a className="footer-brand" href="#">HaïtiShop</a><span>Le commerce local, partout en Haïti.</span><span>© 2026 HaïtiShop · Démonstration</span></footer>
    {notice&&<div className="toast" role="status">{notice}<button onClick={()=>setNotice("")}><X size={15}/></button></div>}
    {detail&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDetail(null);}}><section className="auth-modal detail-modal" role="dialog" aria-modal="true" aria-label={detail.name}><button className="modal-close" onClick={()=>setDetail(null)} aria-label="Fermer"><X/></button><div className="detail-body"><div className="detail-image">{detail.imageUrl?<img src={detail.imageUrl} alt={detail.name}/>:<Package size={60}/>}</div><div className="detail-info"><small>{detail.category} · {detail.condition}</small><h2>{detail.name}</h2><b className="detail-price">{money(detail.price)}</b><p className="detail-desc">{detail.description}</p>{detail.brand&&<p className="detail-meta"><b>Marque :</b> {detail.brand}</p>}{detail.variants&&<p className="detail-meta"><b>Variantes :</b> {detail.variants}</p>}<span className="detail-meta"><MapPin size={14}/> {detail.location} · {detail.sellerName}</span><span className="stock-line">{detail.stock} en stock</span><button className="auth-submit" disabled={detail.stock<=0} onClick={()=>{setCart(old=>{const line=old.find(x=>x.product.id===detail.id);return line?old.map(x=>x.product.id===detail.id?{...x,quantity:Math.min(x.quantity+1,detail.stock)}:x):[...old,{product:detail,quantity:1}];});setDetail(null);}}><ShoppingBag size={16}/> Ajouter au panier</button></div></div></section></div>}
    {authOpen&&<AuthPanel onClose={()=>setAuthOpen(false)} onAuthSuccess={(kind)=>{if(cart.length)setCartOpen(true);setNotice(kind==="signup"?"Compte créé ! Vous pouvez finaliser vos commandes — et si vous vendez, envoyez votre demande vendeur dans « Ouvrir ma boutique » plus bas.":"Bon retour ! Votre panier vous attend — finalisez votre commande quand vous voulez.");}} />}
    {sellerOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSellerOpen(false);}}><section className="auth-modal"><button className="modal-close" onClick={()=>setSellerOpen(false)}><X/></button><div className="auth-mark">H</div><h2>Espace vendeur</h2><p>{!user?"Connectez-vous pour demander l’ouverture de votre boutique.":sellerStatus==="approved"?"Votre espace vendeur est activé plus bas sur cette page.":sellerStatus==="pending"?"Votre demande est en cours de vérification.":"Complétez le formulaire d’inscription vendeur plus bas sur cette page."}</p><button className="auth-submit" onClick={()=>{setSellerOpen(false);if(!user)setAuthOpen(true);else document.querySelector(".seller-console")?.scrollIntoView({behavior:"smooth"});}}>Continuer</button></section></div>}
    {cartOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setCartOpen(false);}}><section className="auth-modal cart-modal"><button className="modal-close" onClick={()=>setCartOpen(false)}><X/></button><span className="eyebrow">VOTRE SÉLECTION</span><h2>Panier ({cartCount})</h2>{cart.length?cart.map(line=><div className="cart-line" key={line.product.id}><img src={line.product.imageUrl} alt=""/><div><b>{line.product.name}</b><small>{money(line.product.price)}</small><div className="quantity"><button onClick={()=>updateQuantity(line.product.id,-1)}>−</button>{line.quantity}<button onClick={()=>updateQuantity(line.product.id,1)}>+</button></div></div><strong>{money(line.product.price*line.quantity)}</strong></div>):<p className="empty">Votre panier est vide.</p>}<div className="cart-total"><span>Total</span><b>{money(cartTotal)}</b></div><button className="auth-submit" disabled={!cart.length} onClick={()=>{setCartOpen(false);if(!user)setAuthOpen(true);else setCheckoutOpen(true);}}>Passer au checkout</button></section></div>}
    {checkoutOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setCheckoutOpen(false);}}><section className="auth-modal"><button className="modal-close" onClick={()=>setCheckoutOpen(false)}><X/></button><span className="eyebrow">FINALISER LA COMMANDE</span><h2>Livraison et paiement</h2><p>Total : <b>{money(cartTotal)}</b>. Le paiement reste <b>retenu par HaïtiShop</b> jusqu’à votre confirmation de livraison.</p><form className="checkout-form" onSubmit={checkoutOrder}><label>Téléphone<input required value={checkout.phone} onChange={e=>setCheckout({...checkout,phone:e.target.value})}/></label><label>Adresse de livraison<input required value={checkout.address} onChange={e=>setCheckout({...checkout,address:e.target.value})}/></label><label>Méthode de paiement<select value={checkout.payment} onChange={e=>setCheckout({...checkout,payment:e.target.value})}><option>MonCash (simulation)</option><option>NatCash (simulation)</option><option>Paiement à la livraison</option></select></label><button className="auth-submit" disabled={busy}>{busy?<LoaderCircle className="spin"/>:<Truck size={17}/>} Valider ma commande sécurisée</button></form></section></div>}
    {orderResult&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOrderResult(null);}}><section className="auth-modal order-result-modal"><button className="modal-close" onClick={()=>setOrderResult(null)} aria-label="Fermer"><X/></button><span className="eyebrow">COMMANDE ENREGISTRÉE</span><h2>Merci pour votre commande !</h2><p>Référence : <b>{orderResult.orderId}</b> · Total : <b>{money(orderResult.total)}</b></p><div className="code-box big"><span>Votre code de livraison</span><b>{orderResult.code}</b></div><p>Donnez ce code au vendeur au moment de la livraison : il prouve que vous avez bien reçu votre colis.</p><p className="escrow-note">Le paiement reste retenu par HaïtiShop : il ne sera versé au vendeur qu’après votre confirmation de livraison.</p><a className="auth-submit" href={orderResult.confirmUrl}>Confirmer la réception (lien sécurisé)</a><p className="email-note">{orderResult.emailSent?"Un e-mail récapitulatif avec ce code et ce lien vient de vous être envoyé.":"L’envoi d’e-mails n’est pas encore configuré : conservez ce code et ce lien (ils restent disponibles dans « Mes commandes »)."}</p></section></div>}
  </main>;
}
