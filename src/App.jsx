import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, BadgeCheck, Bone, CalendarDays, Check,
  ChevronRight, Clock3, Eye, EyeOff, Facebook, Heart, Instagram, Leaf, LogIn,
  MapPin, Menu, Minus, PawPrint, Plus, Scissors, ShieldCheck, ShoppingBag,
  ShoppingCart, Sparkles, Star, Truck, UserRound, X,
} from "lucide-react";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = () => {
  const date = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${date.year}-${date.month}-${date.day}`;
};
const photo = (url, width = 900) => `${url}${url.includes("?") ? "&" : "?"}auto=format&fit=crop&w=${width}&q=85`;

async function request(path, options = {}) {
  const token = localStorage.getItem("pets-token");
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir. Tente novamente.");
  return data;
}

function App() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState("home");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [cart, setCart] = useState(() => JSON.parse(localStorage.getItem("pets-cart") || "[]"));
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("pets-user") || "null"));
  const [modal, setModal] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setData(await request("/bootstrap")); }
    catch (error) { setToast(error.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { localStorage.setItem("pets-cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 3800);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const openBooking = () => setModal("booking");
    document.addEventListener("open-booking", openBooking);
    return () => document.removeEventListener("open-booking", openBooking);
  }, []);

  const go = (next) => {
    setPage(next);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const addToCart = (product) => {
    if (product.prescription_required) return setToast("Esse produto precisa de receita e não pode ser comprado por aqui.");
    const current = cart.find((item) => item.id === product.id);
    if (current?.quantity >= product.stock) return setToast("Você chegou ao limite disponível em estoque.");
    setCart(current
      ? cart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...cart, { ...product, quantity: 1 }]);
    setToast(`${product.name} adicionado à sacola`);
  };
  const updateCart = (id, quantity) => setCart((items) => quantity < 1 ? items.filter((item) => item.id !== id) : items.map((item) => item.id === id ? { ...item, quantity: Math.min(quantity, item.stock) } : item));
  const signOut = () => {
    localStorage.removeItem("pets-token"); localStorage.removeItem("pets-user");
    setUser(null); go("home"); setToast("Você saiu da sua conta.");
  };
  const onLogin = (result) => {
    localStorage.setItem("pets-token", result.token);
    localStorage.setItem("pets-user", JSON.stringify(result.user));
    setUser(result.user); setModal(""); setToast(`Que bom ter você por aqui, ${result.user.name.split(" ")[0]}!`);
    go(result.user.role === "admin" ? "admin" : "account");
  };

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const shared = { data, user, setUser, cart, setCart, addToCart, updateCart, request, setToast, setModal, go, refresh };
  if (loading) return <div className="loading-screen"><span className="loader" /><span>Preparando um cantinho especial...</span></div>;

  return (
    <div className="app-shell">
      <div className="announcement"><PawPrint size={13} /> Frete grátis em compras acima de R$ 150 <span>•</span> Cuidado com carinho em cada entrega</div>
      <header className="site-header">
        <button className="brand" onClick={() => go("home")} aria-label="Pets PetShop, início">
          <span className="brand-mark"><PawPrint size={22} fill="currentColor" /></span>
          <span className="brand-name">pets<span>petshop</span><small>um mundo de carinho</small></span>
        </button>
        <button className="mobile-toggle icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir menu">{mobileMenu ? <X /> : <Menu />}</button>
        <nav className={`main-nav ${mobileMenu ? "is-open" : ""}`}>
          <button className={page === "home" ? "active" : ""} onClick={() => go("home")}>Início</button>
          <button className={page === "services" ? "active" : ""} onClick={() => go("services")}>Banho & tosa</button>
          <button className={page === "shop" ? "active" : ""} onClick={() => go("shop")}>Loja</button>
          <button onClick={() => document.getElementById("about")?.scrollIntoView({ behavior: "smooth" })}>Sobre nós</button>
        </nav>
        <div className="header-actions">
          <button className="header-icon" onClick={() => setModal("cart")} aria-label="Abrir sacola"><ShoppingBag size={19} /><span>Sacola</span>{cartCount > 0 && <b className="cart-count">{cartCount}</b>}</button>
          {user ? <button className="account-chip" onClick={() => go(user.role === "admin" ? "admin" : "account")}><UserRound size={17} /><span>{user.name.split(" ")[0]}</span></button> : <button className="account-chip" onClick={() => setModal("login")}><LogIn size={17} /><span>Entrar</span></button>}
        </div>
      </header>

      <main>
        {page === "home" && <Home {...shared} />}
        {page === "shop" && <Shop {...shared} />}
        {page === "services" && <Services {...shared} />}
        {page === "account" && (user ? <Account {...shared} signOut={signOut} /> : <EmptyState title="Entre para acessar sua conta" button="Fazer login" onClick={() => setModal("login")} />)}
        {page === "admin" && (user?.role === "admin" ? <Admin {...shared} /> : <EmptyState title="Área exclusiva da equipe" button="Entrar como administrador" onClick={() => setModal("login")} />)}
      </main>

      <Footer data={data} go={go} setModal={setModal} />
      {modal === "booking" && <Booking {...shared} service={data?.services?.find((item) => item.id === Number(window.bookingService))} onClose={() => setModal("")} />}
      {modal === "cart" && <CartDrawer {...shared} onClose={() => setModal("")} refresh={refresh} />}
      {modal === "login" && <LoginModal onClose={() => setModal("")} onLogin={onLogin} request={request} setToast={setToast} />}
      {toast && <div className="toast"><span className="toast-check"><Check size={15} /></span>{toast}<button onClick={() => setToast("")} aria-label="Fechar"><X size={15} /></button></div>}
    </div>
  );
}

function Home({ data, go, addToCart, setModal, setToast }) {
  const products = data?.products || [];
  const services = data?.services || [];
  return <>
    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow"><Sparkles size={14} /> Um cuidado que vem do coração</span>
        <h1>Todo carinho e cuidado que seu melhor amigo <em>merece.</em></h1>
        <p>Mais do que um pet shop, um lugar feito para celebrar o amor que vocês compartilham.</p>
        <div className="hero-actions">
          <button className="button button-primary" onClick={() => { window.bookingService = services[0]?.id; setModal("booking"); }}>Agendar serviço <ArrowRight size={17} /></button>
          <button className="button button-light" onClick={() => go("shop")}>Conhecer nossa loja <ShoppingBag size={16} /></button>
        </div>
        <div className="hero-note"><span className="avatar-stack"><i>🐶</i><i>🐱</i><i>🐕</i></span><span><b>+2 mil pets felizes</b><small>e seus humanos também ♡</small></span></div>
      </div>
      <div className="hero-image">
        <img src={photo("https://images.unsplash.com/photo-1552053831-71594a27632d")} alt="Golden retriever recebendo carinho" />
        <div className="hero-sticker"><span>♡</span><b>Amor em<br />cada detalhe</b><small>desde 2018</small></div>
        <div className="hero-float"><span className="float-icon"><PawPrint size={18} /></span><span><b>Um cuidado especial</b><small>do focinho à patinha</small></span><BadgeCheck size={20} className="float-badge" /></div>
      </div>
      <div className="hero-doodle doodle-one">✳</div><div className="hero-doodle doodle-two">✦</div>
    </section>

    <section className="trust-row">
      <div><span className="trust-icon mint"><Heart size={20} /></span><span><b>Feito com amor</b><small>carinho em cada cuidado</small></span></div>
      <div><span className="trust-icon peach"><ShieldCheck size={20} /></span><span><b>Cuidado seguro</b><small>equipe que ama o que faz</small></span></div>
      <div><span className="trust-icon lilac"><Truck size={20} /></span><span><b>Entrega com carinho</b><small>até a porta da sua casa</small></span></div>
      <div><span className="trust-icon yellow"><Leaf size={20} /></span><span><b>Escolhas conscientes</b><small>produtos que fazem bem</small></span></div>
    </section>

    <section className="section services-preview">
      <SectionHeading eyebrow="Um momento só deles" title={<>Cuidado de verdade,<br /><em>em cada detalhe.</em></>} description="Da hora do banho àquele carinho extra, seu melhor amigo está em boas mãos." action="Ver todos os serviços" onAction={() => go("services")} />
      <div className="service-grid">
        {services.slice(0, 3).map((service, index) => <article className="service-card" key={service.id}>
          <div className="service-photo"><img src={photo(service.image, 700)} alt={service.name} /><span className="service-number">0{index + 1}</span></div>
          <div className="service-card-copy"><div><h3>{service.name}</h3><p>{service.description}</p></div><div className="service-card-bottom"><b>{money(service.price)}</b><button className="round-arrow" aria-label={`Agendar ${service.name}`} onClick={() => { window.bookingService = service.id; setModal("booking"); }}><ArrowRight size={17} /></button></div></div>
        </article>)}
      </div>
    </section>

    <section className="shop-feature">
      <div className="shop-feature-copy"><span className="eyebrow">Achadinhos cheios de carinho</span><h2>Um mimo a mais<br />faz <em>bem pra todo mundo.</em></h2><p>Selecionamos cada produto pensando na alegria, no conforto e no bem-estar do seu companheiro.</p><button className="button button-primary" onClick={() => go("shop")}>Explorar a loja <ArrowRight size={16} /></button><div className="shop-feature-ornament">✳</div></div>
      <div className="product-showcase">
        {products.slice(0, 3).map((product, index) => <ProductCard key={product.id} product={product} addToCart={addToCart} compact={index === 1} />)}
      </div>
    </section>

    <section className="section story-section" id="about">
      <div className="story-images"><img className="story-main" src={photo("https://images.unsplash.com/photo-1601758228041-f3b2795255f1")} alt="Cachorro recebendo carinho" /><img className="story-small" src={photo("https://images.unsplash.com/photo-1573865526739-10659fec78a5", 500)} alt="Gatinho tranquilo" /><div className="story-seal"><Heart size={18} fill="currentColor" /><b>Um amor<br />que se sente</b></div></div>
      <div className="story-copy"><span className="eyebrow">A gente entende esse amor</span><h2>Família é quem<br />tem <em>patinhas.</em></h2><p>O Pets nasceu de um desejo simples: criar um espaço onde cada pet fosse recebido como parte da família. Aqui, cada banho, cada escolha e cada encontro são feitos com respeito, cuidado e muito amor.</p><div className="story-signoff"><span className="sign-line" /><span><b>Com carinho,</b><small>time Pets PetShop</small></span></div><button className="text-link" onClick={() => { setToast("Estamos na Rua das Paineiras, 245. Vai ser um prazer receber vocês!"); }}>Nossa história <ArrowRight size={16} /></button></div>
    </section>

    <section className="reviews-section"><div className="reviews-top"><SectionHeading eyebrow="Amor compartilhado" title={<>Quem cuida com a gente<br /><em>conta melhor.</em></>} description="Histórias reais de quem já faz parte da nossa família." /><div className="rating-summary"><div className="stars"><Star /><Star /><Star /><Star /><Star /></div><b>4,9 <span>/ 5</span></b><small>mais de 180 avaliações</small></div></div>
      <div className="review-grid">{(data?.reviews || []).slice(0, 3).map((review, index) => <article className="review-card" key={review.id}><span className="quote-mark">“</span><div className="stars small-stars">{Array.from({ length: review.rating }, (_, i) => <Star key={i} />)}</div><p>{review.comment}</p><div className="review-author"><span className={`review-avatar avatar-${index}`}>{["C", "P", "A"][index]}</span><span><b>{review.customer_name}</b><small>cliente Pets PetShop</small></span><BadgeCheck size={17} /></div></article>)}</div>
    </section>
    <section className="visit-strip"><div className="visit-icon"><MapPin size={22} /></div><div><span className="eyebrow">Nossa porta está sempre aberta</span><h3>Um cheirinho de banho e um café te esperam.</h3><p>{data?.company?.address || "Rua das Paineiras, 245 — Vila Verde, São Paulo — SP"}</p></div><button className="button button-outline" onClick={() => setToast(`${data?.company?.hours || "Seg a sáb, das 9h às 18h"} · ${data?.company?.phone || "(11) 3456-7890"}`)}>Como chegar <ArrowRight size={16} /></button></section>
  </>;
}

function SectionHeading({ eyebrow, title, description, action, onAction }) {
  return <div className="section-heading"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}{action && <button className="text-link" onClick={onAction}>{action}<ArrowRight size={16} /></button>}</div>;
}

function ProductCard({ product, addToCart, compact = false }) {
  return <article className={`product-card ${compact ? "product-compact" : ""}`}>
    <div className="product-image"><img src={photo(product.image, 700)} alt={product.name} />{product.original_price && <span className="product-badge">oferta especial</span>}<button className="favorite-button" aria-label="Favoritar produto"><Heart size={17} /></button></div>
    <div className="product-info"><small className="product-category">{product.category}</small><h3>{product.name}</h3><div className="product-rating"><Star size={12} fill="currentColor" /> {Number(product.rating || 5).toFixed(1)} <span>({product.stock > 0 ? "bem avaliado" : "indisponível"})</span></div><div className="product-buy"><div><b>{money(product.price)}</b>{product.original_price && <del>{money(product.original_price)}</del>}</div><button className="add-button" onClick={() => addToCart(product)} disabled={product.stock < 1 || product.prescription_required} aria-label={`Adicionar ${product.name} à sacola`}><Plus size={18} /></button></div></div>
  </article>;
}

function Shop({ data, addToCart }) {
  const [category, setCategory] = useState("Todos");
  const products = data?.products || [];
  const shown = category === "Todos" ? products : products.filter((p) => p.category === category);
  return <div className="page-wrap shop-page">
    <PageIntro eyebrow="A lojinha do bem" title={<>Pequenos mimos,<br /><em>grandes momentos.</em></>} description="Escolhas feitas com carinho para deixar a rotina do seu melhor amigo ainda mais gostosa." />
    <div className="shop-toolbar"><div className="category-pills"><button className={category === "Todos" ? "selected" : ""} onClick={() => setCategory("Todos")}>Tudo por aqui</button>{(data?.categories || []).map((item) => <button className={category === item.name ? "selected" : ""} key={item.id} onClick={() => setCategory(item.name)}>{item.name}</button>)}</div><span>{shown.length} produtos especiais</span></div>
    <div className="product-grid">{shown.map((product) => <ProductCard key={product.id} product={product} addToCart={addToCart} />)}</div>
    <div className="shop-assurance"><ShieldCheck size={20} /><span><b>Compra tranquila, coração leve.</b><small>Checkout demonstrativo e seguro. Nenhuma cobrança real é realizada.</small></span></div>
  </div>;
}

function PageIntro({ eyebrow, title, description }) {
  return <div className="page-intro"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>;
}

function Services({ data, setModal }) {
  return <div className="page-wrap services-page">
    <PageIntro eyebrow="Banho, cuidado e carinho" title={<>Um dia de spa<br /><em>do jeitinho deles.</em></>} description="Profissionais que amam o que fazem, produtos delicados e muito respeito pelo tempo de cada pet." />
    <div className="service-list">{(data?.services || []).map((service) => <article className="service-row" key={service.id}><img src={photo(service.image, 500)} alt="" /><div className="service-row-copy"><span className="eyebrow">{service.duration_minutes} min de cuidado</span><h3>{service.name}</h3><p>{service.description}</p></div><b className="service-price">{money(service.price)}</b><button className="button button-primary" onClick={() => { window.bookingService = service.id; setModal("booking"); }}>Agendar <ArrowRight size={15} /></button></article>)}</div>
    <div className="service-note"><PawPrint size={20} /><p>Tem dúvida sobre qual cuidado escolher? <b>Fale com a gente</b> e encontramos juntos o melhor para o seu pet.</p></div>
  </div>;
}

function Booking({ data, service: initialService, user, request, setToast, onClose }) {
  const services = data?.services || [];
  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState(initialService?.id || services[0]?.id || "");
  const [slots, setSlots] = useState([]);
  const [form, setForm] = useState({ petName: "", species: "Cachorro", size: "Pequeno", breed: "", age: "", customerName: user?.name || "", customerPhone: user?.phone || "", date: today(), time: "" });
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const service = services.find((s) => s.id === Number(serviceId));
  useEffect(() => { if (!serviceId || !form.date) return; request(`/availability?date=${form.date}&serviceId=${serviceId}`).then((result) => setSlots(result.slots)).catch((error) => setToast(error.message)); }, [serviceId, form.date]);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const next = () => {
    if (step === 1 && !serviceId) return setToast("Escolha um serviço para continuar.");
    if (step === 2 && (!form.petName || !form.date || !form.time)) return setToast("Preencha as informações do pet, data e horário.");
    if (step === 3 && (!form.customerName || form.customerPhone.replace(/\D/g, "").length < 8)) return setToast("Informe seu nome e telefone para confirmar.");
    setStep(step + 1);
  };
  const confirm = async () => {
    setSaving(true);
    try {
      const result = await request("/appointments", { method: "POST", body: JSON.stringify({ ...form, serviceId, age: form.age || null }) });
      setConfirmed(result);
      setStep(4);
    } catch (error) { setToast(error.message); if (error.message.includes("reservado")) setForm((current) => ({ ...current, time: "" })); }
    finally { setSaving(false); }
  };
  const dateMin = today();
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="booking-modal modal-panel">
      <button className="modal-close" onClick={onClose} aria-label="Fechar"><X /></button>
      {step < 4 ? <><div className="modal-heading"><span className="eyebrow">Vamos marcar um momento especial</span><h2>Agende o <em>cuidado.</em></h2><p>É rapidinho — leva menos de dois minutinhos ♡</p></div><div className="step-indicator">{[1, 2, 3].map((n) => <span className={step >= n ? "current" : ""} key={n}><i>{step > n ? <Check size={13} /> : n}</i><small>{["O cuidado", "Seu pet", "Seus dados"][n - 1]}</small></span>)}</div>
        {step === 1 && <div className="booking-step"><label className="field-label">Qual cuidado vamos escolher?</label><div className="booking-services">{services.map((item) => <button className={`booking-service ${Number(serviceId) === item.id ? "chosen" : ""}`} key={item.id} onClick={() => setServiceId(item.id)}><span><b>{item.name}</b><small>{item.duration_minutes} min · {money(item.price)}</small></span><span className="radio-dot" /></button>)}</div></div>}
        {step === 2 && <div className="booking-step form-grid"><label className="field full">Nome do pet<input autoFocus value={form.petName} onChange={(e) => set("petName", e.target.value)} placeholder="Como ele(a) se chama?" /></label><label className="field">Espécie<select value={form.species} onChange={(e) => set("species", e.target.value)}><option>Cachorro</option><option>Gato</option></select></label><label className="field">Porte<select value={form.size} onChange={(e) => set("size", e.target.value)}><option>Pequeno</option><option>Médio</option><option>Grande</option></select></label><label className="field">Raça <small>(opcional)</small><input value={form.breed} onChange={(e) => set("breed", e.target.value)} placeholder="Ex.: Golden retriever" /></label><label className="field">Idade <small>(opcional)</small><input type="number" min="0" max="40" value={form.age} onChange={(e) => set("age", e.target.value)} placeholder="Anos" /></label><label className="field full">Escolha um dia<input type="date" min={dateMin} value={form.date} onChange={(e) => { set("date", e.target.value); set("time", ""); }} /></label><div className="field full"><span className="field-label">Horários disponíveis <small>· atendimento das 9h às 18h</small></span><div className="time-slots">{slots.length ? slots.map((time) => <button type="button" className={form.time === time ? "selected" : ""} key={time} onClick={() => set("time", time)}>{time}</button>) : <span className="empty-slots">Sem horários nesse dia. Tente outra data.</span>}</div></div></div>}
        {step === 3 && <div className="booking-step form-grid"><div className="booking-summary full"><CalendarDays size={20} /><span><b>{service?.name}</b><small>{new Date(`${form.date}T12:00:00`).toLocaleDateString("pt-BR", { dateStyle: "long" })} às {form.time} · {form.petName}</small></span><strong>{money(service?.price)}</strong></div><label className="field full">Seu nome<input autoFocus value={form.customerName} onChange={(e) => set("customerName", e.target.value)} placeholder="Como podemos te chamar?" /></label><label className="field full">Telefone / WhatsApp<input value={form.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} placeholder="(11) 99999-9999" /></label><p className="privacy-note full"><ShieldCheck size={15} /> Usamos seus dados apenas para cuidar bem do seu pet e confirmar o horário.</p></div>}
        <div className="modal-footer">{step > 1 && <button className="button button-light" onClick={() => setStep(step - 1)}><ArrowLeft size={15} /> Voltar</button>}<button className="button button-primary" onClick={step === 3 ? confirm : next} disabled={saving}>{saving ? "Confirmando..." : step === 3 ? "Confirmar agendamento" : "Continuar"} <ArrowRight size={15} /></button></div></> :
        <div className="booking-success"><span className="success-icon"><Check size={30} /></span><span className="eyebrow">Está marcado!</span><h2>Uma patinha feliz<br />vem aí. <em>♡</em></h2><p>O <b>{confirmed?.petName}</b> está agendado para <b>{new Date(`${confirmed?.date}T12:00:00`).toLocaleDateString("pt-BR", { dateStyle: "long" })}</b> às <b>{confirmed?.time}</b>.</p><div className="confirmation-detail"><Scissors size={18} /><span>{confirmed?.service}<small>com {confirmed?.employee}</small></span><b>{money(service?.price)}</b></div><a className="button button-whatsapp" href={`https://wa.me/${data?.company?.whatsapp}?text=${encodeURIComponent(`Oi! Acabei de agendar ${confirmed?.service} para o(a) ${confirmed?.petName} no dia ${confirmed?.date} às ${confirmed?.time}. Agendamento #${confirmed?.id}.`)}`} target="_blank" rel="noreferrer">Enviar detalhes pelo WhatsApp <ArrowRight size={16} /></a><button className="text-link" onClick={onClose}>Voltar ao site</button></div>}
    </section>
  </div>;
}

