

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      ...options
    });

    if (res.status === 401) {
      // DOAR dacă NU suntem deja pe login
      if (!location.pathname.endsWith("login.html")) {
        location.href = "login.html";
      }
      throw new Error("Neautentificat");
    }

    return res;
  }


async function initLoginPage() {
  if (!location.pathname.endsWith("login.html")) return;

  const form = document.getElementById("loginForm");
  const msg = document.getElementById("loginMsg");
  
  if (!form || !msg) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    msg.textContent = "";
    msg.className = ""; 
    msg.style.display = "none";

    const username = document.getElementById("loginUser").value.trim();
    const password = document.getElementById("loginPass").value;

    try {
      // Folosim fetch direct, NU apiFetch
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password })
      });

      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        msg.style.display = "block";
        
        // ✅ Cont în așteptare (403 + pending)
        if (res.status === 403 && data.pending) {
          msg.innerHTML = "⏳ <strong>Cont în așteptare!</strong><br>" + 
                         (data.message || "Așteaptă aprobarea administratorului.");
          msg.className = "msg-warning show";
        } 
        // ✅ ADAUGĂ AICI: Cont blocat temporar (403 + locked)
        else if (res.status === 403 && data.locked) {
          const minutes = data.minutesLeft || 30;
          msg.innerHTML = `🔒 <strong>Cont blocat temporar!</strong><br>` + 
                         (data.message || `Mai așteaptă ${minutes} minute.`);
          msg.className = "msg-error show";
        }
        // ✅ User/Parolă greșită (401)
        else if (res.status === 401) {
          let html = "❌ <strong>User sau parolă greșită!</strong><br>";
          
          if (data.attemptsLeft > 0) {
            html += `⚠️ Mai ai <strong>${data.attemptsLeft}</strong> încercări rămase.<br>`;
          }
          
          html += "<small>La 3 încercări greșite, contul se va bloca automat pentru 30 minute.</small>";
          
          msg.innerHTML = html;
          msg.className = "msg-error show";
        }
        // Alte erori
        else {
          msg.textContent = data.error || "Eroare la autentificare";
          msg.className = "msg-error show";
        }
        
        return;
      }

      // Login reușit
      localStorage.setItem('username', username);
      location.href = "index.html";
      
    } catch (err) {
      console.error("Login error:", err);
      msg.style.display = "block";
      msg.textContent = "Eroare de conexiune. Verifică internetul și încearcă din nou.";
      msg.className = "msg-error show";
    }
  };
}

  async function initRegister() {
    if (!location.pathname.endsWith("register.html")) return;

    const form = document.getElementById("registerForm");
    const msg = document.getElementById("registerMsg");
    if (!form) return;

    form.onsubmit = async (e) => {
      e.preventDefault();
      msg.textContent = "";

      const username = document.getElementById("regUser").value.trim();
      const password = document.getElementById("regPass").value;

      if (!username || !password) {
        msg.textContent = "Completează toate câmpurile";
        return;
      }

      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        msg.textContent = data.error || "Eroare";
        return;
      }

      alert("Cont creat. Te poți loga.");
      location.href = "login.html";
    };
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }




  async function protectPage() {
    if (location.pathname.endsWith("login.html")) return;

    let me;
    try {
      const res = await apiFetch("/api/auth/check");
      me = await res.json();
    } catch {
      return; // apiFetch deja redirecționează
    }

    if (!me.loggedIn) {
      location.href = "login.html";
    }
  }

 async function renderUserBar() {
  const bar = document.getElementById("userBar");
  if (!bar) return;

  const res = await apiFetch("/api/auth/check");
  const me = await res.json();

  if (!me.loggedIn) {
    bar.innerHTML = "";
    return;
  }
  localStorage.setItem('username', me.user.username);

  const isAdmin = me.user.role === 'admin';
  
  // HTML pentru dropdown
  bar.innerHTML = `
    <div class="userbar-inner">
      <div class="user-dropdown-container" id="userDropdownContainer">
        <button class="user-profile-btn" id="userProfileBtn">
          <span class="user-ico">👤</span>
          <span class="user-txt">${escapeHtml(me.user.username)} (${escapeHtml(me.user.role)})</span>
          <span class="dropdown-arrow">▼</span>
        </button>
        
        <div class="user-dropdown-menu" id="userDropdownMenu" style="display: none;">
          ${isAdmin ? `
            <a href="admin.html" class="dropdown-item">
              <span class="dropdown-icon">🔧</span>
              <span>Admin</span>
            </a>
          ` : ''}
          
          <a href="profil.html" class="dropdown-item">
            <span class="dropdown-icon">👤</span>
            <span>Profil</span>
          </a>
          
          <a href="schimba_parola.html" class="dropdown-item">
            <span class="dropdown-icon">🔑</span>
            <span>Schimbă parola</span>
          </a>
          
          <div class="dropdown-divider"></div>
          
          <button class="dropdown-item logout" id="btnLogoutDropdown">
            <span class="dropdown-icon">🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // Event listeners pentru dropdown
  const container = document.getElementById("userDropdownContainer");
  const btn = document.getElementById("userProfileBtn");
  const menu = document.getElementById("userDropdownMenu");
  const logoutBtn = document.getElementById("btnLogoutDropdown");

  // Toggle dropdown
  btn.onclick = (e) => {
    e.stopPropagation();
    const isOpen = menu.style.display === "block";
    menu.style.display = isOpen ? "none" : "block";
    btn.classList.toggle("active", !isOpen);
  };

  // Logout
  logoutBtn.onclick = async () => {
    await apiFetch("/api/logout", { method: "POST" });
    location.href = "login.html";
  };

  // Închide dropdown când click în afară
  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) {
      menu.style.display = "none";
      btn.classList.remove("active");
    }
  });
}



  let stockMap = {};
  const LOW_STOCK_LIMIT = 30;


 const CATEGORY_ORDER = [
  "🩲 Seni Active Classic x30",
  "🩲 Seni Active Classic x10",
  "🩹 Seni Classic Air x30",
  "🩹 Seni Classic Air x10",
  "🛏️ Seni Aleze x30",
  "🌸 Seni Lady",
  "🧤 Manusi",
  "🩸 Absorbante Bella",
  "📦 Altele"
];

// scoate emoji/simboluri și normalizează
function normCat(s) {
  return String(s || "")
    .replace(/[^\p{L}\p{N} ]+/gu, " ") // keep letters/numbers/spaces only
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sortCategories(keys) {
  const orderIndex = new Map(CATEGORY_ORDER.map((c, i) => [normCat(c), i]));

  return [...keys].sort((a, b) => {
    const na = normCat(a);
    const nb = normCat(b);

    const ia = orderIndex.has(na) ? orderIndex.get(na) : 9999;
    const ib = orderIndex.has(nb) ? orderIndex.get(nb) : 9999;

    if (ia !== ib) return ia - ib;

    // dacă nu sunt în ordine fixă -> alfabet după varianta “curățată”
    return na.localeCompare(nb, "ro");
  });
}


  // ================= STORAGE =================
  function getSelectedClient() {
    try {
      return JSON.parse(localStorage.getItem("clientSelectat"));
    } catch {
      return null;
    }
  }

  function setSelectedClient(client) {
    const cart = getCart();
    if (cart.length > 0) {
      alert("Nu poți schimba clientul cât timp există produse în coș.");
      return false;
    }
    localStorage.setItem("clientSelectat", JSON.stringify(client));
    return true;
  }

  function getCart() {
    try {
      const cart = JSON.parse(localStorage.getItem("cart"));
      return Array.isArray(cart) ? cart : [];
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem("cart", JSON.stringify(cart));
  }

  function clearCart() {
    localStorage.setItem("cart", JSON.stringify([]));
  }


  // ================= CART =================


  function incQtyByGTIN(gtin) {
    const cart = getCart();
    const g = normalizeGTIN(gtin);
    const p = cart.find(x => normalizeGTIN(x.gtin) === g);
    if (p) p.qty++;
    saveCart(cart);
    renderCart();
  }

  function decQtyByGTIN(gtin) {
    const cart = getCart();
    const g = normalizeGTIN(gtin);
    const p = cart.find(x => normalizeGTIN(x.gtin) === g);
    if (!p) return;

    p.qty--;
    if (p.qty <= 0) cart.splice(cart.indexOf(p), 1);

    saveCart(cart);
    renderCart();
  }
  function setQty(id, value) {
    const cart = getCart();
    const p = cart.find(x => x.id === id);
    if (!p) return;

    const qty = parseInt(value, 10);

    if (isNaN(qty) || qty <= 0) {
      removeItem(id);
      return;
    }

    p.qty = qty;
    saveCart(cart);
    renderCart();
  }


  function removeItemByGTIN(gtin) {
    const g = normalizeGTIN(gtin);
    saveCart(getCart().filter(x => normalizeGTIN(x.gtin) !== g));
    renderCart();
  }

function renderCart() {
  const box = document.getElementById("cartBox");
  const totalBox = document.getElementById("cartTotal");
  const countBadge = document.getElementById("cartCount");
  const footer = document.getElementById("cartFooter");

  if (!box) return;

  const cart = getCart();
  
  // Update counter și footer
  if (countBadge) {
    const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
    countBadge.textContent = totalItems;
    countBadge.style.display = cart.length > 0 ? "flex" : "none";
  }
  
  if (footer) {
    footer.style.display = cart.length > 0 ? "block" : "none";
  }

  if (!cart.length) {
    box.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <p>Coșul este gol</p>
        <p style="font-size: 0.875rem;">Adaugă produse din lista din stânga</p>
      </div>
    `;
    if (totalBox) totalBox.textContent = "0.00 RON";
    return;
  }

  box.innerHTML = "";
  let total = 0;

  cart.forEach(i => {
    // ✅ COLECTĂM TOATE GTIN-URILE POSIBILE DIN PRODUS (gtin + gtins)
    const allGtins = [];
    
    // Adăugăm gtin (coloana single)
    if (i.gtin) {
      allGtins.push(i.gtin.toString());
    }
    
    // Adăugăm toate gtins din array
    if (i.gtins && Array.isArray(i.gtins)) {
      i.gtins.forEach(g => {
        if (g) allGtins.push(g.toString());
      });
    }
    
    // Eliminăm duplicatele
    const uniqueGtins = [...new Set(allGtins)];
    
    // ✅ CĂUTĂM STOCUL PENTRU FIECARE GTIN PÂNĂ GĂSIM UNUL CU STOC
    let foundStock = null;
    let depozitStock = 0;
    let magazinStock = 0;
    
    for (const gtin of uniqueGtins) {
      const normalized = normalizeGTIN(gtin);
      
      // Încercăm mai multe formate (normalizat, cu zerouri, fără zerouri)
      const variations = [
        normalized,
        gtin.toString().padStart(14, '0'),
        gtin.toString().replace(/^0+/, ''),
        gtin.toString()
      ];
      
      for (const variant of variations) {
        const dStock = window.stockMapDepozit?.[variant] || 0;
        const mStock = window.stockMapMagazin?.[variant] || 0;
        
        if (dStock > 0 || mStock > 0) {
          depozitStock = dStock;
          magazinStock = mStock;
          foundStock = { depozit: dStock, magazin: mStock, total: dStock + mStock };
          break;
        }
      }
      
      if (foundStock) break;
    }
    
    // Dacă nu am găsit stoc pentru niciun GTIN, rămâne 0
    const available = foundStock?.total || 0;
    
    const insufficient = i.qty > available;
    const price = Number(i.price) || 0;
    const lineTotal = price * i.qty;
    total += lineTotal;

    const itemDiv = document.createElement("div");
    itemDiv.className = "cart-item";
    if (insufficient) itemDiv.style.borderColor = "var(--danger-500)";

    // Text pentru stoc
    let stockText = "";
    if (insufficient) {
      stockText = `<div class="stock-warning">❌ Stoc insuficient (disponibil: ${available})</div>`;
    } else {
      // Dacă are stoc în ambele locații, arătăm detaliile
      if (depozitStock > 0 && magazinStock > 0) {
        stockText = `<div class="stock-ok">✔️ Stoc OK (${available} - Depozit: ${depozitStock}, Magazin: ${magazinStock})</div>`;
      } else if (magazinStock > 0 && depozitStock === 0) {
        stockText = `<div class="stock-ok" style="color: #fbbf24;">✔️ Stoc OK (${available} - Doar în Magazin)</div>`;
      } else if (depozitStock > 0) {
        stockText = `<div class="stock-ok">✔️ Stoc OK (${available} - Depozit: ${depozitStock})</div>`;
      } else {
        stockText = `<div class="stock-ok">✔️ Stoc OK (${available})</div>`;
      }
    }

    itemDiv.innerHTML = `
      <div class="cart-item-header">
        <div class="cart-item-name">${escapeHtml(i.name)}</div>
        <button class="cart-item-remove" title="Șterge">🗑</button>
      </div>
      <div class="cart-item-details">
        <div>Preț: <span class="cart-item-price">${price.toFixed(2)} RON</span></div>
        ${stockText}
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn dec">−</button>
        <input type="number" class="qty-input" value="${i.qty}" min="1">
        <button class="qty-btn inc">+</button>
      </div>
    `;

    // Event listeners
    itemDiv.querySelector(".cart-item-remove").onclick = () => removeItemByGTIN(i.gtin);
    itemDiv.querySelector(".dec").onclick = () => decQtyByGTIN(i.gtin);
    itemDiv.querySelector(".inc").onclick = () => incQtyByGTIN(i.gtin);
    itemDiv.querySelector(".qty-input").onchange = (e) => {
      const val = parseInt(e.target.value);
      if (!isNaN(val) && val > 0) {
        const currentCart = getCart();
        const item = currentCart.find(x => normalizeGTIN(x.gtin) === normalizeGTIN(i.gtin));
        if (item) {
          item.qty = val;
          saveCart(currentCart);
          renderCart();
        }
      }
    };

    box.appendChild(itemDiv);
  });

  if (totalBox) totalBox.textContent = `${total.toFixed(2)} RON`;
  updateStickyTotals();
}

  function initViewCurrentOrderButton() {
    const btn = document.getElementById("btnViewCurrentOrder");
    if (!btn) return;

    btn.onclick = () => {
      const cart = getCart();

      if (!cart || cart.length === 0) {
        alert("Nu există produse în coș.");
        return;
      }

      location.href = "comanda.html";
    };
      // ========== UPDATE STICKY TOTALS BAR ==========
const cart = getCart();
const totalProducts = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
let totalNoVat = 0;
const VAT_RATE = 0.21;

cart.forEach(item => {
  totalNoVat += Number(item.price || 0) * Number(item.qty || 0);
});

const totalWithVat = totalNoVat * (1 + VAT_RATE);

const elTP = document.getElementById('stickyTotalProducts');
const elTfT = document.getElementById('stickyTotalNoVat');
const elTb = document.getElementById('stickyTotalWithVat');

if (elTP) elTP.textContent = totalProducts + ' buc';
if (elTfT) elTfT.textContent = totalNoVat.toFixed(2) + ' RON';
if (elTb) elTb.textContent = totalWithVat.toFixed(2) + ' RON';
// ==============================================

  }

  // ================= CLIENT HOME (client.html) =================
  async function initClientHomePage() {
    if (!location.pathname.endsWith("client.html")) return;

    const client = getSelectedClient();
    if (!client) {
      alert("Nu este selectat niciun client.");
      location.href = "adauga_comanda.html";
      return;
    }

    const nameEl = document.getElementById("clientName");
    const metaEl = document.getElementById("clientMeta");

    if (nameEl) nameEl.textContent = `Client: ${client.name}`;
    if (metaEl) metaEl.textContent = `Grup: ${client.group || "-"} • Categorie: ${client.category || "-"}`;

    const btnNewOrder = document.getElementById("btnNewOrder");
    const btnPrices = document.getElementById("btnPrices");
    const btnClientOrders = document.getElementById("btnClientOrders");
    const btnClientSold = document.getElementById("btnClientSold");
    const btnClientInvoices = document.getElementById("btnClientInvoices");

    if (btnNewOrder) btnNewOrder.onclick = () => (location.href = "comanda.html");

    // ✅ Prețuri speciale = pagină separată
  if (btnPrices) btnPrices.onclick = () => {
    location.href = "client_prices.html";
  };

    // ✅ Comenzi doar pentru client
    if (btnClientOrders) btnClientOrders.onclick = () => {
      localStorage.setItem("ordersClientFilter", client.name);
      location.href = "orders.html";
    };

    // placeholders
   if (btnClientSold) btnClientSold.onclick = () => {
  location.href = "client_sold.html";
};

    if (btnClientInvoices) btnClientInvoices.onclick = () => {
      alert("Facturi client: placeholder. Mai târziu îl legăm la programul de facturare.");
    };
  }


  async function initClientPricesPage() {
    if (!location.pathname.endsWith("client_prices.html")) return;

    const elName = document.getElementById("pricesClientName");
    const elMeta = document.getElementById("pricesClientMeta");
    const list = document.getElementById("clientPricesList");

    const inpSearch = document.getElementById("priceProductSearch");
    const boxResults = document.getElementById("priceProductResults");

    const selBox = document.getElementById("selectedProductBox");
    const inpNewPrice = document.getElementById("newSpecialPrice");
    const btnAdd = document.getElementById("btnAddSpecialPriceNow");

    const btnReload = document.getElementById("btnReloadPrices");

    if (!list || !inpSearch || !boxResults || !selBox || !btnAdd) return;

    const clientLocal = getSelectedClient();
    if (!clientLocal || !clientLocal.id) {
      alert("Nu este selectat niciun client. Selectează clientul din lista de clienți.");
      location.href = "adauga_comanda.html";
      return;
    }

    // 1) încărcăm clientul real din DB (ca să avem mereu prices actual)
    async function loadClient() {
      const r = await apiFetch(`/api/clients/${encodeURIComponent(clientLocal.id)}`);
      const c = await r.json();
      return c;
    }

    // 2) încărcăm catalog produse (pt nume + preț listă)
    async function loadProducts() {
      const r = await apiFetch("/api/products-flat");
      return await r.json();
    }

    const esc = (s) =>
      String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    let selectedProduct = null;
    let currentClient = null; // ✅ ținem clientul încărcat (cu prices actuale)
    let products = [];
    let productById = new Map();

  function renderSelected() {
    if (!selectedProduct) {
      selBox.innerHTML = "<i>(nimic)</i>";
      return;
    }

    const p = selectedProduct;
    const base = Number(p.price || 0);

    const prices = currentClient?.prices || {};
    const spRaw = prices[String(p.id)];
    const hasSpecial = spRaw != null && spRaw !== "";
    const special = Number(spRaw || 0);

    selBox.innerHTML = `
      <div><b>${esc(p.name)}</b></div>
      <div class="hint">${esc(p.path || "")}</div>
      <div class="hint">Preț listă: <b>${base.toFixed(2)} RON</b></div>
      <div class="hint">Preț special: <b>${hasSpecial ? special.toFixed(2) : "—"}</b> ${hasSpecial ? "RON" : ""}</div>
      <div class="hint">ID produs: <b>${esc(p.id)}</b></div>
    `;

    // ✅ dacă există deja preț special, îl pun direct în input ca să-l poți edita ușor
    inpNewPrice.value = hasSpecial ? String(special) : "";
  }

    function renderProductsSearch(q) {
      boxResults.innerHTML = "";
      const query = String(q || "").toLowerCase().trim();
      if (!query) return;

      const matches = products
        .filter(p => {
          const name = String(p.name || "").toLowerCase();
          const path = String(p.path || "").toLowerCase();
          const gtin = String(p.gtin || "").toLowerCase();
          const gtins = Array.isArray(p.gtins) ? p.gtins.join(" ").toLowerCase() : "";
          return name.includes(query) || path.includes(query) || gtin.includes(query) || gtins.includes(query);
        })
        .slice(0, 25);

      matches.forEach(p => {
        const b = document.createElement("button");
        b.className = "itembtn";
        b.innerHTML = `<b>${esc(p.name)}</b> <span class="hint">(${esc(p.path || "")})</span>`;
      b.onclick = () => {
    selectedProduct = p;

    // ✅ golește search + închide sugestiile
    inpSearch.value = "";
    boxResults.innerHTML = "";

    renderSelected();
  };
        boxResults.appendChild(b);
      });
    }

    async function saveClientPrices(clientId, pricesObj) {
      const r = await apiFetch(`/api/clients/${encodeURIComponent(clientId)}/prices`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: pricesObj })
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || "Eroare la salvare prețuri");
      return out;
    }

    function renderPrices(client) {
      list.innerHTML = "";

      const prices = client.prices || {};
      const entries = Object.entries(prices);

      if (!entries.length) {
        list.innerHTML = `<p class="hint">Clientul nu are prețuri speciale.</p>`;
        return;
      }

      // sort după nume produs
      entries.sort(([a], [b]) => {
        const pa = productById.get(String(a));
        const pb = productById.get(String(b));
        const na = String(pa?.name || `Produs ${a}`);
        const nb = String(pb?.name || `Produs ${b}`);
        return na.localeCompare(nb, "ro");
      });

      entries.forEach(([pid, sp]) => {
        const p = productById.get(String(pid));
        const pname = p?.name || `Produs ID ${pid}`;
        const ppath = p?.path || "";
        const base = Number(p?.price || 0);
        const special = Number(sp || 0);

        const row = document.createElement("div");
        row.className = "cartItem"; // reuse style frumos

        row.innerHTML = `
          <div class="cartLeft">
            <strong>${esc(pname)}</strong>
            <div class="hint">${esc(ppath)}</div>
            <div class="hint">Preț listă: <b>${base.toFixed(2)} RON</b></div>
            <div class="hint">ID produs: <b>${esc(pid)}</b></div>
          </div>

          <div class="cartRight" style="gap:8px;">
            <input type="number" step="0.01" value="${Number.isFinite(special) ? special : 0}"
                  style="width:120px;" />
            <button class="btnSave">💾</button>
            <button class="btnDel">🗑</button>
          </div>
        `;

        const inp = row.querySelector("input");
        const btnSave = row.querySelector(".btnSave");
        const btnDel = row.querySelector(".btnDel");

        btnSave.onclick = async () => {
          try {
            const v = Number(inp.value);
            if (!Number.isFinite(v) || v <= 0) {
              alert("Preț invalid. Pune un număr > 0.");
              return;
            }

            // actualizăm local + salvăm în DB
            client.prices = client.prices || {};
            client.prices[String(pid)] = v;

            await saveClientPrices(client.id, client.prices);
            alert("Salvat ✅");
          } catch (e) {
            alert(e.message || "Eroare");
          }
        };

        btnDel.onclick = async () => {
          if (!confirm("Ștergi prețul special pentru acest produs?")) return;
          try {
            client.prices = client.prices || {};
            delete client.prices[String(pid)];

            await saveClientPrices(client.id, client.prices);
            row.remove();

            if (!Object.keys(client.prices).length) {
              renderPrices(client);
            }
          } catch (e) {
            alert(e.message || "Eroare");
          }
        };

        list.appendChild(row);
      });
    }

    async function refreshAll() {
      const [client, prods] = await Promise.all([loadClient(), loadProducts()]);
      currentClient = client;
      products = Array.isArray(prods) ? prods : [];
      productById = new Map();
      products.forEach(p => productById.set(String(p.id), p));

      if (elName) elName.textContent = `Prețuri speciale – ${client.name}`;
      if (elMeta) elMeta.textContent = `Grup: ${client.group || "-"} • Categorie: ${client.category || "-"}`;

      renderSelected();
      renderPrices(client);

      // ținem clientul actualizat și în localStorage (ca să fie consistent)
      localStorage.setItem("clientSelectat", JSON.stringify(client));
    }

    inpSearch.addEventListener("input", () => renderProductsSearch(inpSearch.value));

    btnAdd.onclick = async () => {
      try {
        if (!selectedProduct) {
          alert("Selectează un produs din rezultate.");
          return;
        }

        const v = Number(inpNewPrice.value);
        if (!Number.isFinite(v) || v <= 0) {
          alert("Preț invalid. Pune un număr > 0.");
          return;
        }

        // luăm client curent din localStorage (după refreshAll e sincron)
        const c = getSelectedClient();
        if (!c || !c.id) return alert("Client invalid.");

        c.prices = c.prices || {};
        c.prices[String(selectedProduct.id)] = v;

        await saveClientPrices(c.id, c.prices);

        // refresh ca să vedem lista actualizată + sort
        await refreshAll();

        inpNewPrice.value = "";
        inpSearch.value = "";
        boxResults.innerHTML = "";
        selectedProduct = null;
        renderSelected();

        alert("Preț special adăugat ✅");
      } catch (e) {
        alert(e.message || "Eroare");
      }
    };

    if (btnReload) btnReload.onclick = refreshAll;

    await refreshAll();
  }





  // ================= TREE =================
  function isObject(v) {
    return v && typeof v === "object" && !Array.isArray(v);
  }

  function renderTree(obj, onClick, opts = {}) {
    const { accordion = true } = opts;

    const box = document.createElement("div");

    if (Array.isArray(obj)) {
      obj.forEach(item => {
        let label = "";
        let value = null;

        if (typeof item === "string") {
          label = item;
          value = item;
        } else if (typeof item === "object") {
  label = item.name;
  value = item.id; // ✅ folosim ID ca legătură
} else {
          return;
        }

      const b = document.createElement("button");
  b.className = "itembtn";

  const lower = String(label || "").toLowerCase();

  // 🎨 doar pentru Aleze
  if (lower.includes("aleze")) {
    if (lower.includes("soft super")) b.classList.add("aleze-super");
    else if (lower.includes("soft normal")) b.classList.add("aleze-normal");
    else if (lower.includes("soft basic")) b.classList.add("aleze-basic");
  }

  b.textContent = label;
  b.onclick = () => onClick(value);
  box.appendChild(b);

      });
      return box;
    }

  if (obj && typeof obj === "object") {
  sortCategories(Object.keys(obj)).forEach(k => {

      // ✅ dacă accordion e dezactivat: afișare simplă cu <h4>
      if (!accordion) {
        const h = document.createElement("h4");
        h.textContent = k;
        box.appendChild(h);
        box.appendChild(renderTree(obj[k], onClick, opts));
        return;
      }

      // ✅ accordion ON (produse)
      const head = document.createElement("button");
      head.type = "button";
      head.className = "accHead";
      head.textContent = k;

      const body = document.createElement("div");
      body.className = "accBody";
      body.style.display = "none";

      body.appendChild(renderTree(obj[k], onClick, opts));

      head.onclick = () => {
        const open = body.style.display !== "none";
        body.style.display = open ? "none" : "block";
        head.classList.toggle("open", !open);
      };

      box.appendChild(head);
      box.appendChild(body);
    });
  }



    return box;
  }

