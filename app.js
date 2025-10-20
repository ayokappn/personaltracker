// —— utilitaires ——
const $ = (sel, parent = document) => parent.querySelector(sel);
const $$ = (sel, parent = document) => [...parent.querySelectorAll(sel)];
const uid = () => Math.random().toString(36).slice(2, 9);

const STORAGE_KEY = "watchlist.items.v1";
const nowISO = () => new Date().toISOString();

// ordre de statut pour le cycle rapide
const STATUS_FLOW = ["planned", "current", "paused", "done", "dropped"];

const TYPE_LABEL = {
  book: "Livre", manga: "Manga", webtoon: "Webtoon", audiobook: "Audio",
  movie: "Film", series: "Série", anime: "Anime", reportage:"Reportage", article:"Article"
};
const STATUS_LABEL = {
  planned: "À voir/lire", current: "En cours", paused: "En pause",
  dropped: "Abandonné", done: "Terminé"
};

// —— état ——
let state = {
  items: [],
  viewType: "all",
  statusFilter: "all",
  sortBy: "updated",
  search: ""
};

// —— persistence ——
function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  // seed de démo
  return [
    {
      id: uid(), type: "anime", title: "Spy x Family", creator: "WIT & CloverWorks",
      status: "current", progress: 48, rating: 3.5, cover: "",
      notes: "Épisodes au café du dimanche ☕️", updatedAt: nowISO()
    },
    {
      id: uid(), type: "book", title: "Le Problème à trois corps", creator: "Liu Cixin",
      status: "planned", progress: 0, rating: 0, cover: "",
      notes: "", updatedAt: nowISO()
    },
    {
      id: uid(), type: "movie", title: "Your Name.", creator: "Makoto Shinkai",
      status: "done", progress: 100, rating: 5, cover: "",
      notes: "Rewatch quand il pleut 🌧️", updatedAt: nowISO()
    },
  ];
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}

// —— initialisation UI ——
const cardsWrap = $("#cards");
const emptyState = $("#emptyState");
const dlg = $("#itemDialog");
const form = $("#itemForm");
const typeTabs = $("#typeTabs");
const statusSel = $("#statusFilter");
const sortSel = $("#sortBy");
const searchInput = $("#searchInput");
const quickCurrent = $("#quickCurrent");
const quickNext = $("#quickNext");

function init() {
  state.items = load();
  bindUI();
  render();
}

function bindUI() {
  $("#addBtn").addEventListener("click", () => openForm());
  $("#emptyAdd").addEventListener("click", () => openForm());
  $("#closeDialog").addEventListener("click", () => dlg.close());

    // Export / Import
  $("#exportBtn").addEventListener("click", exportJSON);
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    importFromFile(file);
    e.target.value = ""; // reset pour pouvoir recharger le même fichier plus tard
  });


  form.addEventListener("submit", onSubmitForm);

  typeTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    $$(".tab", typeTabs).forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.viewType = btn.dataset.type;
    render();
  });

  statusSel.addEventListener("change", () => { state.statusFilter = statusSel.value; render(); });
  sortSel.addEventListener("change", () => { state.sortBy = sortSel.value; render(); });
  $("#clearFilters").addEventListener("click", () => {
    state.statusFilter = "all"; statusSel.value = "all";
    state.sortBy = "updated"; sortSel.value = "updated";
    state.search = ""; searchInput.value = "";
    render();
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      state.search = searchInput.value.trim().toLowerCase();
      render();
    }
  });
}

// —— CRUD —— 
function openForm(item = null) {
  form.reset();
  $("#dialogTitle").textContent = item ? "Éditer" : "Ajouter";
  if (item) {
    for (const [k, v] of Object.entries(item)) {
      if (form.elements[k]) form.elements[k].value = v;
    }
  } else {
    // pré-sélectionne le type actif si pertinent
    const activeType = state.viewType;
    if (activeType !== "all" && form.elements.type) {
      form.elements.type.value = activeType;
    }
  }
  dlg.showModal();
}

function onSubmitForm(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const payload = {
    id: data.id || uid(),
    type: data.type,
    title: data.title.trim(),
    creator: data.creator?.trim() || "",
    status: data.status,
    progress: Math.max(0, Math.min(100, Number(data.progress || 0))),
    rating: Math.max(0, Math.min(5, Number(data.rating || 0))),
    cover: data.cover?.trim() || "",
    notes: data.notes?.trim() || "",
    media: data.media?.trim() || "",
    link: data.link?.trim() || "",
    updatedAt: nowISO()
  };

  const exists = state.items.findIndex(i => i.id === payload.id);
  if (exists >= 0) state.items.splice(exists, 1, payload);
  else state.items.unshift(payload);

  save();
  dlg.close();
  render();
}

function deleteItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  save(); render();
}

function cycleStatus(item) {
  const idx = STATUS_FLOW.indexOf(item.status);
  item.status = STATUS_FLOW[(idx + 1) % STATUS_FLOW.length];
  item.updatedAt = nowISO();
  save(); render();
}

// —— rendu —— 
function render() {
  const items = filterAndSort(state.items);
  cardsWrap.innerHTML = "";
  if (!items.length) {
    emptyState.classList.remove("hidden");
  } else {
    emptyState.classList.add("hidden");
    for (const it of items) {
      cardsWrap.appendChild(renderCard(it));
    }
  }
  renderQuickLists();
}