function CartDrawer({ cart, updateCart, request, setToast, onClose, refresh }) {
  const [checkout, setCheckout] = useState(false);
  const [form, setForm] = useState({ customerName: "", customerEmail: "", customerPhone: "", fulfillment: "delivery", address: "", paymentMethod: "pix" });
  const [done, setDone] = useState(null);
  const [saving, setSaving] = useState(false);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = form.fulfillment === "pickup" || subtotal >= 150 ? 0 : cart.length ? 12 : 0;
  const complete = async () => {
    if (!form.customerName.trim() || !form.customerEmail.includes("@") || form.customerPhone.replace(/\D/g, "").length < 8) return setToast("Preencha seus dados de contato para continuar.");
    if (form.fulfillment === "delivery" && form.address.trim().length < 8) return setToast("Informe o endereço completo para a entrega.");
    setSaving(true);
    try {
      const result = await request("/orders", { method: "POST", body: JSON.stringify({ ...form, items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })) }) });
      setDone(result); setCartClear(); refresh();
    } catch (error) { setToast(error.message); refresh(); }
    finally { setSaving(false); }
  };
  const setCartClear = () => cart.forEach((item) => updateCart(item.id, 0));
  return <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><aside className="cart-drawer">
    <div className="drawer-header"><div><span className="eyebrow">{done ? "Oba, chegou!" : checkout ? "Quase lá" : "Escolhidos com carinho"}</span><h2>{done ? "Pedido recebido" : checkout ? "Finalizar pedido" : "Sua sacolinha"} {!done && !checkout && <small>({cart.reduce((sum, item) => sum + item.quantity, 0)})</small>}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X /></button></div>
    {done ? <div className="order-success"><span className="success-icon"><Check size={30} /></span><h3>Pedido #{done.id} confirmado!</h3><p>Seu pedido demonstrativo foi recebido. Nenhuma cobrança real foi feita.</p><div className="order-total"><span>Total do pedido</span><b>{money(done.total)}</b></div><button className="button button-primary full-button" onClick={onClose}>Continuar passeando</button></div> :
      <>{!checkout ? <div className="cart-content">{cart.length === 0 ? <div className="empty-cart"><span><ShoppingBag size={29} /></span><h3>Sua sacolinha está esperando.</h3><p>Encontre aquele mimo que vai fazer o rabinho balançar.</p><button className="button button-primary" onClick={onClose}>Conhecer a loja <ArrowRight size={15} /></button></div> : <>{cart.map((item) => <div className="cart-item" key={item.id}><img src={photo(item.image, 200)} alt="" /><div className="cart-item-copy"><small>{item.category}</small><b>{item.name}</b><strong>{money(item.price)}</strong><div className="quantity-control"><button aria-label="Diminuir quantidade" onClick={() => updateCart(item.id, item.quantity - 1)}><Minus size={13} /></button><span>{item.quantity}</span><button aria-label="Aumentar quantidade" onClick={() => updateCart(item.id, item.quantity + 1)}><Plus size={13} /></button><button className="remove-item" onClick={() => updateCart(item.id, 0)}>remover</button></div></div></div>)}<div className="cart-summary"><div><span>Subtotal</span><b>{money(subtotal)}</b></div><div><span>Entrega</span><b>{shipping === 0 ? "Grátis" : money(shipping)}</b></div>{subtotal < 150 && <div className="shipping-hint">Faltam {money(150 - subtotal)} para o frete grátis ♡</div>}<div className="cart-total"><span>Total</span><b>{money(subtotal + shipping)}</b></div><button className="button button-primary full-button" onClick={() => setCheckout(true)}>Continuar para entrega <ArrowRight size={16} /></button><p className="checkout-disclaimer"><ShieldCheck size={14} /> Checkout demonstrativo — sem cobrança real</p></div></>}</div> :
      <div className="checkout-content"><button className="back-link" onClick={() => setCheckout(false)}><ArrowLeft size={14} /> Voltar à sacola</button><div className="checkout-fields"><label className="field full">Nome completo<input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Seu nome" /></label><label className="field full">E-mail<input type="email" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} placeholder="voce@email.com" /></label><label className="field full">Telefone<input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} placeholder="(11) 99999-9999" /></label><label className="field full">Como quer receber?<select value={form.fulfillment} onChange={(e) => setForm({ ...form, fulfillment: e.target.value })}><option value="delivery">Entrega em casa</option><option value="pickup">Retirar na loja — grátis</option></select></label>{form.fulfillment === "delivery" && <label className="field full">Endereço de entrega<textarea rows="3" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, bairro, cidade e CEP" /></label>}<label className="field full">Pagamento demonstrativo<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}><option value="pix">Pix — demonstração</option><option value="card">Cartão — demonstração</option><option value="store">Pagar na retirada</option></select></label></div><div className="cart-total checkout-grand"><span>Total</span><b>{money(subtotal + shipping)}</b></div><button className="button button-primary full-button" disabled={saving} onClick={complete}>{saving ? "Enviando..." : "Confirmar pedido"} <ArrowRight size={16} /></button><p className="checkout-disclaimer"><ShieldCheck size={14} /> Sem gateway de pagamento: não faremos cobrança.</p></div>}</>}
  </aside></div>;
}