async function initCheckPricePage() {
  const box = document.getElementById("productsList");
  const search = document.getElementById("productsSearch");
  const btnClear = document.getElementById("btnClearSearch");
  const countEl = document.getElementById("cpCount");

  if (!box) return;

  // ---- modal refs
  const modal = document.getElementById("editProductModal");
  const btnClose = document.getElementById("btnCloseEditModal");
  const btnCancel = document.getElementById("btnCancelEdit");
  const btnSave = document.getElementById("btnSaveEdit");
  const btnArchive = document.getElementById("btnArchiveProduct");
  const msg = document.getElementById("editModalMsg");

  const fId = document.getElementById("editProdId");
  const fName = document.getElementById("editProdName");
  const fCat = document.getElementById("editProdCategory");
  const fPrice = document.getElementById("editProdPrice");
  const fGtin = document.getElementById("editProdGtin");
  const fGtins = document.getElementById("editProdGtins");

  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  let products = [];

  async function load() {
    const res = await apiFetch("/api/products-flat");
    const data = await res.json().catch(() => []);
    products = Array.isArray(data) ? data : [];
    render();
  }

  function showModal(on) {
    if (!modal) return;
    modal.classList.toggle("hidden", !on);
    modal.setAttribute("aria-hidden", on ? "false" : "true");
    if (!on) {
      if (msg) msg.style.display = "none";
    }
  }

  function setMsg(text) {
    if (!msg) return;
    msg.textContent = text || "";
    msg.style.display = text ? "" : "none";
  }

  function openEdit(p) {
    fId.value = String(p.id);
    fName.value = p.name || "";
    fCat.value = p.category || "";
    fPrice.value = (p.price == null ? "" : String(p.price));
    fGtin.value = p.gtin || "";

    const arr = Array.isArray(p.gtins) ? p.gtins : [];
    fGtins.value = arr.join("\n");

    setMsg("");
    showModal(true);
    setTimeout(() => fName.focus(), 50);
  }

  async function doArchive(id, name) {
    if (!confirm(`Arhivezi produsul?\n\n${name}\n\nVa dispărea din listă, dar rămâne în comenzile vechi.`)) return;

    const r = await apiFetch(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) return alert(out.error || "Eroare la arhivare");

    await load();
  }

  async function doSave() {
    const id = String(fId.value || "").trim();
    if (!id) return;

    const name = String(fName.value || "").trim();
    const category = String(fCat.value || "").trim() || "Altele";
    const priceRaw = String(fPrice.value || "").trim();
    const gtin = String(fGtin.value || "").trim();

    if (!name) return setMsg("Completează numele produsului.");

    const gtins = String(fGtins.value || "")
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

    const payload = {
      name,
      category,
      price: priceRaw === "" ? null : Number(priceRaw),
      gtin,
      gtins
    };

    const r = await apiFetch(`/api/products/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const out = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(out.error || "Eroare la salvare");

    showModal(false);
    await load();
  }

  function render() {
    const q = String(search?.value || "").toLowerCase().trim();

    const filtered = !q ? products : products.filter(p => {
      const name = String(p.name || "").toLowerCase();
      const cat = String(p.category || "").toLowerCase();
      const gtin = String(p.gtin || "").toLowerCase();
      const gtins = Array.isArray(p.gtins) ? p.gtins.join(" ").toLowerCase() : "";
      return name.includes(q) || cat.includes(q) || gtin.includes(q) || gtins.includes(q);
    });

    if (countEl) countEl.textContent = String(filtered.length);

    // sort nume
    const sorted = [...filtered].sort((a,b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "ro")
    );

    if (!sorted.length) {
      box.innerHTML = `<p class="hint" style="padding:14px; color:rgba(231,238,247,.7)">Nu există produse.</p>`;
      return;
    }

    const table = document.createElement("table");
    table.className = "cp-table";

    table.innerHTML = `
      <thead>
        <tr>
          <th>Produs</th>
          <th style="text-align:right;">Preț listă</th>
          <th style="text-align:right;">Acțiuni</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    sorted.forEach(p => {
      const tr = document.createElement("tr");

      const price = Number(p.price || 0);

      tr.innerHTML = `
        <td>
          <div class="cp-name">${esc(p.name || "")}</div>
          <div class="cp-meta">
            <span class="cp-pill">Categorie: ${esc(p.category || "Altele")}</span>
            ${p.gtin ? `<span class="cp-pill">GTIN: ${esc(p.gtin)}</span>` : ``}
          </div>
        </td>

        <td class="cp-price">${price.toFixed(2)} RON</td>

        <td>
          <div class="cp-actionsCell">
            <button class="cp-btn cp-rowbtn" data-act="edit" data-id="${esc(p.id)}">Edit</button>
            <button class="cp-btn cp-rowbtn danger" data-act="del" data-id="${esc(p.id)}">Șterge</button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    box.innerHTML = "";
    box.appendChild(table);

    // handlers
    table.querySelectorAll("button[data-act]").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const act = btn.dataset.act;

        const prod = products.find(x => String(x.id) === String(id));
        if (!prod) return;

        if (act === "del") return doArchive(prod.id, prod.name);
        if (act === "edit") return openEdit(prod);
      };
    });
  }

  // ---- modal close behaviors
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target && e.target.dataset && e.target.dataset.close === "1") showModal(false);
    });
  }
  if (btnClose) btnClose.onclick = () => showModal(false);
  if (btnCancel) btnCancel.onclick = () => showModal(false);

  if (btnSave) btnSave.onclick = doSave;

  if (btnArchive) btnArchive.onclick = async () => {
    const id = String(fId.value || "").trim();
    const name = String(fName.value || "").trim() || "(fără nume)";
    showModal(false);
    await doArchive(id, name);
  };

  // search
  if (search) search.addEventListener("input", render);
  if (btnClear) btnClear.onclick = () => { search.value = ""; render(); };

  // init
  await load();
} 



  // ================= ADAUGA_COMANDA.HTML =================
  async function initAddClientPage() {
    const treeBox = document.getElementById("clientsTree");
    const searchInput = document.getElementById("searchClient");
    const resultsBox = document.getElementById("clientSearchResults");

    if (!treeBox || !searchInput || !resultsBox) return;

    const tree = await fetch("/api/clients-tree").then(r => r.json());
    const flat = await fetch("/api/clients-flat").then(r => r.json());

    // 🌳 afișăm arborele de clienți
  treeBox.appendChild(
    renderTree(
      tree,
      name => {
        const client = flat.find(c => c.name === name);
        if (client && setSelectedClient(client)) {
          location.href = "client.html";
        }
      },
      { accordion: false } // ✅ aici e locul
    )
  );


    // 🔎 SEARCH LIVE CLIENTI
    searchInput.addEventListener("input", () => {
      const q = searchInput ? searchInput.value.toLowerCase().trim() : "";

      resultsBox.innerHTML = "";

      if (!q) return;

      flat
        .filter(c => c.name.toLowerCase().includes(q))
        .slice(0, 20)
        .forEach(c => {
          const b = document.createElement("button");
          b.className = "itembtn";
          b.textContent = c.name;

          b.onclick = () => {
            if (setSelectedClient(c)) {
              location.href = "client.html";
            }
          };

          resultsBox.appendChild(b);
        });
    });
  }
  // ================= COMANDA.HTML =================
 async function initOrderPage() {

  // ✅ Încărcăm ambele gestiuni separat
  const [depozitRes, magazinRes] = await Promise.all([
    fetch("/api/stock?warehouse=depozit").then(r => r.json()),
    fetch("/api/stock?warehouse=magazin").then(r => r.json())
  ]);
  
  // Map-uri separate pentru fiecare gestiune
  window.stockMapDepozit = {};
  window.stockMapMagazin = {};
  
  depozitRes.forEach(s => {
    const g = normalizeGTIN(s.gtin);
    window.stockMapDepozit[g] = (window.stockMapDepozit[g] || 0) + Number(s.qty);
  });
  
  magazinRes.forEach(s => {
    const g = normalizeGTIN(s.gtin);
    window.stockMapMagazin[g] = (window.stockMapMagazin[g] || 0) + Number(s.qty);
  });
  
  // ✅ Stock total pentru afișare (suma ambelor)
  stockMap = {};
  const allGtins = new Set([
    ...Object.keys(window.stockMapDepozit), 
    ...Object.keys(window.stockMapMagazin)
  ]);
  
  allGtins.forEach(gtin => {
    const dep = window.stockMapDepozit[gtin] || 0;
    const mag = window.stockMapMagazin[gtin] || 0;
    stockMap[gtin] = dep + mag; // Total pentru afișare
  });

  const treeBox = document.getElementById("productsTree");
  const searchInput = document.getElementById("searchProduct");
  const resultsBox = document.getElementById("productSearchResults");
  const sendBtn = document.getElementById("btnSendOrder");
  const title = document.getElementById("clientTitle");
  const meta = document.getElementById("clientMeta");

  if (!treeBox) return;

  // Încărcare date
  const tree = await fetch("/api/products-tree").then(r => r.json());
  const flatRaw = await fetch("/api/products-flat").then(r => r.json());
  const flat = Array.isArray(flatRaw) ? flatRaw : [];

  // Info client
  const client = getSelectedClient();
  if (client) {
    if (title) title.textContent = `Client: ${client.name}`;
    if (meta) meta.textContent = `Grup: ${client.group || "-"} • Categorie: ${client.category || "-"}`;
  } else {
    if (meta) meta.textContent = "Selectează un client pentru a începe comanda";
  }

  // Funcție helper: găsește produsul complet în flat după ID sau nume
// Funcție helper: găsește produsul complet în flat
function getFullProduct(item) {
  if (!item) return null;
  
  let found = null;
  
  if (typeof item === "string") {
    // Dacă e string (doar nume), caută după nume
    found = flat.find(p => p.name === item);
  } else if (typeof item === "object") {
    // Dacă e obiect, caută mai întâi după ID
    if (item.id) {
      found = flat.find(p => String(p.id) === String(item.id));
    }
    // Dacă nu găsește după ID, caută după nume
    if (!found && item.name) {
      found = flat.find(p => p.name === item.name);
    }
  }
  
  // Dacă tot nu găsește, returnează item-ul original (dar o să aibă preț 0)
  return found || item;
}

  // Render categorii
  function renderCategories(obj) {
    treeBox.innerHTML = "";
    
    if (isObject(obj)) {
      Object.entries(obj).forEach(([catName, items]) => {
        const section = document.createElement("div");
        section.className = "category-section";
        
        const header = document.createElement("div");
        header.className = "category-header";
        header.innerHTML = `
          <span>${catName}</span>
          <span class="category-toggle">▼</span>
        `;
        
        const productsDiv = document.createElement("div");
        productsDiv.className = "category-products";
        
        if (Array.isArray(items)) {
          items.forEach(item => {
            const productData = getFullProduct(item);
            
            if (productData) {
              const btn = document.createElement("button");
              btn.className = "product-btn";
              btn.textContent = productData.name;
              // IMPORTANT: Folosim getFullProduct ca să avem prețul
              btn.onclick = () => {
                const fullProduct = getFullProduct(item);
                console.log("Deschid modal cu produs:", fullProduct); // Debug
                openProductModal(fullProduct);
              };
              productsDiv.appendChild(btn);
            }
          });
        } else if (isObject(items)) {
          // Subcategorii
          Object.entries(items).forEach(([subName, subItems]) => {
            const subHeader = document.createElement("div");
            subHeader.style.cssText = "width:100%;padding:8px 0;font-weight:600;color:var(--text-muted);font-size:0.9rem;";
            subHeader.textContent = subName;
            productsDiv.appendChild(subHeader);
            
            if (Array.isArray(subItems)) {
              subItems.forEach(item => {
                const productData = getFullProduct(item);
                
                if (productData) {
                  const btn = document.createElement("button");
                  btn.className = "product-btn";
                  btn.textContent = productData.name;
                  // IMPORTANT: Folosim getFullProduct ca să avem prețul
                  btn.onclick = () => {
                    const fullProduct = getFullProduct(item);
                    console.log("Deschid modal cu produs (subcat):", fullProduct); // Debug
                    openProductModal(fullProduct);
                  };
                  productsDiv.appendChild(btn);
                }
              });
            }
          });
        }
        
        header.onclick = () => {
          header.classList.toggle("expanded");
        };
        
        section.appendChild(header);
        section.appendChild(productsDiv);
        treeBox.appendChild(section);
      });
    }
  }

  renderCategories(tree);

  // Search produse - ia direct din flat care are prețurile
  if (searchInput && resultsBox) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase().trim();
      resultsBox.innerHTML = "";
      
      if (!q) {
        resultsBox.classList.remove("show");
        return;
      }

      const matches = flat.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.path && p.path.toLowerCase().includes(q))
      ).slice(0, 20);

      if (matches.length === 0) {
        resultsBox.classList.remove("show");
        return;
      }

      matches.forEach(p => {
        const div = document.createElement("div");
        div.className = "search-result-item";
        div.innerHTML = `
          <div class="search-result-name">${p.name}</div>
          <div class="search-result-category">${p.path || p.category || "Produs"}</div>
        `;
        div.onclick = () => {
          openProductModal(p); // p vine din flat, are preț
          searchInput.value = "";
          resultsBox.classList.remove("show");
        };
        resultsBox.appendChild(div);
      });

      resultsBox.classList.add("show");
    });

    document.addEventListener("click", (e) => {
      if (!searchInput.contains(e.target) && !resultsBox.contains(e.target)) {
        resultsBox.classList.remove("show");
      }
    });
  }

  // Restul codului rămâne la fel...
  if (sendBtn) {
    sendBtn.onclick = async () => {
      const client = getSelectedClient();
      const items = getCart();

      if (!client) {
        alert("Client nesetat");
        return;
      }

      if (!items.length) {
        alert("Coșul este gol");
        return;
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client, items })
      });

      let data = {};
      try {
        data = await res.json();
      } catch {}

      if (!res.ok || data.error) {
        alert("Stoc insuficient pentru cel puțin un produs.\n\nVerifică cantitățile din coș.");
        return;
      }

      clearCart();
      alert("Comandă trimisă!");
      location.href = "index.html";
    };
  }

  renderCart();
}



  async function loadClientsAdmin() {
    // Dacă suntem pe clienti.html, nu facem nimic - pagina are propriul handler
    if (document.getElementById('clientDetails') && window.location.pathname.includes('clienti.html')) {
      return;
    }
    
    const res = await apiFetch("/api/clients-flat");
    const clients = await res.json();

    const prodRes = await apiFetch("/api/products-flat");
    const products = await prodRes.json();
    // map prețuri din catalog
  const priceById = new Map();
  const priceByGtin = new Map();

  products.forEach(p => {
    const price = Number(p.price || 0);

    // by id
    if (p.id != null) priceById.set(String(p.id), price);

    // by gtin(s)
    const all = []
      .concat(p.gtin ? [p.gtin] : [])
      .concat(Array.isArray(p.gtins) ? p.gtins : [])
      .filter(Boolean);

    all.forEach(g => priceByGtin.set(normalizeGTIN(g), price));
  });

  // helper: găsește prețul corect
  function resolvePrice(it) {
    const pid = (it.id != null) ? String(it.id) : "";
    if (pid && priceById.has(pid)) return priceById.get(pid);

    const g = normalizeGTIN(it.gtin);
    if (g && priceByGtin.has(g)) return priceByGtin.get(g);

    return Number(it.price || 0); // fallback
  }


    // map id -> nume produs
    const productNameById = new Map();
    products.forEach(p => productNameById.set(String(p.id), String(p.name || "")));

    const box = document.getElementById("clientsList");
    const details = document.getElementById("clientDetails");
    if (!box || !details) return;

    // === găsim inputul de search din ADMIN (foarte robust) ===
    // 1) încearcă ID-uri comune
    let searchInput =
      document.getElementById("searchClientAdmin") ||
      document.getElementById("searchClient") ||
      document.getElementById("clientSearch") ||
      document.getElementById("orderSearch"); // uneori copiat

    // 2) dacă tot nu, ia primul input din zona paginii de admin
    if (!searchInput) {
      // caută un input care are placeholder cu “client”
      searchInput = [...document.querySelectorAll("input")]
        .find(i => String(i.placeholder || "").toLowerCase().includes("client"));
    }

    // 3) container rezultate (opțional)
    let resultsBox =
      document.getElementById("clientSearchResultsAdmin") ||
      document.getElementById("clientSearchResults");

    // dacă nu există, creăm noi unul fix sub input
    if (!resultsBox && searchInput) {
      resultsBox = document.createElement("div");
      resultsBox.id = "clientSearchResultsAdminAuto";
      resultsBox.style.marginTop = "10px";
      searchInput.parentElement?.appendChild(resultsBox);
    }

    // debug: să vezi dacă a găsit inputul
    console.log("[ADMIN] searchInput found:", !!searchInput, searchInput);
    console.log("[ADMIN] resultsBox found:", !!resultsBox, resultsBox);

    function escapeHtml(s) {
      return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    // Încarcă categoriile pentru dropdown
    let clientCategories = [];
    async function loadClientCategories() {
      try {
        const res = await apiFetch("/api/client-categories");
        clientCategories = await res.json();
      } catch (e) {
        console.error('Eroare la încărcarea categoriilor:', e);
        clientCategories = [];
      }
    }
    loadClientCategories();

    function renderClientDetails(c) {
      const prices = c.prices || {};
      const lines = Object.entries(prices);
      const currentCategory = c.category || '';

      lines.sort(([a], [b]) => {
        const na = (productNameById.get(String(a)) || `Produs ID ${a}`).toLowerCase();
        const nb = (productNameById.get(String(b)) || `Produs ID ${b}`).toLowerCase();
        return na.localeCompare(nb, "ro");
      });

      const listHtml = lines.length
        ? `
          <details class="pricesBox">
            <summary><b>Prețuri speciale</b> (${lines.length})</summary>
            <ul>
              ${lines.map(([pid, pr]) => {
                const name = productNameById.get(String(pid)) || `Produs ID ${pid}`;
                const price = Number(pr);
                return `<li><b>${escapeHtml(name)}</b>: <b>${price.toFixed(2)}</b></li>`;
              }).join("")}
            </ul>
          </details>
        `
        : `<div><i>(Nu are prețuri speciale)</i></div>`;

      // Generează options pentru dropdown
      let categoryOptions = clientCategories.map(cat => 
        `<option value="${escapeHtml(cat)}" ${cat === currentCategory ? 'selected' : ''}>${escapeHtml(cat)}</option>`
      ).join('');
      
      // Adaugă opțiunea pentru categorie nouă
      if (!clientCategories.includes(currentCategory) && currentCategory) {
        categoryOptions += `<option value="${escapeHtml(currentCategory)}" selected>${escapeHtml(currentCategory)}</option>`;
      }
      categoryOptions += `<option value="__new__">+ Adaugă categorie nouă...</option>`;

      details.innerHTML = `
        <h3>${escapeHtml(c.name)}</h3>
        ${c.cui ? `<div style="margin-bottom: 0.5rem; color: #64748b;">🏢 CUI: ${escapeHtml(c.cui)}</div>` : ''}
        <div style="margin: 0.5rem 0;">
          <b>Categorie / Zonă:</b> ${escapeHtml(c.category || "-")}
          <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; align-items: center;">
            <select id="editCatSelect" class="input" style="flex: 1;" onchange="handleCategoryChange(this)">
              <option value="">-- Schimbă în --</option>
              ${categoryOptions}
            </select>
            <input type="text" id="newCatInput" class="input" placeholder="Categorie nouă..." 
                   style="flex: 1; display: none;">
            <button onclick="saveCategory('${c.id}')" class="btnPrimary" style="padding: 0.4rem 0.8rem; font-size: 0.9rem;">
              💾 Salvează
            </button>
          </div>
          <div id="catMsg" style="margin-top: 0.5rem; font-size: 0.85rem;"></div>
        </div>
        <hr/>
        ${listHtml}
      `;
      
      // Expune funcțiile global pentru onclick
      window.handleCategoryChange = function(select) {
        const newInput = document.getElementById('newCatInput');
        if (select.value === '__new__') {
          newInput.style.display = 'block';
          newInput.focus();
        } else {
          newInput.style.display = 'none';
        }
      };
      
      window.saveCategory = async function(clientId) {
        const select = document.getElementById('editCatSelect');
        const newInput = document.getElementById('newCatInput');
        const msg = document.getElementById('catMsg');
        
        let category = select.value === '__new__' ? newInput.value.trim() : select.value;
        
        if (!category) {
          msg.innerHTML = '<span style="color: #ef4444;">❌ Selectează sau introdu o categorie!</span>';
          return;
        }
        
        try {
          const res = await fetch(`/api/clients/${clientId}/category`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category })
          });
          
          if (res.ok) {
            msg.innerHTML = '<span style="color: #10b981;">✅ Categorie salvată!</span>';
            // Actualizează categoria local
            c.category = category;
            // Reîncarcă lista
            setTimeout(() => {
              loadClientsAdmin();
              loadClientCategories();
            }, 500);
          } else {
            const data = await res.json();
            msg.innerHTML = `<span style="color: #ef4444;">❌ Eroare: ${data.error || 'Necunoscută'}</span>`;
          }
        } catch (err) {
          msg.innerHTML = '<span style="color: #ef4444;">❌ Eroare de rețea!</span>';
        }
      };
    }

    function renderByCategory() {
      // Grupează clienții după categorie
      const byCategory = {};
      clients.forEach(c => {
        const cat = c.category || 'Fără categorie';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(c);
      });
      
      // Sortează categoriile
      const sortedCats = Object.keys(byCategory).sort();
      
      box.innerHTML = "";
      
      sortedCats.forEach(cat => {
        // Header categorie
        const catHeader = document.createElement('div');
        catHeader.style.cssText = `
          background: #1e293b; 
          padding: 0.75rem 1rem; 
          margin: 0.5rem 0; 
          border-radius: 0.5rem;
          font-weight: 600;
          color: #38bdf8;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
        `;
        catHeader.innerHTML = `
          <span>${escapeHtml(cat)}</span>
          <span style="font-size: 0.85rem; color: #64748b;">${byCategory[cat].length} clienți</span>
        `;
        
        // Lista clienților
        const clientList = document.createElement('div');
        clientList.style.cssText = 'margin-left: 0.5rem;';
        
        // Sortează clienții alfabetic
        byCategory[cat].sort((a, b) => a.name.localeCompare(b.name, 'ro'));
        
        byCategory[cat].forEach(c => {
          const btn = document.createElement('button');
          btn.className = 'itembtn';
          btn.style.cssText = `
            width: 100%; 
            text-align: left; 
            padding: 0.6rem 1rem;
            margin: 0.25rem 0;
            background: #0f172a;
            border: 1px solid #334155;
            border-radius: 0.375rem;
            color: white;
            cursor: pointer;
            transition: all 0.2s;
          `;
          btn.textContent = c.name;
          btn.onclick = () => renderClientDetails(c);
          clientList.appendChild(btn);
        });
        
        // Toggle functionality
        let expanded = true;
        catHeader.onclick = () => {
          expanded = !expanded;
          clientList.style.display = expanded ? 'block' : 'none';
          catHeader.style.opacity = expanded ? '1' : '0.7';
        };
        
        box.appendChild(catHeader);
        box.appendChild(clientList);
      });
    }

    function renderSearchResults(list) {
    // ✅ întotdeauna afișăm rezultatele în box (lista de clienți)
    box.innerHTML = "";

    if (!list.length) {
      box.innerHTML = "<p class='hint'>Niciun client găsit.</p>";
      return;
    }

    list.slice(0, 50).forEach(c => {
      const b = document.createElement("button");
      b.className = "itembtn";
      b.textContent = c.name;
      b.onclick = () => renderClientDetails(c);
      box.appendChild(b);
    });
  }


    // render default - by category
    renderByCategory();

    // === legăm SEARCH ===
    if (!searchInput) {
      console.warn("[ADMIN] Nu am găsit inputul de search. Pune-i un id (ex: searchClientAdmin).");
      return;
    }

    // IMPORTANT: nu lăsa pagina să aibă două handlers suprapuse vechi
    searchInput.oninput = null;

    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase().trim();

    

      if (!q) {
        renderByCategory();
        return;
      }

      const filtered = clients.filter(c =>
        String(c.name || "").toLowerCase().includes(q)
      );

      renderSearchResults(filtered);
    });
  }


 async function initAddClientPage() {
  const treeBox = document.getElementById("clientsTree");
  const searchInput = document.getElementById("searchClient");
  const resultsBox = document.getElementById("clientSearchResults");

  if (!treeBox || !searchInput || !resultsBox) {
    console.log("Lipsesc elementele:", {treeBox, searchInput, resultsBox});
    return;
  }

  try {
    const [treeRes, flatRes] = await Promise.all([
      fetch("/api/clients-tree"),
      fetch("/api/clients-flat")
    ]);
    
    const tree = await treeRes.json();
    const flat = await flatRes.json();

    // Golește "Se încarcă..."
    treeBox.innerHTML = "";
    
    // Render tree
    treeBox.appendChild(
      renderTree(
        tree,
        name => {
          const client = flat.find(c => c.name === name);
          if (client && setSelectedClient(client)) {
            location.href = "client.html";
          }
        },
        { accordion: false }
      )
    );

    // 🔎 SEARCH LIVE - CORECTAT
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase().trim();
      
      // Golește și ascunde
      resultsBox.innerHTML = "";
      
      if (!q) {
        resultsBox.classList.remove("show");
        return;
      }

      const matches = flat.filter(c => 
        c.name.toLowerCase().includes(q)
      ).slice(0, 20);

      if (matches.length === 0) {
        resultsBox.classList.remove("show");
        return;
      }

      // Populează rezultatele
      matches.forEach(c => {
        const b = document.createElement("button");
        b.className = "itembtn";
        b.textContent = c.name;
        b.onclick = () => {
          if (setSelectedClient(c)) {
            searchInput.value = "";
            resultsBox.classList.remove("show");
            location.href = "client.html";
          }
        };
        resultsBox.appendChild(b);
      });

      // ✅ AFIȘEAZĂ DROPDOWN-ul
      resultsBox.classList.add("show");
    });

    // Click în afară = închide
    document.addEventListener("click", (e) => {
      if (!searchInput.contains(e.target) && !resultsBox.contains(e.target)) {
        resultsBox.classList.remove("show");
      }
    });

  } catch (err) {
    console.error("Eroare la încărcarea clienților:", err);
    treeBox.innerHTML = "<p class='empty-state'>Eroare la încărcarea clienților</p>";
  }
}




  function getProductClass(name) {
    const n = name.toLowerCase();

    if (n.includes("active") || n.includes("chilot")) return "active";
    if (n.includes("air") || n.includes("scai")) return "air";
    if (n.includes("lady")) return "lady";
    if (n.includes("bella")) return "bella";

    return "altele";
  }

  async function initProductsPage() {
  const btnShow = document.getElementById("btnShowAddProduct");
  const modal = document.getElementById("addProductModal");
  const btnCancel = document.getElementById("btnCancelProduct");
  const btnSave = document.getElementById("btnSaveProduct");

  // nu suntem pe pagina produse
  if (!btnShow) return;

  if (!modal || !btnCancel || !btnSave) {
    console.warn("Lipsesc elemente modal produse (addProductModal/btnCancelProduct/btnSaveProduct).");
    return;
  }

  btnShow.onclick = () => modal.classList.remove("hidden");
  btnCancel.onclick = () => modal.classList.add("hidden");

 btnSave.onclick = async () => {
  const name = document.getElementById("newProdName")?.value.trim();
  const gtin = document.getElementById("newProdGtin")?.value.trim();
  const priceRaw = document.getElementById("newProdPrice")?.value.trim();
  const category = document.getElementById("newProdCategory")?.value.trim();

  const gtinsRaw = document.getElementById("newProdGtins")?.value || "";
  const gtins = gtinsRaw
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  if (!name) return alert("Completează numele produsului.");

  const res = await apiFetch("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      gtin,        // principal
      gtins,       // ✅ lista extra
      category,
      price: priceRaw ? Number(priceRaw) : null
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return alert(data.error || "Eroare la salvare");

  modal.classList.add("hidden");

  ["newProdName","newProdGtin","newProdGtins","newProdPrice","newProdCategory"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  location.reload();
};
}

  // ================= ORDERS.HTML =================
  // ================= ORDERS.HTML =================
async function initOrdersPage() {
  const list = document.getElementById("ordersList");
  if (!list) return;

  const selGroup = document.getElementById("filterGroup");
  const selCategory = document.getElementById("filterCategory");
  const tabsBox = document.getElementById("statusTabs");
  const searchInput = document.getElementById("orderSearch");
  const searchResults = document.getElementById("orderSearchResults");
  const btnReset = document.getElementById("btnResetFilters");

  const statusLabels = {
    "": "Toate",
    "false": "Netrimise",
    "true": "Trimise"
  };

  const TAB_ORDER = ["false", "true", ""];

  // Curățăm filtrul forcedClient la încărcare
  const urlParams = new URLSearchParams(window.location.search);
  const fromClient = urlParams.get('from') === 'client';
  const forcedClient = fromClient ? localStorage.getItem("ordersClientFilter") : null;
  
  if (!fromClient) {
    localStorage.removeItem("ordersClientFilter");
  }

  let orders = [];
  let clients = [];

  function getFilterState() {
    // Citește statusul din TAB-UL ACTIV
    const activeTab = tabsBox?.querySelector(".mTab.active");
    const sFilter = activeTab?.dataset?.status || "";
    
    return {
      gFilter: selGroup ? (selGroup.value || "") : "",
      cFilter: selCategory ? (selCategory.value || "") : "",
      sFilter: sFilter,
      q: searchInput ? (searchInput.value || "").toLowerCase().trim() : ""
    };
  }

  function setStatusFilter(v) {
    const val = v || "";
    if (tabsBox) {
      [...tabsBox.querySelectorAll(".mTab")].forEach(b => {
        b.classList.toggle("active", (b.dataset.status || "") === val);
      });
    }
  }

  function getOrderGroup(o) {
    const name = o?.client?.name;
    return clientGroupMap[name] || o?.client?.group || "";
  }

  function getOrderCategory(o) {
    const name = o?.client?.name;
    return clientCategoryMap[name] || "";
  }

  // 1) LOAD DATA
  try {
    const res = await apiFetch("/api/orders");
    if (!res.ok) throw new Error("Eroare la încărcare comenzi");
    orders = await res.json();

    const clientsRes = await apiFetch("/api/clients-flat");
    clients = await clientsRes.json();
  } catch (e) {
    console.error("Eroare loading:", e);
    list.innerHTML = `<p class='hint'>Eroare la încărcarea datelor. Reîncercați.</p>`;
    return;
  }

  // Map-uri pentru lookup rapid
  const clientGroupMap = {};
  const clientCategoryMap = {};
  clients.forEach(c => {
    const name = String(c.name || "").trim();
    if (!name) return;
    clientGroupMap[name] = String(c.group || "").trim();
    clientCategoryMap[name] = String(c.category || "").trim();
  });

  // 2) BUILD GROUP OPTIONS
  function buildGroupOptions() {
    if (!selGroup) return;
    const groups = new Set();
    orders.forEach(o => {
      const g = getOrderGroup(o);
      if (g) groups.add(g);
    });

    selGroup.innerHTML = `<option value="">Toate grupurile</option>`;
    [...groups].sort((a, b) => a.localeCompare(b, "ro")).forEach(g => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = g;
      selGroup.appendChild(opt);
    });
  }

  // 3) REBUILD CATEGORIES
  function rebuildCategoryOptions() {
    if (!selCategory) return;
    const gFilter = selGroup ? (selGroup.value || "") : "";
    const catsSet = new Set();
    
    orders.forEach(o => {
      const g = getOrderGroup(o);
      if (gFilter && g !== gFilter) return;
      const cat = getOrderCategory(o);
      if (cat) catsSet.add(cat);
    });

    const prev = selCategory.value || "";
    selCategory.innerHTML = `<option value="">Toate categoriile</option>`;

    const CATEGORY_ORDER = [
      "Seni Active Classic x30", "Seni Active Classic x10",
      "Seni Classic Air x30", "Seni Classic Air x10",
      "Seni Aleze x30", "Seni Lady", "Manusi", "Absorbante Bella", "Altele"
    ];

    const ordered = [];
    CATEGORY_ORDER.forEach(c => { if (catsSet.has(c)) ordered.push(c); });
    const rest = [...catsSet].filter(c => !CATEGORY_ORDER.includes(c))
      .sort((a, b) => a.localeCompare(b, "ro"));
    
    [...ordered, ...rest].forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      selCategory.appendChild(opt);
    });

    selCategory.value = catsSet.has(prev) ? prev : "";
  }

  // 4) COUNTS + TABS
  function getCounts() {
    const counts = { "": 0, "false": 0, "true": 0 };
    orders.forEach(o => {
      if (!o) return;
      const s = o.sentToSmartbill ? "true" : "false";
      counts[s]++;
      counts[""]++;
    });
    return counts;
  }

  function renderTabs() {
    if (!tabsBox) return;
    const counts = getCounts();
    tabsBox.innerHTML = "";

    TAB_ORDER.forEach(st => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mTab";
      btn.dataset.status = st;
      btn.innerHTML = `
        <span>${statusLabels[st] || st}</span>
        <span class="badge">${counts[st] || 0}</span>
      `;
      btn.onclick = () => {
        setStatusFilter(st);
        render();
      };
      tabsBox.appendChild(btn);
    });
    setStatusFilter("");
  }

  // 5) MAIN RENDER
  function render() {
    if (!list) return;
    
    const { gFilter, cFilter, sFilter, q } = getFilterState();
    list.innerHTML = "";

    // Filtrare
    const filtered = orders.filter(o => {
      if (!o || typeof o !== 'object') return false;
      
      const g = getOrderGroup(o);
      if (gFilter && g !== gFilter) return false;
      
      const cat = getOrderCategory(o);
      if (cFilter && cat !== cFilter) return false;
      
      // Filtrare după sentToSmartbill
      const sent = o.sentToSmartbill ? "true" : "false";
      if (sFilter && sent !== sFilter) return false;
      
      const clientName = String(o?.client?.name || "").toLowerCase();
      if (q && !clientName.includes(q)) return false;
      
      if (forcedClient) {
        const cn = String(o?.client?.name || "");
        if (cn !== forcedClient) return false;
      }
      return true;
    });

    if (!filtered.length) {
      list.innerHTML = "<p class='hint'>Nu există comenzi pentru filtrele selectate.</p>";
      return;
    }

    filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    filtered.forEach(o => {
      if (!o) return;
      
      const card = document.createElement("div");
      card.className = "orderCard";

      const head = document.createElement("div");
      head.className = "orderHeader";
      
      const clientName = o?.client?.name || 'Fără nume';
      const groupName = getOrderGroup(o) || '-';
      const orderDate = o.createdAt ? new Date(o.createdAt).toLocaleDateString("ro-RO") : '-';
      
      // Info principal
      const infoSpan = document.createElement("span");
      infoSpan.textContent = `${clientName} (${groupName}) – ${orderDate}`;
      head.appendChild(infoSpan);
      
      // BADGE STATUS
      const statusBadge = document.createElement("span");
      if (o.sentToSmartbill) {
        statusBadge.textContent = "✅ Trimis";
        statusBadge.style.cssText = "background: rgba(34, 197, 94, 0.15); color: #22c55e; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; margin-left: 12px; border: 1px solid rgba(34, 197, 94, 0.3);";
      } else {
        statusBadge.textContent = "❌ Netrimis";
        statusBadge.style.cssText = "background: rgba(234, 179, 8, 0.15); color: #fbbf24; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; margin-left: 12px; border: 1px solid rgba(234, 179, 8, 0.3);";
      }
      head.appendChild(statusBadge);

      // Buton Modifică (doar netrimise)
     // Butoane doar pentru comenzi netrimise (Modifică, Trimite SB, Șterge)
if (!o.sentToSmartbill) {
  // Buton Modifică
  const editBtn = document.createElement("button");
  editBtn.textContent = "✏️ Modifică";
  editBtn.className = "btnEdit";
  editBtn.onclick = (e) => {
    e.stopPropagation();
    localStorage.setItem("editOrder", JSON.stringify(o));
    location.href = "editorder.html";
  };
  head.appendChild(editBtn);
  
  // Buton Trimite SB
  const sendBtn = document.createElement("button");
  sendBtn.textContent = "📤 Trimite SB";
  sendBtn.style.cssText = "background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; margin-left: 8px; font-weight: 600; font-size: 0.8125rem;";
  sendBtn.onclick = async (e) => {
    e.stopPropagation();
    if (!confirm('Trimite comanda la SmartBill?')) return;
    
    sendBtn.disabled = true;
    sendBtn.textContent = "⏳...";
    
    try {
      const res = await fetch(`/api/orders/${o.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        alert(`✅ Trimis: ${data.smartbillSeries} ${data.smartbillNumber}`);
        o.sentToSmartbill = true;
        renderTabs();
        render();
      } else {
        alert(`❌ Eroare: ${data.error || 'Necunoscută'}`);
        sendBtn.disabled = false;
        sendBtn.textContent = "📤 Trimite SB";
      }
    } catch (err) {
      alert('❌ Eroare de rețea');
      sendBtn.disabled = false;
      sendBtn.textContent = "📤 Trimite SB";
    }
  };
  head.appendChild(sendBtn);
  
  // ✅ BUTON ȘTERGE (NOU)
  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "🗑️ Șterge";
  deleteBtn.style.cssText = "background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; margin-left: 8px; font-weight: 600; font-size: 0.8125rem;";
  deleteBtn.onclick = async (e) => {
    e.stopPropagation();
    
    if (!confirm(`⚠️ Sigur vrei să ștergi comanda pentru ${o.client?.name || 'client'}?\n\nAceastă acțiune nu poate fi anulată!`)) {
      return;
    }
    
    // Confirmare suplimentară
    if (!confirm("Confirmi încă o dată ștergerea comenzii?")) {
      return;
    }
    
    try {
      const res = await apiFetch(`/api/orders/${o.id}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        // Elimină cardul din DOM cu animație
        card.style.transition = "all 0.3s ease";
        card.style.opacity = "0";
        card.style.transform = "translateX(-20px)";
        
        setTimeout(() => {
          card.remove();
          
          // Dacă nu mai sunt comenzi, re-render
          const remaining = list.querySelectorAll('.orderCard');
          if (remaining.length === 0) {
            render();
          }
          
          // Update tabs counts
          renderTabs();
        }, 300);
        
        showToast(`🗑️ Comanda pentru ${o.client?.name || 'client'} a fost ștearsă`);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(`❌ Eroare la ștergere: ${data.error || 'Nu s-a putut șterge comanda'}`);
      }
    } catch (err) {
      console.error('Eroare ștergere:', err);
      alert('❌ Eroare de rețea la ștergere');
    }
  };
  head.appendChild(deleteBtn);
}

      // Buton Detalii (toate)
      const pickBtn = document.createElement("button");
      pickBtn.textContent = "📦 Pregateste Comanda";
      pickBtn.className = "btnPick";
      pickBtn.style.marginLeft = "8px";
      pickBtn.onclick = (e) => {
        e.stopPropagation();
        localStorage.setItem("pickingOrder", JSON.stringify(o));
        localStorage.removeItem("pickState");
        location.href = "pickingorder.html";
      };
      head.appendChild(pickBtn);

      // Body
      const body = document.createElement("div");
      body.className = "orderBody";
      body.style.display = "none";

      const items = Array.isArray(o.items) ? o.items : [];
      
      if (items.length === 0) {
        body.innerHTML = '<div style="padding: 20px; color: var(--text-muted); text-align: center;">Nu există produse.</div>';
      } else {
        items.forEach(i => {
          const row = document.createElement("div");
          row.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 8px;";
          const price = Number(i?.price || i?.unitPrice || 0);
          const qty = Number(i?.qty || 0);
          const total = price * qty;
          row.innerHTML = `
            <div>
              <div style="font-weight: 600;">${i?.name || 'Produs'}</div>
              <div style="font-size: 0.875rem; color: var(--text-muted);">${i?.gtin || '-'} | ${qty} buc × ${price.toFixed(2)} RON</div>
            </div>
            <div style="font-weight: 700; color: var(--primary-400);">${total.toFixed(2)} RON</div>
          `;
          body.appendChild(row);
        });
      }

     head.addEventListener("click", (e) => {
  // Doar butoanele opresc propagarea, nu și textul/spanele normale
  if (e.target.closest("button")) return;
  
  // Toggle accordion
  const isHidden = body.style.display === "none";
  body.style.display = isHidden ? "block" : "none";
  head.style.borderBottom = isHidden ? "1px solid var(--border-color)" : "none";
});

      card.appendChild(head);
      card.appendChild(body);
      list.appendChild(card);
    });
  }

  // 6) SEARCH live
  if (searchInput && searchResults) {
    searchInput.addEventListener("input", () => {
      render();
      
      const q = searchInput.value.toLowerCase().trim();
      searchResults.innerHTML = "";
      
      if (!q) {
        searchResults.classList.remove("show");
        return;
      }

      const matches = [...new Set(orders.map(o => o?.client?.name).filter(Boolean))]
        .filter(name => name.toLowerCase().includes(q))
        .slice(0, 10);

      matches.forEach(name => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = name;
        b.onclick = () => {
          searchInput.value = name;
          searchResults.innerHTML = "";
          searchResults.classList.remove("show");
          render();
        };
        searchResults.appendChild(b);
      });
      
      searchResults.classList.toggle("show", matches.length > 0);
    });
  }

  // 7) EVENTS
  if (selGroup) {
    selGroup.onchange = () => {
      rebuildCategoryOptions();
      render();
    };
  }
  if (selCategory) selCategory.onchange = render;

  if (btnReset) {
    btnReset.onclick = () => {
      if (selGroup) selGroup.value = "";
      if (selCategory) selCategory.value = "";
      if (searchInput) searchInput.value = "";
      if (searchResults) searchResults.innerHTML = "";
      localStorage.removeItem("ordersClientFilter");
      setStatusFilter("");
      rebuildCategoryOptions();
      renderTabs();
      render();
    };
  }

  // 8) INIT
  buildGroupOptions();
  rebuildCategoryOptions();
  renderTabs();
  render();
}



  function yymmddToISO(v) {
    v = String(v || "").trim();
    if (v.length !== 6) return "";
    return `20${v.slice(0,2)}-${v.slice(2,4)}-${v.slice(4,6)}`;
  }

   function parseGS1(qr) {
    const out = {};
    let s0 = sanitizeGS1(qr);
    if (!s0) return out;

    // === CAZ 1: Format cu paranteze (AI)valoare ===
    if (s0.includes("(")) {
      const regex = /\((\d{2})\)([^()]*)/g;
      let m;
      
      while ((m = regex.exec(s0)) !== null) {
        const ai = m[1];
        const val = (m[2] || "").trim();
        
        if (ai === "01") out.gtin = val;
        else if (ai === "17") out.expiresAt = yymmddToISO(val);
        else if (ai === "10") out.lot = val;
        // 11 ignorăm (data fabricației)
      }
      
      // Dacă nu am găsit GTIN cu (01), verificăm dacă începe cu cifre (GTIN fără prefix)
      if (!out.gtin) {
        const leadingMatch = s0.match(/^(\d{8,14})/);
        if (leadingMatch) {
          out.gtin = leadingMatch[1];
          console.log("GTIN extras din început (fără prefix 01):", out.gtin);
        }
      }
      
      return out;
    }

    // === CAZ 2: Format fără paranteze, cu prefixe AI ===
    let i = 0;
    const s = s0;
    const take = (n) => {
      const part = s.slice(i, i + n);
      i += n;
      return part;
    };

    while (i + 2 <= s.length) {
      const ai = take(2);

      if (ai === "01") { 
        out.gtin = take(14); 
        continue; 
      }
      if (ai === "17") { 
        out.expiresAt = yymmddToISO(take(6)); 
        continue; 
      }
      if (ai === "11") { 
        take(6); 
        continue; 
      } // ignoră fabricație
      if (ai === "10") { 
        out.lot = s.slice(i).trim(); 
        break; 
      }

      break;
    }
    
    // === CAZ 3: Dacă tot nu am găsit GTIN, verificăm dacă e doar un GTIN simplu ===
    if (!out.gtin && /^\d{8,14}$/.test(s0)) {
      out.gtin = s0;
    }

    return out;
  }

 function parseGS1(qr) {
  const out = {};
  const s0 = sanitizeGS1(qr);
  if (!s0) return out;

  console.log("parseGS1 input:", s0);

  // === CAZ 1: Format cu paranteze (01)GTIN(17)EXP(10)LOT ===
  if (s0.includes("(")) {
    const regex = /\((\d{2})\)([^()]*)/g;
    let match;
    
    while ((match = regex.exec(s0)) !== null) {
      const ai = match[1];
      let value = match[2] || "";
      
      // Pentru câmpuri variabile (ca LOT), valoarea poate conține următorul AI dacă nu e delimitat corect
      // Încercăm să găsim unde începe următorul AI în valoare
      if (ai === "10" || ai === "21") { // LOT sau Serial sunt variabile
        const nextAiInValue = value.match(/\(\d{2}\)/);
        if (nextAiInValue && nextAiInValue.index > 0) {
          value = value.substring(0, nextAiInValue.index);
        }
      }
      
      if (ai === "01") out.gtin = value.substring(0, 14);
      else if (ai === "17") out.expiresAt = yymmddToISO(value);
      else if (ai === "10") out.lot = value;
      else if (ai === "21") out.serial = value;
    }
    
    console.log("parseGS1 output (paranteze):", out);
    return out;
  }

  // === CAZ 2: Format fără paranteze 01GTIN17EXP10LOT... ===
  let i = 0;
  const s = s0;
  
  while (i + 2 <= s.length) {
    const ai = s.slice(i, i + 2);
    i += 2;
    
    if (ai === "01") { 
      // GTIN - poate fi 8, 12, 13 sau 14 cifre
      // Căutăm următorul AI sau luăm maxim 14 cifre
      let gtin = "";
      const remaining = s.slice(i);
      
      // Pattern: între 8 și 14 cifre urmate de alt AI (10, 11, 17, 21) sau final
      const match = remaining.match(/^(\d{8,14})(?=(10|11|17|21)\d|$)/);
      if (match) {
        gtin = match[1];
        i += gtin.length;
      } else {
        // Fallback: luăm câte cifre mai sunt (max 14)
        gtin = remaining.slice(0, 14).replace(/\D/g, '');
        i += gtin.length;
      }
      out.gtin = gtin;
    }
    else if (ai === "17") { 
      const val = s.slice(i, i + 6);
      if (val.length === 6) {
        out.expiresAt = yymmddToISO(val);
        i += 6;
      }
    }
    else if (ai === "11") { 
      i += 6; // Skip data fabricație
    }
    else if (ai === "10") { 
      // LOT variabil - până la următorul AI sau final
      const remaining = s.slice(i);
      const nextAiMatch = remaining.match(/(10|11|17|21)\d/);
      let lot = "";
      
      if (nextAiMatch && nextAiMatch.index > 0) {
        lot = remaining.slice(0, nextAiMatch.index);
        i += nextAiMatch.index;
      } else {
        lot = remaining;
        i = s.length;
      }
      out.lot = lot;
    }
    else if (ai === "21") {
      // Serial variabil
      const remaining = s.slice(i);
      const nextAiMatch = remaining.match(/(01|10|11|17)\d/);
      let serial = "";
      
      if (nextAiMatch && nextAiMatch.index > 0) {
        serial = remaining.slice(0, nextAiMatch.index);
        i += nextAiMatch.index;
      } else {
        serial = remaining;
        i = s.length;
      }
      out.serial = serial;
    }
    else {
      // AI necunoscut, încercăm să avansăm
      // Dacă următoarele caractere sunt cifre, posibil sunt date pentru AI-ul curent
      if (/^\d/.test(s.slice(i, i + 1))) {
        // Sărim peste un bloc de cifre (presupunem că e dată fixă de 6-14 caractere)
        const digits = s.slice(i).match(/^\d+/);
        if (digits) i += Math.min(digits[0].length, 14);
      }
    }
  }

  // === CAZ 3: Fallback - doar cifre, posibil doar GTIN ===
  if (!out.gtin && /^\d{8,14}$/.test(s0)) {
    out.gtin = s0;
  }

  console.log("parseGS1 output (fără paranteze):", out);
  return out;
}

 function sanitizeGS1(raw) {
  const GS = String.fromCharCode(29); // FNC1 / Group Separator
  return String(raw || "")
    .replace(/\u0000/g, "")          // NULL
    .replace(/\u200B/g, "")          // zero-width space
    .replace(new RegExp(GS, "g"), "")// scoate GS
    .replace(/[\r\n\t ]+/g, "")      // whitespace - NU elimina parantezele!
    .trim();
}

  // Converteste yyyy-mm-dd (ISO) → dd.mm.yyyy (pentru afișare în input)
function toDisplayDate(isoDate) {
  if (!isoDate) return "";
  const parts = String(isoDate).split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

// Converteste dd.mm.yyyy → yyyy-mm-dd (pentru trimis la server)
function fromDisplayDate(displayDate) {
  if (!displayDate) return "";
  const parts = String(displayDate).split(".");
  if (parts.length !== 3) return displayDate;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}





  function normalizeGTIN(gtin) {
    let g = String(gtin || "").replace(/\D/g, ""); // doar cifre
    // dacă ai GTIN-14 cu 0 în față, îl faci GTIN-13
    if (g.length === 14 && g.startsWith("0")) g = g.slice(1);
    return g;
  }

function selectProductByGTIN(gtin) {
  const scanned = normalizeGTIN(gtin);
  console.log("Caut produs pentru GTIN:", scanned);
  
  // Verificăm dacă avem produsele încărcate în variabila globală
  if (!window.stockPageProducts || !Array.isArray(window.stockPageProducts)) {
    console.warn("Produsele nu sunt încărcate încă în window.stockPageProducts");
    return;
  }

  // Caută produsul după GTIN (principal sau în lista gtins)
  const found = window.stockPageProducts.find(p => {
    const mainGtin = normalizeGTIN(p.gtin);
    if (mainGtin === scanned) return true;
    
    if (Array.isArray(p.gtins)) {
      return p.gtins.some(g => normalizeGTIN(g) === scanned);
    }
    return false;
  });

  console.log("Produs găsit:", found);

  if (found && typeof window.selectStockProduct === 'function') {
    window.selectStockProduct(found);
    
    // Afișează indicatorul verde
    const okEl = document.getElementById("stockAutoOk");
    if (okEl) okEl.style.display = "flex";
    
    console.log("Produs selectat cu succes:", found.name);
  } else {
    // Dacă nu găsim produsul, afișăm warning
    const okEl = document.getElementById("stockAutoOk");
    if (okEl) okEl.style.display = "none";
    
    console.warn("GTIN negăsit în lista de produse:", scanned);
    // Opțional: alertă utilizatorului
    // alert("Produsul cu GTIN " + scanned + " nu a fost găsit în baza de date. Adaugă produsul mai întâi în pagina de produse.");
  }
}




 async function initEditOrderPage() {
    const meta = document.getElementById("editOrderMeta");
    const hint = document.getElementById("editOrderHint");
    const list = document.getElementById("editItemsList");
    const countEl = document.getElementById("editItemsCount");
    const totalEl = document.getElementById("editOrderTotal");

    const search = document.getElementById("editProductSearch");
    const results = document.getElementById("editProductResults");

    const btnBack = document.getElementById("btnBackOrders");
    const btnDiscard = document.getElementById("btnDiscardEdit");
    const btnSave = document.getElementById("btnSaveEdit");

    if (!list || !search || !results || !btnSave) return;

    btnBack.onclick = () => (location.href = "orders.html");
    btnDiscard.onclick = () => {
      localStorage.removeItem("editOrder");
      location.href = "orders.html";
    };

    // 1) încărcăm comanda selectată din localStorage
    let order;
    try {
      order = JSON.parse(localStorage.getItem("editOrder") || "null");
    } catch {
      order = null;
    }

    if (!order) {
      alert("Nu există comandă de modificat.");
      location.href = "orders.html";
      return;
    }

    // === VERIFICARE SMARTBILL ===
    try {
      const checkRes = await apiFetch("/api/orders");
      const allOrders = await checkRes.json();
      const freshOrder = allOrders.find(o => o.id === order.id);
      
      if (freshOrder && freshOrder.sentToSmartbill) {
        document.body.innerHTML = `
          <div style="
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            min-height: 100vh; 
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: #f8fafc;
            font-family: 'Inter', sans-serif;
            padding: 20px;
            text-align: center;
          ">
            <div style="font-size: 4rem; margin-bottom: 20px;">🔒</div>
            <h1 style="margin-bottom: 10px; color: #ef4444;">Factură emisă</h1>
            <p style="color: #cbd5e1; margin-bottom: 20px; max-width: 500px;">
              Această comandă a fost deja trimisă la SmartBill și nu poate fi modificată.
            </p>
            <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); padding: 20px; border-radius: 12px; margin-bottom: 30px; min-width: 300px;">
              <div style="color: #22c55e; font-weight: 700; font-size: 1.2rem;">
                ${freshOrder.smartbillSeries || 'oBill'} ${freshOrder.smartbillNumber || '-'}
              </div>
              <div style="color: #cbd5e1; font-size: 0.875rem; margin-top: 8px;">
                Emisă la: ${new Date(freshOrder.createdAt).toLocaleDateString('ro-RO')}
              </div>
            </div>
            <a href="client.html" style="
              background: linear-gradient(135deg, #3b82f6, #2563eb);
              color: white;
              padding: 12px 24px;
              border-radius: 8px;
              text-decoration: none;
              font-weight: 600;
            ">
              ← Înapoi la client
            </a>
          </div>
        `;
        return;
      }
    } catch (err) {
      console.error("Eroare verificare SmartBill:", err);
    }

    // protecție: doar în procesare
    const statusNow = order.status || "in_procesare";
    if (statusNow !== "in_procesare") {
      alert("Poți modifica doar comenzi în procesare.");
      location.href = "orders.html";
      return;
    }

    // 2) luăm lista de produse (MUTAT AICI - înainte de resolvePrice)
    const prodRes = await apiFetch("/api/products-flat");
    const products = await prodRes.json();

    // ===== PRICE MAPS =====
    const priceById = new Map();
    const priceByGtin = new Map();

    products.forEach(p => {
      const price = Number(p.price || 0);
      if (p.id != null) priceById.set(String(p.id), price);
      
      const all = []
        .concat(p.gtin ? [p.gtin] : [])
        .concat(Array.isArray(p.gtins) ? p.gtins : [])
        .filter(Boolean);
      
      all.forEach(g => priceByGtin.set(normalizeGTIN(g), price));
    });

    // 3) DEFINIRE resolvePrice (ACUM priceById există deja)
    function resolvePrice(it) {
      const pid = (it.id != null) ? String(it.id) : "";
      if (pid && priceById.has(pid)) return priceById.get(pid);

      const g = normalizeGTIN(it.gtin);
      if (g && priceByGtin.has(g)) return priceByGtin.get(g);

      return Number(it.price || 0);
    }

    // 4) ABIA ACUM editItems - resolvePrice e definită
    let editItems = Array.isArray(order.items) ? order.items.map(it => ({
      id: it.id,
      name: it.name,
      gtin: it.gtin,
      qty: Number(it.qty || 1),
      price: resolvePrice(it)
    })) : [];

    // ... restul funcțiilor (calcTotal, renderTotal, renderMeta, etc.) rămân la fel
    function calcTotal() {
      let total = 0;
      for (const it of editItems) {
        const price = Number(it.price || 0);
        const qty = Number(it.qty || 0);
        total += price * qty;
      }
      return total;
    }

    function renderTotal() {
      if (!totalEl) return;
      const t = calcTotal();
      totalEl.textContent = `${t.toFixed(2)} RON`;
    }

    function renderMeta() {
      if (!meta) return;
      meta.innerHTML = `
        <div><b>Client:</b> ${order.client?.name || "-"}</div>
        <div><b>Data:</b> ${order.createdAt ? new Date(order.createdAt).toLocaleString("ro-RO") : "-"}</div>
        <div><b>Status:</b> În procesare</div>
      `;
    }

    function renderItems() {
      list.innerHTML = "";
      if (!editItems.length) {
        list.innerHTML = `<div class="empty">Nu ai produse. Adaugă din dreapta.</div>`;
        if (countEl) countEl.textContent = "0";
        renderTotal();
        return;
      }

      editItems.forEach((it, idx) => {
        const row = document.createElement("div");
        row.className = "row";
        const left = document.createElement("div");
        left.className = "rowLeft";
        const price = Number(it.price || 0);
        const qtyNum = Number(it.qty || 0);
        const line = price * qtyNum;

        left.innerHTML = `
          <div class="rowTitle">${it.name || "Produs"}</div>
          <div class="muted small">GTIN: ${it.gtin || "-"}</div>
          <div class="muted small">Preț: ${price.toFixed(2)} RON</div>
          <div class="muted small">Subtotal: <b>${line.toFixed(2)} RON</b></div>
        `;

        const right = document.createElement("div");
        right.className = "rowRight";

        const btnMinus = document.createElement("button");
        btnMinus.className = "iconBtn";
        btnMinus.textContent = "−";
        btnMinus.onclick = () => {
          it.qty = Math.max(1, Number(it.qty || 1) - 1);
          renderItems();
        };

        const qty = document.createElement("input");
        qty.type = "number";
        qty.min = "1";
        qty.value = String(it.qty || 1);
        qty.className = "qtyInput";
        qty.onchange = () => {
          const v = parseInt(qty.value, 10);
          if (!Number.isFinite(v) || v <= 0) return;
          it.qty = v;
          renderItems();
        };

        const btnPlus = document.createElement("button");
        btnPlus.className = "iconBtn";
        btnPlus.textContent = "+";
        btnPlus.onclick = () => {
          it.qty = Number(it.qty || 1) + 1;
          renderItems();
        };

        const btnDel = document.createElement("button");
        btnDel.className = "iconBtn danger";
        btnDel.textContent = "🗑";
        btnDel.onclick = () => {
          editItems.splice(idx, 1);
          renderItems();
        };

        right.append(btnMinus, qty, btnPlus, btnDel);
        row.append(left, right);
        list.appendChild(row);
      });

      if (countEl) countEl.textContent = String(editItems.length);
      renderTotal();
    }

    function addProduct(p) {
      const primaryGTIN = (Array.isArray(p.gtins) && p.gtins.length) ? p.gtins[0] : (p.gtin || "");
      const g = normalizeGTIN(primaryGTIN);
      const found = editItems.find(x => normalizeGTIN(x.gtin) === g);
      
      if (found) {
        found.qty = Number(found.qty || 1) + 1;
      } else {
        editItems.push({
          id: p.id,
          name: p.name,
          gtin: primaryGTIN,
          qty: 1,
          price: Number(p.price || 0)
        });
      }
      renderItems();
    }

    function renderProductResults(q) {
      results.innerHTML = "";
      const query = String(q || "").toLowerCase().trim();
      if (!query) {
        
      }

      const matches = products
        .filter(p =>
          String(p.name || "").toLowerCase().includes(query) ||
          String(p.path || "").toLowerCase().includes(query)
        )
        .slice(0, 30);

      if (!matches.length) {
        results.innerHTML = `<div class="empty">Niciun produs găsit.</div>`;
        return;
      }

      matches.forEach(p => {
        const b = document.createElement("button");
        b.className = "resultBtn";
        b.innerHTML = `
          <div class="resultTitle">${p.name}</div>
          <div class="muted small">${p.path || ""}</div>
        `;
        b.onclick = () => addProduct(p);
        results.appendChild(b);
      });
    }

    search.addEventListener("input", () => renderProductResults(search.value));

    btnSave.onclick = async () => {
      if (!editItems.length) {
        alert("Comanda nu poate fi goală.");
        return;
      }

      const payloadItems = editItems.map(it => ({
        id: it.id,
        name: it.name,
        gtin: it.gtin,
        qty: Number(it.qty || 1),
        price: it.price
      }));

      const res = await apiFetch(`/api/orders/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payloadItems })
      });

      const out = await res.json().catch(() => ({}));

      if (!res.ok || out.error) {
        alert(out.error || "Eroare la salvare.");
        return;
      }

      alert("Comanda a fost modificată ✅");
      localStorage.removeItem("editOrder");
      location.href = "orders.html";
    };

    renderMeta();
    renderItems();
    renderProductResults("");
}




  let scanStream = null;
  let scanTimer = null;

  function dbg(msg) {
    const box = document.getElementById("debugBox");
    if (!box) return;
    box.style.display = "block";
    box.innerHTML += `<div>${new Date().toLocaleTimeString()} • ${msg}</div>`;
    box.scrollTop = box.scrollHeight;
  }


  function closeScanner() {
    if (scanTimer) {
      clearInterval(scanTimer);
      scanTimer = null;
    }
    if (scanStream) {
      scanStream.getTracks().forEach(t => t.stop());
      scanStream = null;
    }

    const modal = document.getElementById("scannerModal");
    if (modal) modal.style.display = "none";

    const video = document.getElementById("scanVideo");
    if (video) video.srcObject = null;
  }

  async function startScanIntoInput(qrInputEl) {
    if (!window.isSecureContext) {
      alert("Camera merge doar pe HTTPS.");
      return;
    }

    const modal = document.getElementById("scannerModal");
    const video = document.getElementById("scanVideo");
    if (!modal || !video) return;

    // oprește sesiune veche
    closeScanner();

    // deschide modal
    modal.style.display = "block";

    video.muted = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.autoplay = true;

    // 1) pornește camera
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
    } catch (e) {
      console.warn("getUserMedia failed:", e);
      closeScanner();
      alert("Nu pot porni camera. Verifică permisiunile.");
      return;
    }

    video.srcObject = scanStream;

    await new Promise(resolve => {
      video.onloadedmetadata = () => resolve();
    });

    try { await video.play(); } catch (e) { console.warn("play failed", e); }

    // 2) detector: încearcă să includă DataMatrix + QR
    if (!("BarcodeDetector" in window)) {
      alert("BarcodeDetector nu e suportat pe acest browser.");
      return;
    }

    let formats = ["qr_code", "data_matrix"];

    // dacă browserul știe să ne spună ce suportă, filtrăm
    try {
      const supported = await BarcodeDetector.getSupportedFormats?.();
      if (Array.isArray(supported) && supported.length) {
        console.log("Supported formats:", supported);
        formats = formats.filter(f => supported.includes(f));
      }
    } catch {}

    if (!formats.length) {
      formats = ["qr_code"]; // fallback minim
    }

    let detector;
    try {
      detector = new BarcodeDetector({ formats });
    } catch (e) {
      console.warn("BarcodeDetector init failed:", e);
      detector = new BarcodeDetector();
    }

    // 3) loop detect
    scanTimer = setInterval(async () => {
    try {
      if (!video.videoWidth || !video.videoHeight) return;

      const codes = await detector.detect(video);
      if (codes && codes.length) {
        const raw = codes[0].rawValue || "";
        console.log("SCANNED RAW:", raw);

        if (!raw) return;

        const clean = sanitizeGS1(raw);
        console.log("SCANNED CLEAN:", clean);

        // 1️⃣ punem valoarea în input
        qrInputEl.value = clean;

        // 2️⃣ aplicăm parsing DIRECT (fără events)
        applyParsedGS1(clean);

        // 3️⃣ închidem scannerul
        closeScanner();
      }
    } catch (e) {
      console.warn("SCAN ERROR:", e);
    }
  }, 250);

  }

  async function startScanWithCallback(onScan) {
    if (!window.isSecureContext) {
      alert("Camera merge doar pe HTTPS.");
      return;
    }

    const modal = document.getElementById("scannerModal");
    const video = document.getElementById("scanVideo");
    if (!modal || !video) {
      alert("Lipsește scannerModal sau scanVideo din HTML.");
      return;
    }

    // oprește sesiune veche și deschide modalul
    closeScanner();
    modal.style.display = "block";

    video.muted = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.autoplay = true;

    try {
      scanStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
    } catch (e) {
      closeScanner();
      alert("Nu pot porni camera. Verifică permisiunile.");
      return;
    }

    video.srcObject = scanStream;

    await new Promise(resolve => {
      video.onloadedmetadata = () => resolve();
    });

    try { await video.play(); } catch {}

    if (!("BarcodeDetector" in window)) {
      alert("BarcodeDetector nu e suportat pe acest browser.");
      return;
    }

    let formats = ["qr_code", "data_matrix"];
    try {
      const supported = await BarcodeDetector.getSupportedFormats?.();
      if (Array.isArray(supported) && supported.length) {
        formats = formats.filter(f => supported.includes(f));
      }
    } catch {}

    if (!formats.length) formats = ["qr_code"];

    let detector;
    try { detector = new BarcodeDetector({ formats }); }
    catch { detector = new BarcodeDetector(); }

    scanTimer = setInterval(async () => {
      try {
        if (!video.videoWidth || !video.videoHeight) return;

        const codes = await detector.detect(video);
        if (!codes || !codes.length) return;

        const raw = codes[0].rawValue || "";
        if (!raw) return;

        const clean = sanitizeGS1(raw);
        const parsed = parseGS1(clean);

        // ✅ DEBUG AICI (acum parsed există)
        dbg("SCAN OK: gtin=" + (parsed.gtin || "-") + " lot=" + (parsed.lot || "-"));

        if (!parsed.gtin || !parsed.lot) return; // obligatoriu

        closeScanner();
        onScan(parsed);
      } catch (e) {
        dbg("SCAN ERROR: " + (e?.message || e));
        console.warn("SCAN ERROR:", e);
      }
    }, 250);
  }







