"use client";

import { useMemo, useState } from "react";
import { Search, ShoppingBag, MapPin, UserRound, Menu, ChevronRight, Laptop, Shirt, Home, Sparkles, Apple, Hammer, Heart, SlidersHorizontal } from "lucide-react";
import { AuthPanel } from "@/components/auth-panel";

const categories = [
  { name: "Électronique", icon: Laptop },
  { name: "Mode", icon: Shirt },
  { name: "Maison", icon: Home },
  { name: "Beauté", icon: Sparkles },
  { name: "Alimentation", icon: Apple },
  { name: "Construction", icon: Hammer }
];

const products = [
  { id: 1, name: "Écouteurs sans fil Bluetooth", category: "Électronique", price: 2450, location: "Port-au-Prince", seller: "Tech Lakay", color: "linear-gradient(135deg,#dce8f8,#f6f9ff)", mark: "♪" },
  { id: 2, name: "Sac à main quotidien", category: "Mode", price: 1850, location: "Cap-Haïtien", seller: "Belle Boutique", color: "linear-gradient(135deg,#f4e6df,#fff8f3)", mark: "◇" },
  { id: 3, name: "Lampe de chevet moderne", category: "Maison", price: 3200, location: "Pétion-Ville", seller: "Kay Lakay", color: "linear-gradient(135deg,#f4eddb,#fffdf6)", mark: "◉" },
  { id: 4, name: "Soin visage naturel", category: "Beauté", price: 950, location: "Les Cayes", seller: "Natirèl Ayiti", color: "linear-gradient(135deg,#e2eee4,#f7fff8)", mark: "✳" },
  { id: 5, name: "Panier de produits locaux", category: "Alimentation", price: 1600, location: "Jacmel", seller: "Marché Péyi", color: "linear-gradient(135deg,#f2e8d7,#fffaf0)", mark: "✿" },
  { id: 6, name: "Kit outils maison", category: "Construction", price: 4900, location: "Gonaïves", seller: "Bati Plus", color: "linear-gradient(135deg,#e6e9ed,#fbfcfd)", mark: "⚒" }
];

const money = (value: number) => new Intl.NumberFormat("fr-HT", { maximumFractionDigits: 0 }).format(value) + " HTG";