function LoginModal({ onClose, onLogin, request, setToast }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try { onLogin(await request(mode === "login" ? "/auth/login" : "/auth/register", { method: "POST", body: JSON.stringify(form) })); }
    catch (error) { setToast(error.message); }
    finally { setSaving(false); }
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="login-modal modal-panel">
        <button className="modal-close" onClick={onClose} aria-label="Fechar"><X /></button>
        <div className="login-mark"><PawPrint size={25} /></div>
        <span className="eyebrow">Que bom ter você aqui</span>
        <h2>{mode === "login" ? <>Entre no nosso <em>cantinho.</em></> : <>Vem fazer parte<br /><em>da família.</em></>}</h2>
        <p>Acompanhe seus pedidos, agendamentos e muito mais.</p>
        <form onSubmit={submit} className="login-form">
          {mode === "register" && <>
            <label className="field">Seu nome<input required minLength="2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome completo" /></label>
            <label className="field">Telefone<input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" /></label>
          </>}
          <label className="field">E-mail<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="voce@email.com" /></label>
          <label className="field">Senha
            <span className="password-input-wrap">
              <input required minLength={mode === "register" ? 8 : 1} type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={mode === "register" ? "Pelo menos 8 caracteres" : "Sua senha"} />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </span>
          </label>
          <button className="button button-primary full-button" disabled={saving}>{saving ? "Só um instante..." : mode === "login" ? "Entrar na minha conta" : "Criar minha conta"} <ArrowRight size={16} /></button>
        </form>
        <p className="login-switch">{mode === "login" ? "Ainda não tem uma conta?" : "Já tem uma conta?"} <button onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Criar conta" : "Fazer login"}</button></p>
      </section>
    </div>
  );
}