async function initStockPage() {
  // Referințe DOM - toate declarate aici sus
  const list = document.getElementById("stockList");
  const qrInput = document.getElementById("qrInput");
  const btnScan = document.getElementById("btnScanQR");
  const btnClose = document.getElementById("btnCloseScan");
  
  // IMPORTANT: Verificăm dacă există aceste elemente
  const searchInput = document.getElementById("stockProductSearch");
const resultsBox = document.getElementById("stockProductResults");
  
  console.log("searchInput:", searchInput ? "gasit" : "lipsa");
  console.log("resultsBox:", resultsBox ? "gasit" : "lipsa");
  
  const lotInput = document.getElementById("stockLot");
  const expInput = document.getElementById("stockExpire");
  const qtyInput = document.getElementById("stockQty");
  const hiddenInput = document.getElementById("stockProduct");
  const selectedDisplay = document.getElementById("selectedProductDisplay");
  const selectedName = document.getElementById("selectedProductName");
  const productSelectOk = document.getElementById("productSelectOk");
  const warehouseSelect = document.getElementById("warehouseSelect");
  const locationGroup = document.getElementById("locationGroup");
  const locationSelect = document.getElementById("stockLocation");

  // Încărcăm produsele MAI ÎNTÂI
  let products = [];
  try {
    const res = await fetch("/api/products-flat");
    products = await res.json();
    console.log("Produse încărcate:", products.length);
  } catch (e) {
    console.error("Eroare încărcare produse:", e);
  }

  // Stare locală
  let selectedProduct = null;

  // ===== FUNCȚIE: Încărcare stoc pentru gestiune =====
  async function loadStockForWarehouse(warehouse) {
    if (!list) return;
    list.innerHTML = "<p class='hint'>Se încarcă stocul...</p>";
    
    try {
      const stock = await fetch(`/api/stock?warehouse=${warehouse}`).then(r => r.json());
      renderStockList(stock);
    } catch (e) {
      console.error("Eroare încărcare stoc:", e);
      list.innerHTML = "<p class='hint'>Eroare la încărcarea stocului</p>";
    }
  }

  // ===== FUNCȚIE: Render stoc =====
  function renderStockList(stock) {
    if (!list) return;
    list.innerHTML = "";

    if (!Array.isArray(stock) || !stock.length) {
      list.innerHTML = `<div class="stock-meta">Nu există stoc în această gestiune.</div>`;
      return;
    }

    stock.forEach(s => {
      const item = document.createElement("div");
      item.className = "stock-item";

      const left = document.createElement("div");
      left.style.minWidth = "0";

      const name = document.createElement("div");
      name.className = "stock-item-name";
      name.textContent = s.productName || "Produs";

      const meta = document.createElement("div");
      meta.className = "stock-item-meta";
      const locDisplay = s.warehouse === 'magazin' ? '🏪 Magazin' : `📍 ${s.location || 'A'}`;
      meta.innerHTML = `
        LOT: <b>${s.lot || "-"}</b><br>
        Expiră: <b>${(s.expiresAt || "-").slice(0,10)}</b><br>
        Locație: <b>${locDisplay}</b>
      `;

      left.appendChild(name);
      left.appendChild(meta);

      const qty = Number(s.qty || 0);
      const badge = document.createElement("div");
      badge.className = "stock-badge " + (qty >= 50 ? "ok" : "warn");
      badge.textContent = `${qty} buc`;

      item.appendChild(left);
      item.appendChild(badge);
      list.appendChild(item);
    });
  }

  // ===== FUNCȚIE: Selectare produs în formular =====
  function selectProduct(product) {
    selectedProduct = product;
    
    if (hiddenInput) {
      hiddenInput.value = product.id;
      hiddenInput.dataset.name = product.name;
      hiddenInput.dataset.gtins = JSON.stringify(product.gtins || []);
    }
    
    if (selectedName) selectedName.textContent = product.name;
    if (selectedDisplay) selectedDisplay.style.display = "flex";
    if (productSelectOk) productSelectOk.style.display = "flex";
    
    console.log("Produs selectat:", product.name);
  }

  // ===== INPUT 1: SCANARE QR GS1 =====
  if (qrInput) {
    let scanTimeout;
    
    const wrapper = qrInput.parentElement;
    if (wrapper && !document.getElementById('qrClearBtn')) {
      wrapper.style.position = 'relative';
      const clearBtn = document.createElement('button');
      clearBtn.id = 'qrClearBtn';
      clearBtn.type = 'button';
      clearBtn.innerHTML = '×';
      clearBtn.title = "Șterge tot";
      clearBtn.style.cssText = `
        position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
        background: rgba(100,100,100,0.2); border: none; color: var(--text);
        width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
        font-size: 20px; line-height: 1; display: none; align-items: center; justify-content: center;
        z-index: 10;
      `;
      
      clearBtn.onclick = () => {
        qrInput.value = '';
        clearBtn.style.display = 'none';
        resetForm();
      };
      wrapper.appendChild(clearBtn);
    }
    
    const clearBtn = document.getElementById('qrClearBtn');
    
    qrInput.addEventListener("input", () => {
      const value = qrInput.value.trim();
      if (clearBtn) clearBtn.style.display = value.length > 0 ? 'flex' : 'none';
      
      if (!value) return;
      
      clearTimeout(scanTimeout);
      scanTimeout = setTimeout(() => {
        processQRCode(value);
      }, 500);
    });
    
    function processQRCode(code) {
      const clean = sanitizeGS1(code);
      const parsed = parseGS1(clean);
      
      if (!parsed.gtin) {
        console.log("Nu am găsit GTIN valid în QR");
        return;
      }
      
      const scannedRaw = parsed.gtin;
      const scannedNorm = normalizeGTIN(parsed.gtin);
      
      const found = products.find(p => {
        const prodGtins = [p.gtin, ...(Array.isArray(p.gtins) ? p.gtins : [])].filter(Boolean);
        return prodGtins.some(g => {
          const gNorm = normalizeGTIN(g);
          return gNorm === scannedNorm || g === scannedRaw || g.includes(scannedRaw);
        });
      });
      
      if (found) {
        selectProduct(found);
        if (parsed.lot && lotInput) lotInput.value = parsed.lot;
        if (parsed.expiresAt && expInput) expInput.value = toDisplayDate(parsed.expiresAt);
        if (qtyInput) qtyInput.focus();
      } else {
        alert("Produsul cu GTIN " + scannedRaw + " nu există în baza de date.");
      }
    }
  }

  // ===== INPUT 2: CĂUTARE MANUALĂ (NUME sau GTIN cu/fără 0) =====
  if (searchInput && resultsBox) {
    console.log("Initializare cautare produs...");
    
    // Stiluri pentru dropdown dacă nu există în CSS
    resultsBox.style.cssText = `
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: var(--surface);
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 8px 8px;
      max-height: 300px;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    
    // Container relativ pentru poziționare
    const container = searchInput.parentElement;
    if (container) {
      container.style.position = 'relative';
    }
    
    let searchTimeout;
    
    searchInput.addEventListener("input", (e) => {
      const rawValue = e.target.value;
      const query = rawValue.toLowerCase().trim();
      
      console.log("Cautare:", query);
      
      // Golim rezultatele
      resultsBox.innerHTML = "";
      
      if (!query) {
        resultsBox.style.display = "none";
        return;
      }

      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        performSearch(query, rawValue);
      }, 300);
    });
    
    function performSearch(queryLower, rawQuery) {
      console.log("Perform search pentru:", queryLower);
      
      // Varianta fără leading zero
      const queryNoZero = queryLower.replace(/^0+/, '');
      
      const matches = products.filter(p => {
        // 1. Căutare după NUME (parțial, case insensitive)
        const nameMatch = p.name && p.name.toLowerCase().includes(queryLower);
        
        // 2. Căutare după GTIN principal (cu sau fără zero)
        let gtinMatch = false;
        if (p.gtin) {
          const gtinLower = p.gtin.toLowerCase();
          // Match direct (05900 conține 059)
          const directMatch = gtinLower.includes(queryLower);
          // Match fără zero (5900 === 5900)
          const normalizedMatch = p.gtin.replace(/^0+/, '').toLowerCase() === queryNoZero;
          // Match parțial fără zero (5900 conține 59)
          const partialNormalized = p.gtin.replace(/^0+/, '').toLowerCase().includes(queryNoZero);
          
          gtinMatch = directMatch || normalizedMatch || partialNormalized;
        }
        
        // 3. Căutare după GTIN secundare (array)
        let gtinsMatch = false;
        if (Array.isArray(p.gtins)) {
          gtinsMatch = p.gtins.some(g => {
            const gLower = g.toLowerCase();
            const direct = gLower.includes(queryLower);
            const normalized = g.replace(/^0+/, '').toLowerCase() === queryNoZero;
            const partialNorm = g.replace(/^0+/, '').toLowerCase().includes(queryNoZero);
            return direct || normalized || partialNorm;
          });
        }
        
        return nameMatch || gtinMatch || gtinsMatch;
      }).slice(0, 15); // Max 15 rezultate

      console.log("Rezultate gasite:", matches.length);

      if (matches.length === 0) {
        resultsBox.innerHTML = '<div style="padding: 12px; color: var(--text-muted); text-align: center;">Niciun produs găsit</div>';
        resultsBox.style.display = "block";
        return;
      }

      // Construim lista
      matches.forEach(product => {
        const item = document.createElement("div");
        item.style.cssText = `
          padding: 12px;
          border-bottom: 1px solid var(--border);
          cursor: pointer;
          hover: background-color: var(--hover);
        `;
        item.onmouseover = () => item.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
        item.onmouseout = () => item.style.backgroundColor = 'transparent';
        
        // Determinăm ce a făcut match pentru afișare
        let matchInfo = product.category || 'Produs';
        let displayGtin = product.gtin;
        
        // Dacă are GTIN-uri multiple, arătăm cel care a făcut match
        if (product.gtins && Array.isArray(product.gtins) && product.gtins.length > 0) {
          // Găsim GTIN-ul care a făcut match
          const matchedGtin = product.gtins.find(g => {
            const gLower = g.toLowerCase();
            const queryLower = rawQuery.toLowerCase();
            return gLower.includes(queryLower) || 
                   g.replace(/^0+/, '').toLowerCase().includes(queryLower.replace(/^0+/, ''));
          });
          if (matchedGtin) displayGtin = matchedGtin;
        }
        
        if (displayGtin) {
          matchInfo += ` • GTIN: ${displayGtin}`;
        }
        
        item.innerHTML = `
          <div style="font-weight: 600; color: var(--text);">${escapeHtml(product.name)}</div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">${escapeHtml(matchInfo)}</div>
        `;
        
        item.onclick = () => {
          console.log("Selectat:", product.name);
          selectProduct(product);
          searchInput.value = "";
          resultsBox.style.display = "none";
          if (lotInput) lotInput.focus();
        };
        
        resultsBox.appendChild(item);
      });

      resultsBox.style.display = "block";
    }

    // Închide dropdown când click în afară
    document.addEventListener("click", (e) => {
      if (!searchInput.contains(e.target) && !resultsBox.contains(e.target)) {
        resultsBox.style.display = "none";
      }
    });
    
    // Previne închiderea când click în input
    searchInput.addEventListener("click", (e) => {
      e.stopPropagation();
      if (searchInput.value.trim().length > 0) {
        resultsBox.style.display = "block";
      }
    });
  } else {
    console.error("Lipseste searchInput sau resultsBox!");
  }

  // ===== FUNCȚIE: Resetare formular =====
  function resetForm() {
    selectedProduct = null;
    if (hiddenInput) hiddenInput.value = '';
    if (selectedDisplay) selectedDisplay.style.display = 'none';
    if (productSelectOk) productSelectOk.style.display = 'none';
    if (lotInput) lotInput.value = '';
    if (expInput) expInput.value = '';
    if (qtyInput) qtyInput.value = '';
  }

  // ===== HANDLER: Schimbare gestiune =====
  if (warehouseSelect && locationGroup) {
    warehouseSelect.addEventListener("change", () => {
      if (warehouseSelect.value === 'magazin') {
        locationGroup.style.display = 'none';
        if (locationSelect) locationSelect.value = 'MAGAZIN';
      } else {
        locationGroup.style.display = 'block';
        if (locationSelect) locationSelect.value = 'A';
      }
      loadStockForWarehouse(warehouseSelect.value);
    });
  }

  // ===== HANDLER: Buton Scanare Camera =====
  if (btnScan && qrInput) {
    btnScan.onclick = async () => {
      try {
        await startScanIntoInput(qrInput);
      } catch (e) {
        closeScanner();
        alert("Nu pot porni camera. Verifică permisiunile.");
      }
    };
  }
  
  if (btnClose) btnClose.onclick = closeScanner;

  // ===== HANDLER: Adaugă în stoc =====
  const btnAdd = document.getElementById("btnAddStock");
  if (btnAdd) {
    btnAdd.onclick = async () => {
      if (!selectedProduct) {
        alert("Selectează un produs mai întâi!");
        return;
      }
      
      const warehouse = warehouseSelect ? warehouseSelect.value : 'depozit';
      const location = warehouse === 'magazin' ? 'MAGAZIN' : (locationSelect ? locationSelect.value : 'A');
      
      const lot = lotInput?.value.trim();
      const expiresAt = fromDisplayDate(expInput?.value);
      const qty = qtyInput?.value;

      if (!lot || !expiresAt || !qty) {
        alert("Completează toate câmpurile (LOT, Data expirare, Cantitate)");
        return;
      }

      const gtins = selectedProduct.gtins || [];
      const gtin = gtins[0] || selectedProduct.gtin || "";

      try {
        await fetch("/api/stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gtin,
            productName: selectedProduct.name,
            lot,
            expiresAt,
            qty: Number(qty),
            location,
            warehouse
          })
        });

        loadStockForWarehouse(warehouse);
        resetForm();
        if (qrInput) qrInput.value = '';
        const clearBtn = document.getElementById('qrClearBtn');
        if (clearBtn) clearBtn.style.display = 'none';
        
      } catch (e) {
        alert("Eroare la salvare");
        console.error(e);
      }
    };
  }

  // Inițializare
  loadStockForWarehouse('depozit');
  
  document.querySelectorAll('select').forEach(s => { s.size = 1; });
}
  const grouped = {};
  async function initInventoryPage() {
    const list = document.getElementById("inventoryList");
    const btnRefresh = document.getElementById("btnRefreshStock");

    if (!list) return;

   async function loadStock() {
  const res = await fetch('/api/stock?warehouse=depozit');  // ✅ Doar depozit
  const data = await res.json();
  
  stockMap = {};
  data.forEach(item => {
    // ✅ Verificare dublă: doar depozit
    if (item.warehouse === 'depozit' || !item.warehouse) {
      stockMap[item.gtin] = (stockMap[item.gtin] || 0) + item.qty;
    }
  });
}

    if (btnRefresh) btnRefresh.onclick = loadStock;
    loadStock();
  }



function parseExcelDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  // Încearcă DD/MM/YYYY
  const parts = String(val).split(/[\/\-\.]/);
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return val;
}

function parseExcelNumber(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  // Format american: 5,210.00 -> 5210.00
  return parseFloat(String(val).replace(/,/g, '')) || 0;
}




 



  function getProductPrice(product, client) {
    const base = Number(product.price || 0);

    if (!client || !client.prices) return base;

    const key = String(product.id);        // ✅ important: cheie string
    const sp = client.prices[key];

    if (sp === undefined || sp === null || sp === "") return base;

    return Number(sp);
  }


 function addToCart(product) {
  const cart = getCart();
  const client = getSelectedClient();

  const price = getProductPrice(product, client);
  const isSpecial = client?.prices && client.prices[String(product.id)] != null;

  // GTIN principal (primul din gtins sau fallback pe gtin vechi)
  const primaryGTIN =
    (Array.isArray(product.gtins) && product.gtins.length)
      ? product.gtins[0]
      : (product.gtin || "");

  const g = normalizeGTIN(primaryGTIN);
  const found = cart.find(p => normalizeGTIN(p.gtin) === g);

  if (found) {
    found.qty++;
  } else {
    cart.push({
      id: product.id,
      gtin: primaryGTIN,
      gtins: product.gtins || [],  // ← Adaugă toate GTIN-urile
      name: product.name,
      qty: 1,
      price,
      isSpecial: client?.prices?.[String(product.id)] != null
    });
  }

  saveCart(cart);
  renderCart();
}

  const orderItemsMap = {};



  // ================= THEME =================
  function applyTheme(theme) {
    if (theme === "dark") {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
  }
  // ================= PICKING ORDER =================
  let pickState = null; // persist între rerender-uri

  function loadPickState() {
    try { return JSON.parse(localStorage.getItem("pickState")) || {}; }
    catch { return {}; }
  }
  function savePickState() {
    localStorage.setItem("pickState", JSON.stringify(pickState || {}));
  }

  // ===== PICK MODAL STATE =====
  let pickModalState = null;

  function openPickModal(state) {
    pickModalState = state;

    const modal = document.getElementById("pickModal");
    const btnClose = document.getElementById("pickModalClose");
    const btnCancel = document.getElementById("pickModalBtnCancel");
    const btnAdd = document.getElementById("pickModalBtnAdd");
    const btnReplace = document.getElementById("pickModalBtnReplaceLot");

    const elProd = document.getElementById("pickModalProduct");
    const elGtin = document.getElementById("pickModalGtin");
    const elScannedLot = document.getElementById("pickModalScannedLot");
    const elPlannedRow = document.getElementById("pickModalPlannedRow");
    const elPlannedLot = document.getElementById("pickModalPlannedLot");
    const elQty = document.getElementById("pickModalQty");
    const elHint = document.getElementById("pickModalHint");
    const elTitle = document.getElementById("pickModalTitle");
    const elLoc = document.getElementById("pickModalLocation");
  const elRemOrder = document.getElementById("pickModalRemainingOrder");


    if (!modal) return;

    elTitle.textContent = state.mode === "replace" ? "LOT diferit" : "Picking";
    elProd.textContent = state.item?.name || "—";
    elGtin.textContent = state.item?.gtin || "—";
    elScannedLot.textContent = state.scannedLot || "—";
    elLoc.textContent = state.location || "—";
  elRemOrder.textContent =
    Number.isFinite(state.remainingOrder)
      ? `${state.remainingOrder} buc`
      : "—";


    elQty.value = String(state.defaultQty || 1);

    if (state.mode === "replace") {
      elPlannedRow.style.display = "";
      elPlannedLot.textContent = state.oldLot || "—";
      btnReplace.style.display = "";
      btnAdd.style.display = "none";
      elHint.textContent = "Ai scanat un lot diferit. Poți actualiza lotul din comandă pe cantitatea introdusă.";
    } else {
      elPlannedRow.style.display = "none";
      btnReplace.style.display = "none";
      btnAdd.style.display = "";
      elHint.textContent = state.hint || "";
    }

    // handlers
    const close = () => closePickModal();

    btnClose.onclick = close;
    btnCancel.onclick = close;

    // click pe fundal -> închide
    modal.onclick = (e) => {
      if (e.target === modal) close();
    };

    modal.style.display = "flex";

    setTimeout(() => elQty.focus(), 50);
  }

  function closePickModal() {
    const modal = document.getElementById("pickModal");
    if (modal) modal.style.display = "none";
    pickModalState = null;
  }

  function getPickModalQty() {
    const elQty = document.getElementById("pickModalQty");
    const v = parseInt(elQty?.value || "0", 10);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return v;
  }


  // ✅ FULL + CORECT
  async function initPickingOrderPage() {
    const list = document.getElementById("pickingList");
    const info = document.getElementById("pickingInfo");
    const btnScan = document.getElementById("btnScanPick");
    const btnFinish = document.getElementById("btnFinishPick");
    const btnClose = document.getElementById("btnCloseScan");

    if (!list || !info) return;

    if (btnClose) btnClose.onclick = closeScanner;
      // 🔵 SCANNER 2D ANDROID - Mod tastatură
  const scannerInput = document.getElementById("scanner2DInput");
  const scannerFeedback = document.getElementById("scannerFeedback");
  
  if (scannerInput) {
    let scanBuffer = "";
    let lastKeyTime = 0;
    
    // Focus automat pe input când se încarcă pagina
    scannerInput.focus();
    
    // Refocus dacă utilizatorul click în altă parte
    document.addEventListener("click", (e) => {
      if (!e.target.closest("button") && !e.target.closest("input")) {
        scannerInput.focus();
      }
    });
    
    scannerInput.addEventListener("keydown", async (e) => {
      const now = Date.now();
      
      // Dacă a trecut mai mult de 100ms între taste, reset buffer (e om, nu scanner)
      if (now - lastKeyTime > 100) {
        scanBuffer = "";
      }
      lastKeyTime = now;
      
      // Enter = sfârșit scanare
      if (e.key === "Enter") {
        e.preventDefault();
        const code = scannerInput.value.trim() || scanBuffer;
        
        if (code.length > 5) { // Minim 5 caractere pentru validitate
          scannerFeedback.style.display = "block";
          scannerFeedback.textContent = "⌛ Procesez scanare...";
          
          try {
            // Procesăm codul exact ca la camera
            const clean = sanitizeGS1(code);
            const parsed = parseGS1(clean);
            
            if (!parsed.gtin || !parsed.lot) {
              scannerFeedback.style.color = "#ef4444";
              scannerFeedback.textContent = "❌ Cod invalid (lipsește GTIN sau LOT)";
              setTimeout(() => {
                scannerFeedback.style.display = "none";
                scannerFeedback.style.color = "#10b981";
              }, 2000);
            } else {
              // Folosim aceeași logică ca pentru camera
              await handlePickingScan(order, parsed, gtinToPrimary, stockLotInfo);
              scannerFeedback.textContent = "✅ Cod procesat cu succes";
              setTimeout(() => {
                scannerFeedback.style.display = "none";
              }, 1500);
            }
          } catch (err) {
            console.error("Scanner error:", err);
            scannerFeedback.style.color = "#ef4444";
            scannerFeedback.textContent = "❌ Eroare procesare cod";
            setTimeout(() => {
              scannerFeedback.style.display = "none";
              scannerFeedback.style.color = "#10b981";
            }, 2000);
          }
        }
        
        // Reset pentru următoarea scanare
        scannerInput.value = "";
        scanBuffer = "";
      } else {
        // Acumulăm în buffer pentru siguranță
        scanBuffer += e.key;
      }
    });
    
    // Suport pentru paste (unele scanere pastează)
    scannerInput.addEventListener("paste", async (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text').trim();
      if (text) {
        scannerInput.value = text;
        scannerInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      }
    });
  }

    // încarcă progresul
    if (!pickState) pickState = loadPickState();

    // 1) ia comanda
    const order = JSON.parse(localStorage.getItem("pickingOrder"));
    if (!order) {
      alert("Nu există comandă selectată.");
      location.href = "orders.html";
      return;
    }

    // 2) ia produsele ca să facem map GTIN secundar -> GTIN principal
    const products = await apiFetch("/api/products-flat").then(r => r.json());
    // 3) luăm stocul ca să știm locația lotului scanat (A/B/C/R1...)
  const stock = await apiFetch("/api/stock").then(r => r.json());

  // map: "primaryGtin|lot" -> { bestLoc, totalQty }
  const stockLotInfo = {};
  stock.forEach(s => {
    const g = normalizeGTIN(s.gtin);
    const lot = String(s.lot || "").trim();
    if (!g || !lot) return;

    const key = `${g}|${lot}`;
    const qty = Number(s.qty || 0);
    const loc = String(s.location || "A");

    if (!stockLotInfo[key]) {
      stockLotInfo[key] = { bestLoc: loc, totalQty: 0 };
    }

    stockLotInfo[key].totalQty += qty;

    // alegem "bestLoc" (cel mai bun raft)
    const order = ["A","B","C","R1","R2","R3"];
    const rank = (x) => {
      const i = order.indexOf(String(x || "").toUpperCase());
      return i === -1 ? 999 : i;
    };

    if (rank(loc) < rank(stockLotInfo[key].bestLoc)) {
      stockLotInfo[key].bestLoc = loc;
    }
  });


    // map: normalized_gtin (oricare) -> normalized_primary_gtin (primul din gtins)
  // map: normalized_gtin (oricare) -> normalized_primary_gtin
  const gtinToPrimary = {};

  products.forEach(p => {
    const primaryRaw =
      (Array.isArray(p.gtins) && p.gtins.length) ? p.gtins[0] : (p.gtin || "");

    const primary = normalizeGTIN(primaryRaw);

    // IMPORTANT: includem și gtin-ul vechi + toate gtins
  const all = []
    .concat(p.gtin ? [p.gtin] : [])
    .concat(Array.isArray(p.gtins) ? p.gtins : [])
    .filter(Boolean);


    all.forEach(g => {
      const ng = normalizeGTIN(g);
      if (ng && primary) gtinToPrimary[ng] = primary;
    });
  });


    // info sus
    info.innerHTML = `
      <strong>${order.client?.name || ""}</strong><br>
      ${new Date(order.createdAt).toLocaleString()}
    `;

    // 3) render listă
    list.innerHTML = "";

    (order.items || []).forEach(item => {
      const row = document.createElement("div");
      row.className = "pick-row";

      // item.gtin = GTIN principal salvat pe comandă
      const primaryGtin = normalizeGTIN(item.gtin);
      pickState[primaryGtin] = pickState[primaryGtin] || {};

      const totalPicked = Object.values(pickState[primaryGtin])
        .reduce((s, n) => s + Number(n || 0), 0);

      if (totalPicked >= Number(item.qty || 0)) row.classList.add("ok");

      const allocationsHtml = Array.isArray(item.allocations)
        ? item.allocations.map(a => `
            <div class="pick-lot">
              LOT ${a.lot} (${a.location || "-"}) → ${a.qty}
            </div>
          `).join("")
        : `<div class="pick-lot">Fără allocations pe comandă</div>`;

      row.innerHTML = `
    <div class="pick-title">${item.name} × ${item.qty}</div>

    <div class="pick-hint">
      GTIN comandă: <small>${item.gtin || "—"}</small>
    </div>

    ${allocationsHtml}
  `;


      list.appendChild(row);
    });

    // 4) Scan button (acceptă GTIN secundar!)
    if (btnScan) {
    btnScan.onclick = async () => {
    await startScanWithCallback((parsed) => {
      // NU rerandăm aici!
      // handlePickingScan deschide modalul și butoanele din modal fac update + rerender.
      handlePickingScan(order, parsed, gtinToPrimary, stockLotInfo);
    });
  };

    }

    // 5) Finish button
  if (btnFinish) {
    btnFinish.onclick = async () => {
      const missing = [];

      (order.items || []).forEach(item => {
        const primaryGtin = normalizeGTIN(item.gtin);
        const picked = Object.values(pickState?.[primaryGtin] || {})
          .reduce((s, n) => s + Number(n || 0), 0);

        const need = Number(item.qty || 0);
        if (picked < need) missing.push(`${item.name}: lipsă ${need - picked}`);
      });

      if (missing.length) {
        alert("Comanda nu este completă:\n\n" + missing.join("\n"));
        return;
      }

      // ✅ SCHIMBĂ STATUSUL ÎN "gata_de_livrare"
      const res = await apiFetch(`/api/orders/${order.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "gata_de_livrare" })
      });

      if (!res.ok) {
        alert("Eroare la schimbarea statusului comenzii.");
        return;
      }

      alert("Comanda este pregătită și gata de livrare 🚚");

      // curățăm picking state
      localStorage.removeItem("pickState");

      // ne întoarcem la lista de comenzi
      location.href = "orders.html";
    };
  }
  }


  // ✅ MODIFICAT: folosește map-ul gtinToPrimary ca să accepte ambele GTIN-uri
  async function handlePickingScan(order, parsed, gtinToPrimary, stockLotInfo) {
    dbg("handlePickingScan start");
  dbg("gtin raw=" + parsed.gtin + " lot=" + parsed.lot);

    const scannedGtin = normalizeGTIN(parsed.gtin);
    const scannedLot = String(parsed.lot || "").trim();

    if (!scannedGtin || !scannedLot) {
      alert("Cod invalid: lipsește GTIN sau LOT.");
      return;
    }

    // map GTIN scanat -> GTIN principal (primul din gtins)
    const primaryGtin = gtinToPrimary?.[scannedGtin] || scannedGtin;

    const item = (order.items || []).find(i => normalizeGTIN(i.gtin) === primaryGtin);
    if (!item) {
      alert("Produsul scanat nu există în această comandă.");
      return;
    }
    dbg("found item: " + item.name);


    // calcul rămas TOTAL pe produs în comandă
    pickState[primaryGtin] = pickState[primaryGtin] || {};
    const pickedTotal = Object.values(pickState[primaryGtin]).reduce((s, n) => s + Number(n || 0), 0);
    const needTotal = Number(item.qty || 0);
    const remainingOrder = Math.max(0, needTotal - pickedTotal);

    // locație lot scanat (din allocations dacă există, altfel din stoc)
    const allocSameLot = (item.allocations || []).find(a => String(a.lot) === scannedLot);
    const locationFromAlloc = allocSameLot?.location || "";
    const stockKey = `${primaryGtin}|${scannedLot}`;
    const locationFromStock = stockLotInfo?.[stockKey]?.bestLoc || "";
    const scannedLocation = locationFromAlloc || locationFromStock || "—";

    // dacă LOT există în allocations -> modal "Adaugă"
    if (allocSameLot) {
      const already = Number(pickState[primaryGtin][scannedLot] || 0);
      const planned = Number(allocSameLot.qty || 0);
      const remainingLot = Math.max(0, planned - already);

      openPickModal({
        mode: "add",
        order,
        item,
        primaryGtin,
        scannedLot,
        location: scannedLocation,
        remainingOrder,
        defaultQty: Math.max(1, Math.min(remainingLot || 1, remainingOrder || 1)),
        hint: `Rămas pe LOT ${scannedLot}: ${remainingLot} buc`
      });

      const btnAdd = document.getElementById("pickModalBtnAdd");
      btnAdd.onclick = () => {
        const qty = getPickModalQty();
        if (!qty) return;

        const remainingLot2 = Math.max(0, planned - already);
        const remainingOrder2 = Math.max(0, needTotal - pickedTotal);

        if (remainingLot2 <= 0) {
          alert("Lotul acesta este deja complet pentru această comandă.");
          closePickModal();
          return;
        }
        if (remainingOrder2 <= 0) {
          alert("Produsul este deja complet pe comandă.");
          closePickModal();
          return;
        }

        const toAdd = Math.min(qty, remainingLot2, remainingOrder2);
        pickState[primaryGtin][scannedLot] = already + toAdd;

        savePickState();
        closePickModal();
        initPickingOrderPage();
      };

      return;
    }

    // LOT diferit -> modal "Actualizează LOT"
    const oldLot = String(item.allocations?.[0]?.lot || "").trim();

    openPickModal({
      mode: "replace",
      order,
      item,
      primaryGtin,
      scannedLot,
      oldLot,
      location: scannedLocation,
      remainingOrder,
      defaultQty: Math.max(1, remainingOrder || 1)
    });

    const btnReplace = document.getElementById("pickModalBtnReplaceLot");
    btnReplace.onclick = async () => {
      const qty = getPickModalQty();
      if (!qty) return;

      // nu permite peste rămas total pe produs
      if (remainingOrder <= 0) {
        alert("Produsul este deja complet pe comandă.");
        return;
      }

      const qtyFinal = Math.min(qty, remainingOrder);

      closePickModal();

      const res = await apiFetch(`/api/orders/${order.id}/replace-lot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gtin: item.gtin,
          oldLot,
          newLot: scannedLot,
          qty: qtyFinal
        })
      });

     const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // ✅ NOU: Mesaj special pentru cont în așteptare
        if (res.status === 403 && data.pending) {
          msg.textContent = "⏳ Contul tău este în așteptarea aprobării. Contactează administratorul.";
          msg.style.color = "#f59e0b"; // galben
          return;
        }
        msg.textContent = data.error || "Eroare la login";
        msg.style.color = "#ef4444"; // roșu
        return;
      }

  localStorage.setItem("pickingOrder", JSON.stringify(data.order));

  /* ✅ FOARTE IMPORTANT
    Marcam cantitatea ca PICK-uita,
    altfel produsul nu se înverzește
    și Finalizează zice că lipsește
  */
  pickState[primaryGtin] = pickState[primaryGtin] || {};
  pickState[primaryGtin][scannedLot] =
    Number(pickState[primaryGtin][scannedLot] || 0) + qtyFinal;

  savePickState();

  alert("LOT actualizat ✅ și cantitatea a fost marcată ca pregătită");

  await initPickingOrderPage();
    }
  }

 async function initCheckStockPage() {
  if (!location.pathname.endsWith("checkstock.html")) return;

  const list = document.getElementById("inventoryList");
  const searchInput = document.getElementById("stockSearch");
  const refreshBtn = document.getElementById("btnRefreshStock");
  const totalCountEl = document.getElementById("totalCount");
  const tabs = document.querySelectorAll('.tab-btn');
  const alertsContainer = document.getElementById('alertsContainer');
  
  let currentWarehouse = 'depozit';
  let allStock = [];

  // Funcție escape HTML
  const esc = (s) => String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  // Grupare stoc după produs
  function groupStockByProduct(stock) {
    const map = new Map();
    
    (stock || []).forEach((s) => {
      const key = `${s.productName}|||${s.gtin}`;
      if (!map.has(key)) {
        map.set(key, {
          productName: s.productName,
          gtin: s.gtin,
          totalQty: 0,
          lots: []
        });
      }
      const g = map.get(key);
      g.totalQty += Number(s.qty || 0);
      g.lots.push(s);
    });
    
    return [...map.values()];
  }

  // Render alerte stoc mic
  function renderAlerts(depozitStock, magazinStock) {
    const alerts = [];
    const LOW_LIMIT = 30;
    
    const depozitLow = depozitStock.filter(s => Number(s.qty) < LOW_LIMIT);
    const magazinLow = magazinStock.filter(s => Number(s.qty) < LOW_LIMIT);
    
    if (depozitLow.length) {
      alerts.push(`⚠️ Depozit: ${depozitLow.length} produse cu stoc sub ${LOW_LIMIT} buc`);
    }
    if (magazinLow.length) {
      alerts.push(`⚠️ Magazin: ${magazinLow.length} produse cu stoc sub ${LOW_LIMIT} buc`);
    }
    
    alertsContainer.innerHTML = alerts.length 
      ? alerts.map(a => `<div class="alert-box">${esc(a)}</div>`).join('')
      : '';
  }

  // Render card produs (pentru Total)
  function renderProductCard(group, showWarehouse = false) {
    const card = document.createElement("div");
    card.className = "csProdCard";
    
    const isLow = group.totalQty < 30;
    
    let lotsHtml = '';
    group.lots.forEach(lot => {
      const locDisplay = lot.warehouse === 'magazin' 
        ? '🏪 Magazin' 
        : `📍 ${lot.location || 'A'}`;
      
      lotsHtml += `
        <div class="csLotRow">
          <div class="csLotGrid">
            <div class="csField">
              <div class="csLbl">LOT</div>
              <div class="csInp">${esc(lot.lot)}</div>
            </div>
            <div class="csField">
              <div class="csLbl">EXP</div>
              <div class="csInp">${esc((lot.expiresAt || "").slice(0,10))}</div>
            </div>
            <div class="csField">
              <div class="csLbl">CANTITATE</div>
              <div class="csInp">${lot.qty} buc</div>
            </div>
            <div class="csField">
              <div class="csLbl">LOC</div>
              <div class="csInp">${locDisplay}</div>
            </div>
          </div>
        </div>
      `;
    });
    
    card.innerHTML = `
      <div class="csProdTop">
        <div class="csProdLeft">
          <div class="csIcon">🗂️</div>
          <div class="csName">${esc(group.productName)}</div>
        </div>
        <div class="csQtyBadge ${isLow ? 'qty-red' : 'qty-green'}">
          ${group.totalQty} buc
        </div>
      </div>
      <div class="csLots">
        ${lotsHtml}
      </div>
    `;
    
    return card;
  }

  // Render pentru Depozit sau Magazin (separat)
  function renderWarehouseStock(stock, warehouse) {
    list.innerHTML = '';
    
    const header = document.createElement("div");
    header.className = "warehouse-header";
    header.innerHTML = `<span class="warehouse-icon">${warehouse === 'depozit' ? '🏭' : '🏪'}</span><h2>${warehouse === 'depozit' ? 'Depozit' : 'Magazin'}</h2>`;
    list.appendChild(header);
    
    if (!stock.length) {
      list.innerHTML += `<p class="hint">Nu există stoc în ${warehouse}.</p>`;
      return;
    }
    
    const groups = groupStockByProduct(stock);
    
    groups.forEach(group => {
      const card = renderProductCard(group, false);
      list.appendChild(card);
    });
    
    // Update total
    const total = stock.reduce((sum, s) => sum + Number(s.qty || 0), 0);
    if (totalCountEl) totalCountEl.textContent = total;
  }

  // Render Total General (ambele gestiuni)
  function renderTotalStock(allStockData) {
    list.innerHTML = '';
    
    const header = document.createElement("div");
    header.className = "warehouse-header";
    header.innerHTML = `<span class="warehouse-icon">📊</span><h2>Total General (Depozit + Magazin)</h2>`;
    list.appendChild(header);
    
    if (!allStockData.length) {
      list.innerHTML += `<p class="hint">Nu există stoc.</p>`;
      return;
    }
    
    const groups = groupStockByProduct(allStockData);
    
    groups.forEach(group => {
      const card = document.createElement("div");
      card.className = "csProdCard";
      
      const isLow = group.totalQty < 30;
      
      // Separăm pe gestiuni
      const depozitLots = group.lots.filter(l => l.warehouse === 'depozit' || !l.warehouse);
      const magazinLots = group.lots.filter(l => l.warehouse === 'magazin');
      
      let lotsHtml = '';
      
      if (depozitLots.length) {
        lotsHtml += `<div style="font-size: 0.75rem; color: var(--text-muted); margin: 8px 0 4px; font-weight: 700;">🏭 DEPOSIT</div>`;
        depozitLots.forEach(lot => {
          lotsHtml += `
            <div class="csLotRow">
              <div class="csLotGrid">
                <div class="csField"><div class="csLbl">LOT</div><div class="csInp">${esc(lot.lot)}</div></div>
                <div class="csField"><div class="csLbl">EXP</div><div class="csInp">${esc((lot.expiresAt || "").slice(0,10))}</div></div>
                <div class="csField"><div class="csLbl">QTY</div><div class="csInp">${lot.qty}</div></div>
                <div class="csField"><div class="csLbl">LOC</div><div class="csInp">📍 ${esc(lot.location || 'A')}</div></div>
              </div>
            </div>
          `;
        });
      }
      
      if (magazinLots.length) {
        lotsHtml += `<div style="font-size: 0.75rem; color: var(--text-muted); margin: 8px 0 4px; font-weight: 700;">🏪 MAGAZIN</div>`;
        magazinLots.forEach(lot => {
          lotsHtml += `
            <div class="csLotRow">
              <div class="csLotGrid">
                <div class="csField"><div class="csLbl">LOT</div><div class="csInp">${esc(lot.lot)}</div></div>
                <div class="csField"><div class="csLbl">EXP</div><div class="csInp">${esc((lot.expiresAt || "").slice(0,10))}</div></div>
                <div class="csField"><div class="csLbl">QTY</div><div class="csInp">${lot.qty}</div></div>
                <div class="csField"><div class="csLbl">LOC</div><div class="csInp">🏪 Magazin</div></div>
              </div>
            </div>
          `;
        });
      }
      
      card.innerHTML = `
        <div class="csProdTop">
          <div class="csProdLeft">
            <div class="csIcon">🗂️</div>
            <div class="csName">${esc(group.productName)}</div>
          </div>
          <div class="csQtyBadge ${isLow ? 'qty-red' : 'qty-green'}">
            ${group.totalQty} buc
          </div>
        </div>
        <div class="csLots">${lotsHtml}</div>
      `;
      
      list.appendChild(card);
    });
    
    // Total general
    const total = allStockData.reduce((sum, s) => sum + Number(s.qty || 0), 0);
    if (totalCountEl) totalCountEl.textContent = total;
  }

  // Filtrare după search
  function filterAndRender() {
    const q = (searchInput?.value || "").toLowerCase().trim();
    
    let filtered = allStock;
    if (q) {
      filtered = allStock.filter(s => 
        (s.productName || "").toLowerCase().includes(q) ||
        (s.lot || "").toLowerCase().includes(q) ||
        (s.location || "").toLowerCase().includes(q) ||
        (s.gtin || "").includes(q)
      );
    }
    
    if (currentWarehouse === 'total') {
      renderTotalStock(filtered);
    } else {
      const warehouseFiltered = filtered.filter(s => 
        currentWarehouse === 'depozit' 
          ? (s.warehouse === 'depozit' || !s.warehouse)
          : s.warehouse === 'magazin'
      );
      renderWarehouseStock(warehouseFiltered, currentWarehouse);
    }
  }

  // Încărcare date
  async function loadAllStock() {
    if (list) list.innerHTML = "<p class='hint'>Se încarcă stocul...</p>";
    
    try {
      const [depozitRes, magazinRes] = await Promise.all([
        fetch('/api/stock?warehouse=depozit'),
        fetch('/api/stock?warehouse=magazin')
      ]);
      
      const depozitStock = await depozitRes.json();
      const magazinStock = await magazinRes.json();
      
      allStock = [
        ...depozitStock.map(s => ({...s, warehouse: s.warehouse || 'depozit'})),
        ...magazinStock.map(s => ({...s, warehouse: 'magazin'}))
      ];
      
      // Update badges
      const depozitTotal = depozitStock.reduce((sum, s) => sum + Number(s.qty || 0), 0);
      const magazinTotal = magazinStock.reduce((sum, s) => sum + Number(s.qty || 0), 0);
      
      document.getElementById('badge-depozit').textContent = depozitTotal;
      document.getElementById('badge-magazin').textContent = magazinTotal;
      
      renderAlerts(depozitStock, magazinStock);
      filterAndRender();
      
    } catch (e) {
      console.error("Eroare încărcare stoc:", e);
      if (list) list.innerHTML = "<p class='hint'>Eroare la încărcarea stocului.</p>";
    }
  }

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentWarehouse = tab.dataset.warehouse;
      filterAndRender();
    });
  });

  // Search handler
  if (searchInput) {
    searchInput.addEventListener("input", filterAndRender);
  }

  // Refresh
  if (refreshBtn) {
    refreshBtn.onclick = loadAllStock;
  }

  // Load inițial
  await loadAllStock();
}
// ================= MODAL PRODUS - CORECTAT =================
let currentModalProduct = null;
const VAT_RATE = 0.19;


function openProductModal(product) {
  currentModalProduct = product;
  
  // ✅ COLECTĂM TOATE GTIN-URILE POSIBILE DIN PRODUS
  const allGtins = [];
  
  // Adăugăm gtin (coloana single)
  if (product.gtin) {
    allGtins.push(product.gtin.toString());
  }
  
  // Adăugăm toate gtins din array
  if (product.gtins && Array.isArray(product.gtins)) {
    product.gtins.forEach(g => {
      if (g) allGtins.push(g.toString());
    });
  }
  
  // Eliminăm duplicatele
  const uniqueGtins = [...new Set(allGtins)];
  
  console.log('Toate GTIN-urile produsului:', uniqueGtins);
  
  // ✅ CĂUTĂM STOCUL PENTRU FIECARE GTIN PÂNĂ GĂSIM UNUL CU STOC
  let foundStock = null;
  let usedGtin = null;
  let totalStock = 0;
  let depozitStock = 0;
  let magazinStock = 0;
  
  for (const gtin of uniqueGtins) {
    const normalized = normalizeGTIN(gtin);
    
    // Încercăm mai multe formate
    const variations = [
      normalized,
      gtin.toString().padStart(14, '0'),
      gtin.toString().replace(/^0+/, ''),
      gtin.toString()
    ];
    
    for (const variant of variations) {
      const dStock = window.stockMapDepozit?.[variant] || 0;
      const mStock = window.stockMapMagazin?.[variant] || 0;
      
      if (dStock > 0 || mStock > 0) {
        depozitStock = dStock;
        magazinStock = mStock;
        totalStock = dStock + mStock;
        usedGtin = gtin;
        foundStock = { depozit: dStock, magazin: mStock, total: totalStock };
        console.log(`✅ Găsit stoc pentru GTIN ${gtin} (varianta: ${variant}):`, foundStock);
        break;
      }
    }
    
    if (foundStock) break;
  }
  
  // Dacă nu am găsit stoc pentru niciun GTIN, luăm primul pentru afișare
  const displayGtin = usedGtin || uniqueGtins[0] || '-';
  
  console.log('GTIN folosit pentru afișare:', displayGtin);
  console.log('Stoc final:', { totalStock, depozitStock, magazinStock });
  
  // UI elements
  const nameEl = document.getElementById('modalProductName');
  const gtinEl = document.getElementById('modalProductGtin');
  const unitPriceEl = document.getElementById('modalUnitPrice');
  const stockEl = document.getElementById('modalStock');
  const modal = document.getElementById('addProductModal');
  
  if (!modal) {
    console.error("Lipseste elementul #addProductModal");
    return;
  }
  
  if (nameEl) nameEl.textContent = product?.name || 'Produs';
  if (gtinEl) gtinEl.textContent = 'GTIN: ' + displayGtin;
  
  const unitPrice = Number(product?.price || 0);
  if (unitPriceEl) unitPriceEl.textContent = unitPrice.toFixed(2) + ' RON / buc';
  
  // ✅ Afișare stoc
  if (stockEl) {
    if (totalStock > 0) {
      let stockText = `Stoc disponibil: <strong>${totalStock} buc</strong>`;
      
      if (depozitStock > 0 && magazinStock > 0) {
        stockText += `<br><small style="font-size: 0.85rem; opacity: 0.8;">(Depozit: ${depozitStock}, Magazin: ${magazinStock})</small>`;
      } else if (magazinStock > 0 && depozitStock === 0) {
        stockText += `<br><small style="font-size: 0.85rem; color: #fbbf24;">(Doar în Magazin: ${magazinStock})</small>`;
      } else if (depozitStock > 0) {
        stockText += `<br><small style="font-size: 0.85rem; opacity: 0.8;">(Depozit: ${depozitStock})</small>`;
      }
      
      stockEl.innerHTML = stockText;
      stockEl.style.color = totalStock > 10 ? '#22c55e' : '#fbbf24';
    } else {
      stockEl.innerHTML = `Stoc disponibil: <strong>0 buc</strong>`;
      stockEl.style.color = '#ef4444';
    }
  }
  
  // Setăm cantitatea default
  const qtyInput = document.getElementById('modalQty');
  if (qtyInput) {
    qtyInput.value = '1';
    qtyInput.focus();
  }
  
  // Calculăm prețurile inițiale
  calculateModalPrices();
  
  // Afișăm modalul
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
}

function calculateModalPrices() {
  if (!currentModalProduct) return;
  
  const qtyInput = document.getElementById('modalQty');
  const withVatEl = document.getElementById('modalPriceWithVat');
  const noVatEl = document.getElementById('modalPriceNoVat');
  
  if (!qtyInput) return;
  
  const qty = parseInt(qtyInput.value) || 0;
  const unitPrice = Number(currentModalProduct?.price || 0);
  const VAT_RATE = 0.21;
  
  const priceWithVat = unitPrice * qty;
  const priceNoVat = priceWithVat / (1 + VAT_RATE);
  
  if (withVatEl) withVatEl.textContent = priceWithVat.toFixed(2) + ' RON';
  if (noVatEl) noVatEl.textContent = priceNoVat.toFixed(2) + ' RON';
}

function adjustQty(delta) {
  const input = document.getElementById('modalQty');
  let val = parseInt(input.value) || 0;
  val = Math.max(1, val + delta); // Minim 1
  input.value = val;
  calculateModalPrices();
} 
function closeProductModal() {
  document.getElementById('addProductModal').style.display = 'none';
  currentModalProduct = null;
}

function confirmAddToCart() {
  if (!currentModalProduct) return;
  
  const qty = parseInt(document.getElementById('modalQty').value) || 0;
  
  if (qty <= 0) {
    alert("Introdu o cantitate (minim 1)");
    document.getElementById('modalQty').focus();
    return;
  }
  
  // SALVĂM numele înainte să închidem modalul!
  const prodName = currentModalProduct.name;
  
  addToCartWithQty(currentModalProduct, qty);
  closeProductModal();
  
  // Folosim variabila salvată, nu currentModalProduct (care e acum null)
  showToast(`✅ ${prodName} × ${qty} adăugat`);
}

function addToCartWithQty(product, qty) {
  const cart = getCart();
  const client = getSelectedClient();
  const price = getProductPrice(product, client);
  
  const primaryGTIN = (Array.isArray(product.gtins) && product.gtins.length) ? product.gtins[0] : (product.gtin || "");
  const g = normalizeGTIN(primaryGTIN);
  
  const found = cart.find(x => normalizeGTIN(x.gtin) === g);
  
  if (found) {
    found.qty += qty;
  } else {
    cart.push({
      id: product.id,
      gtin: primaryGTIN,
      gtins: product.gtins || [],
      name: product.name,
      qty: qty,
      price: price,
      isSpecial: client?.prices?.[String(product.id)] != null
    });
  }
  
  saveCart(cart);
  renderCart();
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: rgba(34, 197, 94, 0.95); color: white; padding: 16px 24px; border-radius: 12px; font-weight: 600; z-index: 2000; animation: slideIn 0.3s ease;';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Event listeners pentru modal
document.addEventListener('DOMContentLoaded', function() {
  const modal = document.getElementById('addProductModal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === this) closeProductModal();
    });
  }
  
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeProductModal();
  });
});

// ================= STICKY TOTALS BAR =================
function updateStickyTotals() {

  
  const cart = getCart();
  
  // TP (Total Produse) = suma cantitatilor
  const totalProducts = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  
  // Calculam valorile
  let totalNoVat = 0;
  let totalWithVat = 0;
  const VAT_RATE = 0.21; // 21% TVA
  
  cart.forEach(item => {
    const qty = Number(item.qty || 0);
    const unitPrice = Number(item.price || 0);
    
    // Presupunem ca pretul in cos este FARA TVA (asa cum trimite la SmartBill)
    const lineNoVat = unitPrice * qty;
    const lineWithVat = lineNoVat * (1 + VAT_RATE);
    
    totalNoVat += lineNoVat;
    totalWithVat += lineWithVat;
  });
  
  // Actualizam DOM
  const elTP = document.getElementById('stickyTotalProducts');
  const elTfT = document.getElementById('stickyTotalNoVat');
  const elTb = document.getElementById('stickyTotalWithVat');
  
  if (elTP) elTP.textContent = `${totalProducts} buc`;
  if (elTfT) elTfT.textContent = `${totalNoVat.toFixed(2)} RON`;
  if (elTb) elTb.textContent = `${totalWithVat.toFixed(2)} RON`;
}
  // ================= BOOT =================
  document.addEventListener("DOMContentLoaded", async () => {

  const isLoginPage = location.pathname.endsWith("login.html");
  const isRegisterPage = location.pathname.endsWith("register.html");

  if (isLoginPage) { initLoginPage(); return; }
  if (isRegisterPage) { initRegister(); return; }


    await protectPage();
    await renderUserBar();
    

    if (document.getElementById("inventoryList")) initInventoryPage();
    if (document.getElementById("stockProduct")) initStockPage();
    if (document.getElementById("clientsTree")) initAddClientPage();
    if (document.getElementById("productsTree")) initOrderPage();
    if (document.getElementById("ordersList")) initOrdersPage();
    if (document.getElementById("productsList")) initCheckPricePage();
    if (document.getElementById("pickingList")) await initPickingOrderPage();
    if (location.pathname.endsWith("client.html")) initClientHomePage();
    if (document.getElementById("productsList")) initCheckPricePage();
    // Inițializare pagină Foi de Parcurs (dacă suntem pe acea pagină)
if (location.pathname.includes('foi_parcurs')) {
  // Nu e nevoie de extra init aici, e inline în HTML
}
initProductsPage();
    await initClientPricesPage();

  if (document.getElementById("clientsList")) {
    await loadClientsAdmin();
    await initAddClientForm();
  }
  if (document.getElementById("editItemsList")) await initEditOrderPage();


  if (document.getElementById("stockList")) await initCheckStockPage();




    initViewCurrentOrderButton();
  });



