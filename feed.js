import { supabase } from "./supabaseClient.js";

const PAGE_SIZE = 10; // 5 satır x 2 sütun

let currentPage = 1;
let currentView = "all"; // "all" | "saved"
let currentSession = null; // giriş yapılmamışsa null kalır — gezinme buna izin verir

// Uygulanan filtreler ("Uygula" tuşuna basınca güncellenir)
let filters = { townHall: "", baseType: "", username: "" };

const grid = document.getElementById("basesGrid");
const paginationEl = document.getElementById("pagination");
const logoutBtn = document.getElementById("logoutBtn");
const shareBtn = document.getElementById("shareBtn");
const loginBtn = document.getElementById("loginBtn");
const tabAll = document.getElementById("tabAll");
const tabSaved = document.getElementById("tabSaved");
const tabFilter = document.getElementById("tabFilter");
const viewTabs = [tabAll, tabSaved]; // "Filtrele" bir görünüm değil, panel açma/kapama tuşu

const filterPanel = document.getElementById("filterPanel");
const filterTownHall = document.getElementById("filterTownHall");
const filterBaseType = document.getElementById("filterBaseType");
const filterUsername = document.getElementById("filterUsername");
const filterApply = document.getElementById("filterApply");
const filterClear = document.getElementById("filterClear");

const authModal = document.getElementById("authModal");
const authModalText = document.getElementById("authModalText");
const authModalLogin = document.getElementById("authModalLogin");
const authModalCancel = document.getElementById("authModalCancel");

const BASE_TYPE_LABELS = {
  war_base: "War",
  trophy_base: "Trophy",
  for_fun: "Fun",
};

// ------------------------------------------------------------
// Giriş durumunu oku — YÖNLENDİRME YOK, sadece arayüzü ayarlıyoruz.
// Site herkese açık; giriş sadece paylaşma/puanlama/kaydetme için gerekir.
// ------------------------------------------------------------
async function loadSession() {
  const { data: { session } } = await supabase.auth.getSession();
  currentSession = session;

  if (session) {
    shareBtn.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    loginBtn.classList.add("hidden");
  } else {
    shareBtn.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    loginBtn.classList.remove("hidden");
  }
}

// Giriş isteyen bir eyleme tıklanınca çağrılır — doğrudan yönlendirmiyor,
// önce bilgilendirme + seçim penceresi açıyor.
function requireLoginFor(message) {
  authModalText.textContent = message;
  authModal.classList.remove("hidden");
}

authModalLogin.addEventListener("click", () => {
  window.location.href = "giris.html";
});

authModalCancel.addEventListener("click", () => {
  authModal.classList.add("hidden");
});

// ------------------------------------------------------------
// Düzenleri getir ve çiz
// ------------------------------------------------------------
async function loadBases() {
  grid.innerHTML = `<p class="grid-status">Yükleniyor...</p>`;
  paginationEl.innerHTML = "";

  if (currentView === "saved" && !currentSession) {
    return;
  }

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let savedBaseIds = null;
  if (currentView === "saved") {
    const { data: savedRows } = await supabase
      .from("saved_bases")
      .select("base_id")
      .eq("user_id", currentSession.user.id);

    savedBaseIds = (savedRows || []).map((r) => r.base_id);

    if (savedBaseIds.length === 0) {
      grid.innerHTML = `<p class="grid-status">Henüz hiç düzen kaydetmedin.</p>`;
      return;
    }
  }

  let query = supabase
    .from("bases")
    .select("id, image_url, link, town_hall, base_type, created_at, profiles!inner(id, username)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.username) {
    query = query.ilike("profiles.username", `%${filters.username}%`);
  }
  if (filters.townHall) {
    query = query.eq("town_hall", Number(filters.townHall));
  }
  if (filters.baseType) {
    query = query.eq("base_type", filters.baseType);
  }
  if (savedBaseIds) {
    query = query.in("id", savedBaseIds);
  }

  const { data: bases, count, error } = await query;

  if (error) {
    grid.innerHTML = `<p class="grid-status">Düzenler yüklenemedi.</p>`;
    console.error(error);
    return;
  }

  if (!bases || bases.length === 0) {
    grid.innerHTML = `<p class="grid-status">Hiç düzen bulunamadı.</p>`;
    return;
  }

  const baseIds = bases.map((b) => b.id);
  const userIds = [...new Set(bases.map((b) => b.profiles.id))];

  const [ratingRes, countRes, myRatings, mySaved] = await Promise.all([
    supabase.from("base_ratings").select("base_id, avg_rating").in("base_id", baseIds),
    supabase.from("profile_stats").select("id, base_count").in("id", userIds),
    getMyRatings(baseIds),
    getMySaved(baseIds),
  ]);

  const ratingMap = Object.fromEntries((ratingRes.data || []).map((r) => [r.base_id, r.avg_rating]));
  const countMap = Object.fromEntries((countRes.data || []).map((r) => [r.id, r.base_count]));

  grid.innerHTML = "";
  bases.forEach((base) => {
    grid.appendChild(
      renderCard(base, ratingMap[base.id], countMap[base.profiles.id], myRatings[base.id], mySaved.has(base.id))
    );
  });

  renderPagination(count || 0);
}