function Account({ user, setUser, request, setToast, setModal, signOut }) {
  const [tab, setTab] = useState("overview");
  const [orders, setOrders] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [pets, setPets] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reviewOptions, setReviewOptions] = useState([]);
  const [reviewForms, setReviewForms] = useState({});
  const [profile, setProfile] = useState({ name: user.name, phone: user.phone });
  const [form, setForm] = useState({ name: "", species: "Cachorro", size: "Pequeno", breed: "", age: "" });
  const [newPet, setNewPet] = useState(false);
  const load = useCallback(async () => {
    try { const [o, a, p, r, options] = await Promise.all([request("/my/orders"), request("/my/appointments"), request("/my/pets"), request("/my/reviews"), request("/my/review-options")]); setOrders(o); setAppointments(a); setPets(p); setReviews(r); setReviewOptions(options); }
    catch (error) { setToast(error.message); }
  }, [request, setToast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setProfile({ name: user.name, phone: user.phone }); }, [user]);
  const savePet = async (e) => { e.preventDefault(); try { await request("/my/pets", { method: "POST", body: JSON.stringify({ ...form, age: form.age || null }) }); setForm({ name: "", species: "Cachorro", size: "Pequeno", breed: "", age: "" }); setNewPet(false); load(); setToast("Seu pet foi cadastrado com carinho!"); } catch (error) { setToast(error.message); } };
  const cancel = async (id) => { try { await request(`/my/appointments/${id}/cancel`, { method: "PATCH" }); load(); setToast("Agendamento cancelado."); } catch (error) { setToast(error.message); } };
  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      const updated = await request("/my/profile", { method: "PATCH", body: JSON.stringify(profile) });
      setUser(updated); localStorage.setItem("pets-user", JSON.stringify(updated)); setToast("Seus dados foram atualizados.");
    } catch (error) { setToast(error.message); }
  };
  const submitReview = async (e, item) => {
    e.preventDefault();
    const key = `${item.target_type}-${item.target_id}`;
    const values = reviewForms[key] || { rating: 5, comment: "" };
    try {
      await request("/reviews", { method: "POST", body: JSON.stringify({ targetType: item.target_type, targetId: item.target_id, ...values }) });
      setReviewForms((current) => ({ ...current, [key]: { ...values, comment: "" } }));
      load(); setToast("Obrigada! Sua avaliação foi enviada para aprovação.");
    } catch (error) { setToast(error.message); }
  };
  const accountTabs = [["overview", "Visão geral", UserRound], ["profile", "Meus dados", UserRound], ["pets", "Meus pets", PawPrint], ["orders", "Meus pedidos", ShoppingBag], ["appointments", "Agendamentos", CalendarDays], ["reviews", "Avaliações", Star]];
  return <div className="account-page page-wrap"><aside className="account-sidebar"><div className="account-profile"><span className="profile-avatar">{user.name[0]}</span><span><b>{user.name}</b><small>família Pets desde hoje ♡</small></span></div><nav>{accountTabs.map(([id, label, Icon]) => <button className={tab === id ? "chosen" : ""} key={id} onClick={() => setTab(id)}><Icon size={17} />{label}{id === "pets" && <span>{pets.length}</span>}</button>)}</nav><button className="signout-button" onClick={signOut}>Sair da conta <ArrowRight size={15} /></button></aside>
    <div className="account-main"><div className="account-heading"><div><span className="eyebrow">Seu cantinho Pets</span><h1>{tab === "overview" ? <>Oi, {user.name.split(" ")[0]}! <em>♡</em></> : { profile: "Meus dados", pets: "Meus pets", orders: "Meus pedidos", appointments: "Meus agendamentos", reviews: "Minhas avaliações" }[tab]}</h1><p>Um resumo do que acontece com a sua família por aqui.</p></div><span className="account-paw"><PawPrint /></span></div>
      {tab === "overview" && <><div className="account-stats"><button onClick={() => setTab("pets")}><span className="stat-icon mint"><PawPrint /></span><b>{pets.length}</b><small>pets cadastrados</small></button><button onClick={() => setTab("orders")}><span className="stat-icon peach"><ShoppingBag /></span><b>{orders.length}</b><small>pedidos na lojinha</small></button><button onClick={() => setTab("appointments")}><span className="stat-icon lilac"><CalendarDays /></span><b>{appointments.filter((a) => a.status !== "cancelled").length}</b><small>cuidados agendados</small></button></div><div className="account-panels"><AccountList title="Próximos cuidados" items={appointments.filter((a) => a.status === "confirmed")} empty="Nenhum cuidado agendado ainda." /><AccountList title="Pedidos recentes" items={orders.slice(0, 3)} empty="Sua sacolinha ainda não virou pedido." /></div><button className="account-cta" onClick={() => { window.bookingService = 1; setModal("booking"); }}>Um banho de carinho? <span>Agende um horário <ArrowRight size={15} /></span></button></>}
      {tab === "pets" && <div className="account-list-card"><div className="list-card-heading"><div><b>Quem faz parte da família?</b><small>Cadastre seus companheiros para agilizar o agendamento.</small></div><button className="button button-primary" onClick={() => setNewPet(!newPet)}>{newPet ? "Fechar" : <><Plus size={15} /> Adicionar pet</>}</button></div>{newPet && <form className="pet-form" onSubmit={savePet}><label className="field">Nome<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label className="field">Espécie<select value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })}><option>Cachorro</option><option>Gato</option></select></label><label className="field">Porte<select value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })}><option>Pequeno</option><option>Médio</option><option>Grande</option></select></label><label className="field">Raça<input value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} /></label><button className="button button-primary">Salvar pet</button></form>}<div className="pet-cards">{pets.map((pet) => <div className="pet-card" key={pet.id}><span><PawPrint /></span><b>{pet.name}</b><small>{pet.species} · porte {pet.size.toLowerCase()}{pet.breed ? ` · ${pet.breed}` : ""}</small></div>)}{pets.length === 0 && <EmptyInline text="Cadastre seu primeiro pet para deixar tudo mais fácil." />}</div></div>}
      {tab === "orders" && <div className="account-list-card"><AccountList title="Seu histórico de carinho" items={orders} empty="Você ainda não fez nenhum pedido." /></div>}
      {tab === "appointments" && <div className="account-list-card"><div className="list-card-heading"><div><b>Agendamentos</b><small>Os próximos momentos de cuidado do seu pet.</small></div><span className="eyebrow">{appointments.length} no total</span></div>{appointments.map((a) => <div className="data-list-row" key={a.id}><span className="data-icon"><Scissors /></span><div><b>{a.service} · {a.pet_name}</b><small>{new Date(`${a.appointment_date}T12:00:00`).toLocaleDateString("pt-BR")} às {a.start_time}</small></div><span className={`status-pill status-${a.status}`}>{a.status === "confirmed" ? "Confirmado" : a.status === "completed" ? "Concluído" : "Cancelado"}</span>{a.status === "confirmed" && <button className="subtle-action" onClick={() => cancel(a.id)}>Cancelar</button>}</div>)}{appointments.length === 0 && <EmptyInline text="Seus próximos cuidados vão aparecer por aqui." />}</div>}
      {tab === "profile" && <section className="account-list-card profile-edit-card"><div className="list-card-heading"><div><b>Seus dados de contato</b><small>Mantenha suas informações em dia para receber novidades dos pedidos.</small></div></div><form className="profile-form" onSubmit={saveProfile}><label className="field">Nome completo<input required minLength="2" value={profile.name || ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label><label className="field">E-mail<input disabled value={user.email} /><small>O e-mail da conta não pode ser alterado.</small></label><label className="field">Telefone<input required value={profile.phone || ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label><button className="button button-primary">Salvar meus dados</button></form></section>}
      {tab === "reviews" && <section className="account-list-card"><div className="list-card-heading"><div><b>Conte como foi sua experiência</b><small>Avalie uma compra entregue ou serviço concluído.</small></div></div>{reviewOptions.map((item) => { const key = `${item.target_type}-${item.target_id}`; const values = reviewForms[key] || { rating: 5, comment: "" }; return <form className="customer-review-form" key={key} onSubmit={(e) => submitReview(e, item)}><div><b>{item.name}</b><small>{item.target_type === "product" ? "Produto comprado" : "Serviço concluído"}</small></div><div className="review-stars-picker" aria-label="Escolha uma nota">{[1, 2, 3, 4, 5].map((rating) => <button type="button" aria-label={`${rating} estrelas`} className={rating <= values.rating ? "on" : ""} key={rating} onClick={() => setReviewForms((current) => ({ ...current, [key]: { ...values, rating } }))}><Star size={16} fill="currentColor" /></button>)}</div><textarea required minLength="8" maxLength="1000" value={values.comment} onChange={(e) => setReviewForms((current) => ({ ...current, [key]: { ...values, comment: e.target.value } }))} placeholder="Conte um pouquinho do que achou..." /><button className="button button-primary">Enviar avaliação</button></form>; })}{reviewOptions.length === 0 && <EmptyInline text="Quando um pedido chegar ou um serviço for concluído, você poderá avaliar por aqui." />}<div className="my-reviews">{reviews.map((review) => <div className="data-list-row" key={review.id}><span className="data-icon"><Star /></span><div><b>{review.target_type === "product" ? "Avaliação de produto" : "Avaliação de serviço"} · {review.rating}/5 estrelas</b><small>{review.comment}</small></div><span className={`status-pill ${review.approved ? "" : "status-processing"}`}>{review.approved ? "Publicada" : "Em aprovação"}</span></div>)}</div></section>}
    </div>
  </div>;
}

function AccountList({ title, items, empty }) {
  return <section className="account-list-card"><div className="list-card-heading"><div><b>{title}</b><small>Um pouquinho do que acontece por aqui.</small></div></div>{items.slice(0, 4).map((item) => <div className="data-list-row" key={`${item.id}-${item.service || item.customer_name}`}><span className="data-icon">{item.service ? <Scissors /> : <ShoppingBag />}</span><div><b>{item.service ? `${item.service} · ${item.pet_name}` : `Pedido #${item.id} · ${money(item.total_cents / 100)}`}</b><small>{item.service ? `${new Date(`${item.appointment_date}T12:00:00`).toLocaleDateString("pt-BR")} às ${item.start_time}` : new Date(item.created_at).toLocaleDateString("pt-BR")}</small></div><span className="status-pill">{item.status === "confirmed" ? "Confirmado" : orderStatus(item.status)}</span></div>)}{items.length === 0 && <EmptyInline text={empty} />}</section>;
}

function EmptyInline({ text }) { return <div className="empty-inline"><PawPrint size={20} /><span>{text}</span></div>; }

function Admin({ data, request, setToast, refresh }) {
  const [tab, setTab] = useState("overview");
  const [dashboard, setDashboard] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [editing, setEditing] = useState(null);
  const [company, setCompany] = useState(data?.company || {});
  const [companySaved, setCompanySaved] = useState(false);
  const load = useCallback(async () => {
    try { const result = await request("/admin/dashboard"); setDashboard(result); }
    catch (error) { setToast(error.message); }
  }, [request, setToast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const loadTab = async () => {
      try {
        if (tab === "products") setProducts(await request("/admin/products"));
        if (tab === "orders") setOrders(await request("/admin/orders"));
        if (tab === "appointments") setAppointments(await request("/admin/appointments"));
        if (tab === "reviews") setReviews(await request("/admin/reviews"));
        if (tab === "categories") setCategories(await request("/admin/categories"));
        if (tab === "employees") setEmployees(await request("/admin/employees"));
      } catch (error) { setToast(error.message); }
    };
    loadTab();
  }, [tab, request, setToast]);
  const changeOrder = async (id, status) => { try { await request(`/admin/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setOrders(await request("/admin/orders")); load(); setToast("Pedido atualizado."); } catch (e) { setToast(e.message); } };
  const changeAppointment = async (id, status) => { try { await request(`/admin/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setAppointments(await request("/admin/appointments")); load(); setToast("Agendamento atualizado."); } catch (e) { setToast(e.message); } };
  const tabs = [["overview", "Visão geral", BadgeCheck], ["orders", "Pedidos", ShoppingBag], ["appointments", "Agendamentos", CalendarDays], ["products", "Produtos", Bone], ["categories", "Categorias", ShoppingBag], ["services", "Serviços", Scissors], ["employees", "Equipe", UserRound], ["reviews", "Avaliações", Star], ["company", "Minha loja", MapPin]];
  return <div className="admin-layout">
    <aside className="admin-sidebar"><div className="admin-brand"><span className="brand-mark"><PawPrint size={19} /></span><span><b>pets<span>petshop</span></b><small>painel da loja</small></span></div><div className="admin-nav-label">MENU PRINCIPAL</div><nav>{tabs.map(([id, label, Icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); setEditing(null); }}><Icon size={17} />{label}{id === "reviews" && reviews.filter((r) => !r.approved).length > 0 && <i>{reviews.filter((r) => !r.approved).length}</i>}</button>)}</nav><div className="admin-sidebar-bottom"><span className="admin-avatar">P</span><span><b>Admin Pets</b><small>Proprietário</small></span><span className="online-dot" /></div></aside>
    <div className="admin-content"><header className="admin-topbar"><div><span className="eyebrow">Terça-feira, um ótimo dia ♡</span><h1>{tabs.find(([id]) => id === tab)?.[1]}</h1></div><button className="admin-store-link" onClick={() => window.location.reload()}><ArrowLeft size={15} /> Voltar à loja</button></header>
      {tab === "overview" && <>{dashboard && <><div className="dashboard-welcome"><div><span className="eyebrow">Um resumo cheio de carinho</span><h2>Olá, time Pets! <em>✳</em></h2><p>Veja como está o movimento da sua loja neste mês.</p></div><div className="welcome-illustration">🐶<span>♡</span></div></div><div className="metric-grid"><Metric icon={ShoppingBag} label="Pedidos recebidos" value={dashboard.orders} tone="mint" change="desde o início da loja" /><Metric icon={CalendarDays} label="Agendamentos de hoje" value={dashboard.appointmentsToday} tone="peach" change="horários confirmados" /><Metric icon={Heart} label="Faturamento do mês" value={money(dashboard.revenue)} tone="lilac" change="pedidos entregues" /><Metric icon={Bone} label="Produtos no catálogo" value={data?.products?.length || 0} tone="yellow" change="itens disponíveis" /></div><div className="dashboard-panels"><section className="admin-card"><div className="admin-card-heading"><div><b>Pedidos recentes</b><small>Acompanhe as últimas compras.</small></div><button onClick={() => setTab("orders")}>Ver todos <ChevronRight size={14} /></button></div>{dashboard.recentOrders.length ? dashboard.recentOrders.map((o) => <div className="recent-order" key={o.id}><span className="order-avatar">{o.customer_name[0]}</span><div><b>{o.customer_name}</b><small>Pedido #{o.id} · {new Date(o.created_at).toLocaleDateString("pt-BR")}</small></div><strong>{money(o.total)}</strong><span className={`status-pill status-${o.status}`}>{orderStatus(o.status)}</span></div>) : <EmptyInline text="Seus primeiros pedidos vão aparecer aqui." />}</section><div className="admin-side-stack"><section className="admin-card"><div className="admin-card-heading"><div><b>Estoque baixinho</b><small>Hora de dar uma olhadinha.</small></div><Bone size={17} /></div>{dashboard.lowStock.length ? dashboard.lowStock.map((p) => <div className="stock-row" key={p.id}><span>{p.name}</span><b className={p.stock < 4 ? "stock-critical" : ""}>{p.stock} un.</b></div>) : <EmptyInline text="Tudo em dia por aqui!" />}</section><section className="admin-tip"><span>✿</span><p><b>Um cuidado importante</b><br />Confira a agenda todo dia para preparar uma experiência especial.</p></section></div></div><div className="dashboard-rank-panels"><section className="admin-card"><div className="admin-card-heading"><div><b>Produtos mais vendidos</b><small>Itens com mais unidades nos pedidos.</small></div><ShoppingBag size={16} /></div>{dashboard.bestsellers.length ? dashboard.bestsellers.map((item, index) => <div className="stock-row" key={item.name}><span><i className="rank-number">{index + 1}</i>{item.name}</span><b>{item.sold} un.</b></div>) : <EmptyInline text="Os produtos mais vendidos aparecem após os primeiros pedidos." />}</section><section className="admin-card"><div className="admin-card-heading"><div><b>Serviços mais procurados</b><small>Agendamentos por tipo de cuidado.</small></div><Scissors size={16} /></div>{dashboard.popularServices.map((item) => <div className="stock-row" key={item.name}><span>{item.name}</span><b>{item.bookings} ag.</b></div>)}</section></div></>}</>}
      {tab === "orders" && <section className="admin-card table-card"><div className="admin-card-heading"><div><b>Pedidos da loja</b><small>Atualize o status de cada pedido.</small></div></div><div className="admin-table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Itens</th><th>Total</th><th>Recebimento</th><th>Status</th></tr></thead><tbody>{orders.map((o) => <tr key={o.id}><td>#{o.id}<small>{new Date(o.created_at).toLocaleDateString("pt-BR")}</small></td><td>{o.customer_name}<small>{o.customer_email}</small></td><td>{o.items || "—"}</td><td>{money(o.total_cents / 100)}</td><td>{o.fulfillment === "pickup" ? "Retirada" : "Entrega"}</td><td><select className="status-select" value={o.status} onChange={(e) => changeOrder(o.id, e.target.value)}>{["received", "processing", "shipped", "delivered", "completed", "cancelled"].map((s) => <option key={s} value={s}>{orderStatus(s)}</option>)}</select></td></tr>)}</tbody></table>{orders.length === 0 && <EmptyInline text="Nenhum pedido chegou ainda." />}</div></section>}
      {tab === "appointments" && <section className="admin-card table-card"><div className="admin-card-heading"><div><b>Agenda de cuidados</b><small>Horários e profissionais da equipe.</small></div></div><div className="admin-table-wrap"><table><thead><tr><th>Data e horário</th><th>Pet</th><th>Serviço</th><th>Responsável</th><th>Profissional</th><th>Status</th></tr></thead><tbody>{appointments.map((a) => <tr key={a.id}><td>{new Date(`${a.appointment_date}T12:00:00`).toLocaleDateString("pt-BR")}<small>{a.start_time}</small></td><td>{a.pet_name}<small>{a.species} · {a.size}</small></td><td>{a.service}</td><td>{a.customer_name}<small>{a.customer_phone}</small></td><td>{a.employee}</td><td><select className="status-select" value={a.status} onChange={(e) => changeAppointment(a.id, e.target.value)}>{["confirmed", "completed", "cancelled"].map((s) => <option key={s} value={s}>{s === "confirmed" ? "Confirmado" : s === "completed" ? "Concluído" : "Cancelado"}</option>)}</select></td></tr>)}</tbody></table>{appointments.length === 0 && <EmptyInline text="A agenda está livre por enquanto." />}</div></section>}
      {tab === "products" && <section className="admin-card table-card"><div className="admin-card-heading"><div><b>Produtos da loja</b><small>Estoque e catálogo em um só lugar.</small></div><button className="button button-primary" onClick={() => setEditing({ name: "", description: "", category_id: data?.categories?.[0]?.id || 1, price: "", original_price: "", stock: 0, image: "", prescription_required: false })}><Plus size={15} /> Novo produto</button></div>{editing && <ProductEditor product={editing} categories={data?.categories || []} request={request} setToast={setToast} onDone={async () => { setEditing(null); setProducts(await request("/admin/products")); refresh(); }} />}<div className="admin-table-wrap"><table><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Ações</th></tr></thead><tbody>{products.map((p) => <tr key={p.id}><td><div className="table-product"><img src={photo(p.image, 120)} alt="" /><span>{p.name}</span></div></td><td>{p.category}</td><td>{money(p.price)}</td><td><span className={p.stock <= 8 ? "stock-critical" : ""}>{p.stock} un.</span></td><td><button className="table-action" onClick={() => setEditing({ ...p, original_price: p.original_price || "" })}>Editar</button><button className="table-action danger" onClick={async () => { if (window.confirm(`Remover ${p.name} do catálogo?`)) { await request(`/admin/products/${p.id}`, { method: "DELETE" }); setProducts(await request("/admin/products")); refresh(); setToast("Produto removido."); } }}>Remover</button></td></tr>)}</tbody></table></div></section>}
      {tab === "services" && <ServicesAdmin services={data?.services || []} request={request} refresh={refresh} setToast={setToast} />}
      {tab === "categories" && <CategoriesAdmin categories={categories} request={request} setToast={setToast} reload={async () => { setCategories(await request("/admin/categories")); refresh(); }} />}
      {tab === "employees" && <EmployeesAdmin employees={employees} request={request} setToast={setToast} reload={async () => setEmployees(await request("/admin/employees"))} />}
      {tab === "reviews" && <section className="admin-card"><div className="admin-card-heading"><div><b>Avaliações dos clientes</b><small>As avaliações ficam públicas após sua aprovação.</small></div></div>{reviews.map((r) => <div className="review-admin-row" key={r.id}><span className="review-avatar">{r.customer_name[0]}</span><div><b>{r.customer_name} <span className="stars small-stars">{Array.from({ length: r.rating }, (_, i) => <Star key={i} />)}</span></b><p>{r.comment}</p></div><button className={`review-approve ${r.approved ? "approved" : ""}`} onClick={async () => { await request(`/admin/reviews/${r.id}`, { method: "PATCH", body: JSON.stringify({ approved: !r.approved }) }); setReviews(await request("/admin/reviews")); setToast(r.approved ? "Avaliação ocultada." : "Avaliação aprovada."); }}>{r.approved ? "Aprovada" : "Aprovar"}</button></div>)}{reviews.length === 0 && <EmptyInline text="Ainda não recebemos avaliações." />}</section>}
      {tab === "company" && <section className="admin-card settings-card"><div className="admin-card-heading"><div><b>Informações da empresa</b><small>Dados comerciais e horários usados na agenda do site.</small></div></div><form className="company-form" onSubmit={async (e) => { e.preventDefault(); try { const result = await request("/admin/company", { method: "PUT", body: JSON.stringify(company) }); setCompany(result.company); setCompanySaved(true); refresh(); setToast("Informações da loja atualizadas."); } catch (error) { setToast(error.message); } }}><label className="field">Nome da loja<input value={company.name || ""} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></label><label className="field">Telefone<input value={company.phone || ""} onChange={(e) => setCompany({ ...company, phone: e.target.value })} /></label><label className="field">WhatsApp <small>(só números com código do país)</small><input value={company.whatsapp || ""} onChange={(e) => setCompany({ ...company, whatsapp: e.target.value })} /></label><label className="field">Instagram<input value={company.instagram || ""} onChange={(e) => setCompany({ ...company, instagram: e.target.value })} /></label><label className="field full">Endereço<input value={company.address || ""} onChange={(e) => setCompany({ ...company, address: e.target.value })} /></label><label className="field">Horário de atendimento<input value={company.hours || ""} onChange={(e) => setCompany({ ...company, hours: e.target.value })} /></label><label className="field">Abre às<input type="time" step="1800" value={company.openTime || "09:00"} onChange={(e) => setCompany({ ...company, openTime: e.target.value })} /></label><label className="field">Fecha às<input type="time" step="1800" value={company.closeTime || "18:00"} onChange={(e) => setCompany({ ...company, closeTime: e.target.value })} /></label><div className="field full"><button className="button button-primary">{companySaved ? <><Check size={15} /> Salvo</> : "Salvar informações"}</button></div></form></section>}
    </div>
  </div>;
}

function Metric({ icon: Icon, label, value, tone, change }) { return <div className="metric-card"><span className={`metric-icon ${tone}`}><Icon size={19} /></span><small>{label}</small><b>{value}</b><span className="metric-change"><ArrowDown size={12} /> {change}</span></div>; }
function orderStatus(status) { return ({ received: "Recebido", processing: "Em preparo", shipped: "Enviado", delivered: "Entregue", completed: "Concluído", cancelled: "Cancelado" })[status] || status; }

function ProductEditor({ product, categories, request, setToast, onDone }) {
  const [form, setForm] = useState(product);
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await request(product.id ? `/admin/products/${product.id}` : "/admin/products", { method: product.id ? "PUT" : "POST", body: JSON.stringify({ ...form, price: Number(form.price), original_price: form.original_price ? Number(form.original_price) : null, stock: Number(form.stock) }) }); setToast(product.id ? "Produto atualizado." : "Produto criado."); onDone(); }
    catch (error) { setToast(error.message); }
    finally { setSaving(false); }
  };
  return <form className="product-editor" onSubmit={submit}><div className="product-editor-heading"><b>{product.id ? "Editar produto" : "Adicionar produto"}</b><button type="button" className="icon-button" onClick={onDone}><X size={17} /></button></div><div className="company-form"><label className="field">Nome<input required minLength="2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label className="field">Categoria<select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field full">Descrição<input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><label className="field">Preço<input required type="number" step=".01" min=".01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label><label className="field">Preço anterior <small>(opcional)</small><input type="number" step=".01" min=".01" value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} /></label><label className="field">Estoque<input required type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></label><label className="field">Imagem · URL<input required type="url" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} /></label><label className="checkbox-field full"><input type="checkbox" checked={Boolean(form.prescription_required)} onChange={(e) => setForm({ ...form, prescription_required: e.target.checked })} /> Exige prescrição — não permitir checkout indiscriminado</label><div className="field full editor-actions"><button type="button" className="button button-light" onClick={onDone}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar produto"}</button></div></div></form>;
}

function CategoriesAdmin({ categories, request, setToast, reload }) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const save = async (e) => {
    e.preventDefault();
    try {
      await request(editing ? `/admin/categories/${editing}` : "/admin/categories", {
        method: editing ? "PUT" : "POST", body: JSON.stringify({ name: editing ? draft : name }),
      });
      setName(""); setEditing(null); setDraft(""); await reload(); setToast("Categoria salva.");
    } catch (error) { setToast(error.message); }
  };
  return <section className="admin-card table-card"><div className="admin-card-heading"><div><b>Categorias da loja</b><small>Organize os produtos por tipo de cuidado.</small></div></div><form className="category-create" onSubmit={save}><label className="field">{editing ? "Editar categoria" : "Nova categoria"}<input required minLength="2" value={editing ? draft : name} onChange={(e) => editing ? setDraft(e.target.value) : setName(e.target.value)} placeholder="Ex.: Alimentação" /></label><button className="button button-primary">{editing ? "Salvar alteração" : <><Plus size={15} /> Adicionar categoria</>}</button>{editing && <button type="button" className="button button-light" onClick={() => { setEditing(null); setDraft(""); }}>Cancelar</button>}</form><div className="category-admin-list">{categories.map((category) => <div className="category-admin-row" key={category.id}><span className="data-icon"><ShoppingBag /></span><b>{category.name}</b><button className="table-action" onClick={() => { setEditing(category.id); setDraft(category.name); }}>Editar</button><button className="table-action danger" onClick={async () => { if (!window.confirm(`Excluir a categoria “${category.name}”?`)) return; try { await request(`/admin/categories/${category.id}`, { method: "DELETE" }); await reload(); setToast("Categoria removida."); } catch (error) { setToast(error.message); } }}>Excluir</button></div>)}</div></section>;
}

function EmployeesAdmin({ employees, request, setToast, reload }) {
  const [form, setForm] = useState({ name: "", role: "Especialista em banho e tosa" });
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ name: "", role: "" });
  const create = async (e) => {
    e.preventDefault();
    try { await request("/admin/employees", { method: "POST", body: JSON.stringify(form) }); setForm({ name: "", role: "Especialista em banho e tosa" }); await reload(); setToast("Profissional adicionado à equipe."); }
    catch (error) { setToast(error.message); }
  };
  const save = async (e) => {
    e.preventDefault();
    try { await request(`/admin/employees/${editing}`, { method: "PUT", body: JSON.stringify({ ...draft, active: true }) }); setEditing(null); await reload(); setToast("Profissional atualizado."); }
    catch (error) { setToast(error.message); }
  };
  const toggle = async (employee) => {
    try { await request(`/admin/employees/${employee.id}`, { method: "PUT", body: JSON.stringify({ name: employee.name, role: employee.role, active: !employee.active }) }); await reload(); setToast(employee.active ? "Profissional desativado na agenda." : "Profissional ativado na agenda."); }
    catch (error) { setToast(error.message); }
  };
  return <section className="admin-card"><div className="admin-card-heading"><div><b>Equipe de atendimento</b><small>Profissionais ativos recebem os horários de banho e tosa.</small></div></div><form className="employee-create" onSubmit={create}><label className="field">Nome do profissional<input required minLength="2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome completo" /></label><label className="field">Função<input required minLength="2" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></label><button className="button button-primary"><Plus size={15} /> Adicionar</button></form><div className="employee-admin-list">{employees.map((employee) => <div className="employee-admin-row" key={employee.id}>{editing === employee.id ? <form onSubmit={save}><input aria-label="Nome do profissional" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /><input aria-label="Função" required value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} /><button className="table-action">Salvar</button><button type="button" className="table-action danger" onClick={() => setEditing(null)}>Cancelar</button></form> : <><span className="profile-avatar">{employee.name[0]}</span><div><b>{employee.name}</b><small>{employee.role}</small></div><span className={`status-pill ${employee.active ? "" : "status-cancelled"}`}>{employee.active ? "Ativo na agenda" : "Inativo"}</span><button className="table-action" onClick={() => { setEditing(employee.id); setDraft({ name: employee.name, role: employee.role }); }}>Editar</button><button className="table-action danger" onClick={() => toggle(employee)}>{employee.active ? "Desativar" : "Ativar"}</button></>}</div>)}</div></section>;
}