function filterAndSort(items) {
  return items
    .filter(it => state.viewType === "all" || it.type === state.viewType)
    .filter(it => state.statusFilter === "all" || it.status === state.statusFilter)
    .filter(it => !state.search || `${it.title} ${it.creator}`.toLowerCase().includes(state.search))
    .sort((a,b) => {
      if (state.sortBy === "title") return a.title.localeCompare(b.title);
      if (state.sortBy === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      if (state.sortBy === "progress") return (b.progress ?? 0) - (a.progress ?? 0);
      // updated
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
}

function renderCard(it) {
  const tpl = $("#cardTpl").content.cloneNode(true);
  const card = tpl.querySelector(".card");
  const cover = tpl.querySelector(".cover");
  const typePill = tpl.querySelector(".type-pill");
  const statusPill = tpl.querySelector(".status-pill");
  const title = tpl.querySelector(".title");
  const creator = tpl.querySelector(".creator");
  const notes = tpl.querySelector(".notes");
  const bar = tpl.querySelector(".bar span");
  const progressText = tpl.querySelector(".progress-text");
  const ratingWrap = tpl.querySelector(".rating");

  if (it.cover) cover.style.backgroundImage = `url("${it.cover}")`;
  typePill.textContent = TYPE_LABEL[it.type] ?? it.type;
  statusPill.textContent = STATUS_LABEL[it.status] ?? it.status;
  statusPill.dataset.status = it.status;
  title.textContent = it.title;
  // Affiche Auteur + Média si présent
creator.textContent = [it.creator, it.media].filter(Boolean).join(" · ") || "—";

// Si un lien est présent, ajoute un bouton "Ouvrir le lien"
const actions = tpl.querySelector(".card-actions");
if (it.link) {
  const a = document.createElement("a");
  a.className = "btn small ghost";
  a.textContent = "Ouvrir le lien";
  a.href = it.link;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  actions.prepend(a);
}
  bar.style.width = `${it.progress ?? 0}%`;
  progressText.textContent = `${it.progress ?? 0}%`;
  notes.textContent = it.notes || "";

  // étoiles
  ratingWrap.innerHTML = "";
  const full = Math.floor(it.rating || 0);
  const half = (it.rating || 0) - full >= 0.5;
  for (let i=1;i<=5;i++){
    const span = document.createElement("span");
    span.className = "star" + (i<=full ? " filled" : "");
    span.textContent = (i<=full) ? "★" : "☆";
    if (half && i === full+1) span.textContent = "⯨"; // pseudo demi-étoile
    ratingWrap.appendChild(span);
  }

  // actions
  tpl.querySelector('[data-action="edit"]').addEventListener("click", () => openForm(it));
  tpl.querySelector('[data-action="delete"]').addEventListener("click", () => {
    if (confirm(`Supprimer "${it.title}" ?`)) deleteItem(it.id);
  });
  tpl.querySelector('[data-action="status"]').addEventListener("click", () => cycleStatus(it));

  return card;
}

function renderQuickLists() {
  // En cours
  quickCurrent.querySelectorAll("li.item").forEach(n => n.remove());
  state.items
    .filter(i => i.status === "current")
    .sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 6)
    .forEach(i => {
      const li = document.createElement("li");
      li.className = "item";
      li.textContent = `• ${i.title}`;
      quickCurrent.appendChild(li);
    });

  // À suivre (planned)
  quickNext.querySelectorAll("li.item").forEach(n => n.remove());
  state.items
    .filter(i => i.status === "planned")
    .sort((a,b) => a.title.localeCompare(b.title))
    .slice(0, 6)
    .forEach(i => {
      const li = document.createElement("li");
      li.className = "item";
      li.textContent = `• ${i.title}`;
      quickNext.appendChild(li);
    });
}

init();

// —— Export / Import JSON ——

function exportJSON() {
  // on exporte toute la collection telle qu'enregistrée (localStorage)
  const data = JSON.stringify(state.items, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `watchlist-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) throw new Error("Le fichier ne contient pas une liste.");

      // Normalisation minimale des objets
      const normalized = parsed.map(normalizeItem).filter(Boolean);

      const replaceAll = confirm(
        "Importer le fichier :\n\nOK = remplacer toute la liste\nAnnuler = fusionner (mise à jour par id ou par couple type+titre)"
      );

      if (replaceAll) {
        state.items = normalized;
      } else {
        // fusion : met à jour par id, sinon par (type + title), sinon ajoute
        for (const incoming of normalized) {
          let idx = state.items.findIndex(i => i.id === incoming.id);
          if (idx === -1) {
            idx = state.items.findIndex(i => i.type === incoming.type && i.title.trim().toLowerCase() === incoming.title.trim().toLowerCase());
          }
          if (idx >= 0) state.items.splice(idx, 1, incoming);
          else state.items.unshift(incoming);
        }
      }

      save(); // réutilise ta fonction existante
      render();
      alert("Import terminé ✅");
    } catch (err) {
      console.error(err);
      alert("Échec de l'import : " + err.message);
    }
  };
  reader.onerror = () => alert("Impossible de lire ce fichier.");
  reader.readAsText(file, "utf-8");
}

function normalizeItem(it) {
  if (!it || !it.title || !it.type) return null;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n||0)));
  return {
    id: it.id || uid(),
    type: String(it.type),
    title: String(it.title).trim(),
    creator: String(it.creator || ""),
    status: ["planned","current","paused","dropped","done"].includes(it.status) ? it.status : "planned",
    progress: clamp(it.progress, 0, 100),
    rating: clamp(it.rating, 0, 5),
    cover: String(it.cover || ""),
    notes: String(it.notes || ""),
    media: String(it.media || ""),
    link: String(it.link || ""),
    updatedAt: it.updatedAt || nowISO(),
  };
}