export default function HomePage() {
  const [activeCategory, setActiveCategory] = useState("Tout");
  const [search, setSearch] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const filtered = useMemo(() => products.filter(p =>
    (activeCategory === "Tout" || p.category === activeCategory) &&
    (p.name + p.category + p.location + p.seller).toLowerCase().includes(search.toLowerCase())
  ), [activeCategory, search]);

  return (
    <main>
      <div className="topline"><span>HaïtiShop</span><span>Le commerce local, partout en Haïti</span><span>FR&nbsp; | &nbsp;KRE&nbsp; | &nbsp;EN</span></div>
      <header className="header">
        <a className="brand" href="#"><img src="https://res.cloudinary.com/dcclzhsim/image/upload/q_auto:best/copy_of_file_000000004b4481f5856e94a87bad615e_awp5pa.png" alt="HaïtiShop" /><span>Haïti<span>Shop</span></span></a>
        <nav className="desktop-nav"><a href="#catalogue">Acheter</a><a href="#categories">Catégories</a><a href="#vendeurs">Vendre sur HaïtiShop</a></nav>
        <div className="header-actions"><button className="icon-btn" aria-label="Compte" onClick={() => setAuthOpen(true)}><UserRound size={19}/><span>Connexion</span></button><button className="bag-btn" onClick={() => document.getElementById("catalogue")?.scrollIntoView({behavior:"smooth"})}><ShoppingBag size={18}/> Panier <b>0</b></button><button className="mobile-menu" aria-label="Menu"><Menu/></button></div>
      </header>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span/> LE MARCHÉ HAÏTIEN EN LIGNE</div><h1>Tout ce qu’il vous faut.<br/><em>Près de chez vous.</em></h1><p>Découvrez les produits des commerçants haïtiens. Achetez local, comparez les offres et trouvez ce dont vous avez besoin.</p>
          <div className="hero-search"><Search size={20}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Que recherchez-vous aujourd’hui ?"/><button onClick={()=>document.getElementById("catalogue")?.scrollIntoView({behavior:"smooth"})}>Rechercher</button></div>
          <div className="hero-meta"><span><MapPin size={15}/> Des vendeurs partout en Haïti</span><span>Prix en gourdes haïtiennes</span></div>
        </div>
        <div className="hero-art"><div className="art-card art-main"><div className="art-label">LE CHOIX LOCAL</div><div className="art-orbit">H</div><strong>Le commerce<br/>haïtien avance.</strong><span>Une place de marché pour tous.</span></div><div className="float-tag"><span className="float-dot"/> Produits locaux</div><div className="float-mini"><ShoppingBag size={19}/><div><b>HaïtiShop</b><small>Tout près de vous</small></div></div></div>
      </section>
      <section className="benefits"><div><span>01</span><b>Commerçants locaux</b><small>Découvrez les vendeurs près de vous</small></div><div><span>02</span><b>Prix en HTG</b><small>Des prix affichés en gourdes</small></div><div><span>03</span><b>Achat simplifié</b><small>Commande et confirmation WhatsApp</small></div></section>
      <section className="section" id="categories"><div className="section-heading"><div><span className="eyebrow">EXPLORER</span><h2>Nos catégories</h2></div><a href="#catalogue">Tout explorer <ChevronRight size={16}/></a></div><div className="category-grid">{categories.map(({name,icon:Icon})=><button key={name} className={activeCategory===name?"category active":"category"} onClick={()=>{setActiveCategory(name);document.getElementById("catalogue")?.scrollIntoView({behavior:"smooth"})}}><span><Icon size={22}/></span><b>{name}</b></button>)}</div></section>
      <section className="section catalogue" id="catalogue"><div className="section-heading"><div><span className="eyebrow">SÉLECTION HAÏTISHOP</span><h2>À découvrir</h2><p>Une sélection de produits pour commencer votre shopping.</p></div><button className="filter-btn" onClick={()=>setActiveCategory("Tout")}><SlidersHorizontal size={16}/> Réinitialiser</button></div><div className="filter-row"><button className={activeCategory==="Tout"?"chip selected":"chip"} onClick={()=>setActiveCategory("Tout")}>Tout</button>{categories.map(c=><button key={c.name} className={activeCategory===c.name?"chip selected":"chip"} onClick={()=>setActiveCategory(c.name)}>{c.name}</button>)}</div><div className="product-grid">{filtered.map(p=><article className="product" key={p.id}><div className="product-image" style={{background:p.color}}><span>{p.mark}</span><button aria-label="Ajouter aux favoris"><Heart size={17}/></button></div><div className="product-info"><small>{p.category}</small><h3>{p.name}</h3><b>{money(p.price)}</b><span><MapPin size={13}/>{p.location} · {p.seller}</span><button className="add-btn" onClick={()=>setAuthOpen(true)}>Voir le produit</button></div></article>)}</div>{filtered.length===0&&<p className="empty">Aucun produit ne correspond à votre recherche.</p>}</section>
      <section className="seller-band" id="vendeurs"><div><span className="eyebrow">VOUS ÊTES COMMERÇANT ?</span><h2>Votre boutique mérite<br/>d’être découverte.</h2><p>Rejoignez HaïtiShop et présentez vos produits à des clients partout en Haïti.</p></div><button onClick={()=>setAuthOpen(true)}>Créer mon compte vendeur <ChevronRight size={17}/></button></section>
      <footer><a className="footer-brand" href="#">HaïtiShop</a><span>Le commerce local, partout en Haïti.</span><span>© 2026 HaïtiShop · Démonstration</span></footer>
      {authOpen&&<AuthPanel onClose={()=>setAuthOpen(false)}/>}
    </main>
  );
}