function ServicesAdmin({ services, request, refresh, setToast }) {
  const [values, setValues] = useState({});
  useEffect(() => {
    setValues(Object.fromEntries(services.map((s) => [s.id, { price: s.price, duration: s.duration_minutes }])));
  }, [services]);
  const save = async (id) => { try { const value = values[id]; await request(`/admin/services/${id}`, { method: "PUT", body: JSON.stringify({ price: Number(value.price), duration: Number(value.duration) }) }); setToast("Serviço atualizado."); refresh(); } catch (error) { setToast(error.message); } };
  return <section className="admin-card table-card"><div className="admin-card-heading"><div><b>Serviços e preços</b><small>Os novos valores aparecem imediatamente para os clientes.</small></div></div><div className="service-admin-list">{services.map((s) => <div className="service-admin-row" key={s.id}><div><b>{s.name}</b><small>{s.description}</small></div><label>Preço <span>R$</span><input type="number" step=".01" min="0" value={values[s.id]?.price ?? s.price} onChange={(e) => setValues({ ...values, [s.id]: { ...values[s.id], price: e.target.value } })} /></label><label>Duração <input type="number" min="15" max="300" step="5" value={values[s.id]?.duration ?? s.duration_minutes} onChange={(e) => setValues({ ...values, [s.id]: { ...values[s.id], duration: e.target.value } })} /><span>min</span></label><button className="button button-light" onClick={() => save(s.id)}>Salvar</button></div>)}</div></section>;
}