async function getMyRatings(baseIds) {
  if (!currentSession) return {};
  const { data } = await supabase
    .from("ratings")
    .select("base_id, rating")
    .eq("user_id", currentSession.user.id)
    .in("base_id", baseIds);
  return Object.fromEntries((data || []).map((r) => [r.base_id, r.rating]));
}

async function getMySaved(baseIds) {
  if (!currentSession) return new Set();
  const { data } = await supabase
    .from("saved_bases")
    .select("base_id")
    .eq("user_id", currentSession.user.id)
    .in("base_id", baseIds);
  return new Set((data || []).map((r) => r.base_id));
}

// ------------------------------------------------------------
// Tek bir düzen kartı oluştur
// ------------------------------------------------------------
function renderCard(base, avgRating, baseCount, myRating, isSaved) {
  const card = document.createElement("article");
  card.className = "base-card";

  const ratingText = avgRating ? Number(avgRating).toFixed(1) : "—";
  const typeLabel = BASE_TYPE_LABELS[base.base_type] || base.base_type;

  card.innerHTML = `
    <div class="base-image-wrap">
      <img src="${base.image_url}" alt="${escapeHtml(base.profiles.username)} kullanıcısının düzeni" loading="lazy" />
      <span class="th-badge">TH${base.town_hall} · ${typeLabel}</span>
      <span class="rating-badge">⭐ ${ratingText}</span>
    </div>
    <a class="base-link" href="${base.link}" target="_blank" rel="noopener noreferrer">Düzeni Aç ↗</a>
    <div class="base-meta">
      <div class="meta-top">
        <span class="base-user">${escapeHtml(base.profiles.username)} <small>(${baseCount ?? 0} düzen)</small></span>
        <button type="button" class="save-btn ${isSaved ? "saved" : ""}" data-base-id="${base.id}">
          ${isSaved ? "🔖 Kaydedildi" : "🔖 Kaydet"}
        </button>
      </div>
      <div class="star-input" data-base-id="${base.id}">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<button type="button" class="star ${myRating >= n ? "filled" : ""}" data-value="${n}">★</button>`
          )
          .join("")}
      </div>
    </div>
  `;

  card.querySelectorAll(".star").forEach((starBtn) => {
    starBtn.addEventListener("click", () => submitRating(base.id, Number(starBtn.dataset.value)));
  });

  card.querySelector(".save-btn").addEventListener("click", (e) => {
    toggleSave(base.id, e.currentTarget);
  });

  return card;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ------------------------------------------------------------
// Puan gönder (1-5) — giriş gerektirir
// ------------------------------------------------------------
async function submitRating(baseId, value) {
  if (!currentSession) {
    requireLoginFor("Puan verebilmek için giriş yapman gerekiyor.");
    return;
  }
  await supabase.from("ratings").upsert(
    { base_id: baseId, user_id: currentSession.user.id, rating: value },
    { onConflict: "base_id,user_id" }
  );
  loadBases();
}

// ------------------------------------------------------------
// Kaydet / kaydı kaldır — giriş gerektirir
// ------------------------------------------------------------
async function toggleSave(baseId, btn) {
  if (!currentSession) {
    requireLoginFor("Düzen kaydedebilmek için giriş yapman gerekiyor.");
    return;
  }

  const isSaved = btn.classList.contains("saved");
  btn.disabled = true;

  if (isSaved) {
    await supabase
      .from("saved_bases")
      .delete()
      .eq("base_id", baseId)
      .eq("user_id", currentSession.user.id);
  } else {
    await supabase
      .from("saved_bases")
      .insert({ base_id: baseId, user_id: currentSession.user.id });
  }

  btn.disabled = false;

  if (currentView === "saved") {
    loadBases();
  } else {
    btn.classList.toggle("saved");
    btn.textContent = btn.classList.contains("saved") ? "🔖 Kaydedildi" : "🔖 Kaydet";
  }
}

// ------------------------------------------------------------
// Sayfalama
// ------------------------------------------------------------
function renderPagination(totalCount) {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  paginationEl.innerHTML = "";

  if (totalPages <= 1) return;

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "‹ Önceki";
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener("click", () => goToPage(currentPage - 1));
  paginationEl.appendChild(prevBtn);

  for (let i = 1; i <= totalPages; i++) {
    const pageBtn = document.createElement("button");
    pageBtn.textContent = String(i);
    pageBtn.className = i === currentPage ? "active" : "";
    pageBtn.addEventListener("click", () => goToPage(i));
    paginationEl.appendChild(pageBtn);
  }

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Sonraki ›";
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.addEventListener("click", () => goToPage(currentPage + 1));
  paginationEl.appendChild(nextBtn);
}

function goToPage(page) {
  currentPage = page;
  loadBases();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ------------------------------------------------------------
// Görünüm sekmeleri (Tüm Düzenler / Kaydedilenler)
// ------------------------------------------------------------
function setView(view, activeTab) {
  if (view === "saved" && !currentSession) {
    requireLoginFor("Kaydedilenleri görmek için giriş yapman gerekiyor.");
    return;
  }
  if (currentView === view) return;
  currentView = view;
  currentPage = 1;
  viewTabs.forEach((t) => t.classList.remove("active"));
  activeTab.classList.add("active");
  loadBases();
}

tabAll.addEventListener("click", () => setView("all", tabAll));
tabSaved.addEventListener("click", () => setView("saved", tabSaved));

// ------------------------------------------------------------
// Filtreleme paneli — bir görünüm değil, açılır/kapanır panel
// ------------------------------------------------------------
tabFilter.addEventListener("click", () => {
  const isOpen = !filterPanel.classList.contains("hidden");
  filterPanel.classList.toggle("hidden", isOpen);
  tabFilter.classList.toggle("active", !isOpen);
});

filterApply.addEventListener("click", () => {
  filters = {
    townHall: filterTownHall.value,
    baseType: filterBaseType.value,
    username: filterUsername.value.trim(),
  };
  currentPage = 1;
  loadBases();
});

filterUsername.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    filterApply.click();
  }
});

filterClear.addEventListener("click", () => {
  filterTownHall.value = "";
  filterBaseType.value = "";
  filterUsername.value = "";
  filters = { townHall: "", baseType: "", username: "" };
  currentPage = 1;
  loadBases();
});

// ------------------------------------------------------------
// Çıkış
// ------------------------------------------------------------
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  await loadSession();
  if (currentView === "saved") {
    tabAll.click();
  } else {
    loadBases();
  }
});

// ------------------------------------------------------------
// Başlat — giriş şart değil, herkes doğrudan düzenleri görür
// ------------------------------------------------------------
(async function init() {
  await loadSession();
  loadBases();
})();