function EmptyState({ title, button, onClick }) { return <div className="empty-state"><span><PawPrint /></span><h2>{title}</h2><button className="button button-primary" onClick={onClick}>{button} <ArrowRight size={15} /></button></div>; }

function Footer({ data, go, setModal }) {
  return <footer className="site-footer"><div className="footer-main"><div className="footer-brand"><button className="brand" onClick={() => go("home")}><span className="brand-mark"><PawPrint size={21} fill="currentColor" /></span><span className="brand-name">pets<span>petshop</span><small>um mundo de carinho</small></span></button><p>Feito com amor para quem transforma a nossa vida com quatro patinhas.</p><div className="social-links"><a href={`https://instagram.com/${(data?.company?.instagram || "@petspetshop").replace("@", "")}`} aria-label="Instagram"><Instagram /></a><a href="#" aria-label="Facebook"><Facebook /></a></div></div><div className="footer-col"><b>Com carinho, para</b><button onClick={() => go("shop")}>Nossa lojinha</button><button onClick={() => go("services")}>Banho & tosa</button><button onClick={() => setModal("login")}>Minha conta</button></div><div className="footer-col"><b>Estamos por perto</b><span><MapPin size={15} /> {data?.company?.address || "Rua das Paineiras, 245 — Vila Verde"}</span><span><Clock3 size={15} /> {data?.company?.hours || "Seg a sáb, das 9h às 18h"}</span><span><PawPrint size={15} /> {data?.company?.phone || "(11) 3456-7890"}</span></div><div className="footer-note"><span>✿</span><b>Seu pet é parte<br />da nossa família.</b><small>Vem tomar um café com a gente ♡</small></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Pets PetShop · Feito com muito amor e algumas patinhas.</span><span>Privacidade <i>·</i> Termos de carinho</span></div></footer>;
}

export default App;
