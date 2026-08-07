import { supabase } from "./supabaseClient.js";

const PAGE_SIZE = 10; // 5 satır x 2 sütun

let currentPage = 1;
let currentSearch = "";
let currentView = "all"; // "all" | "saved" | "th17" | "th18"

const grid = document.getElementById("basesGrid");
const paginationEl = document.getElementById("pagination");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const logoutBtn = document.getElementById("logoutBtn");
const tabAll = document.getElementById("tabAll");
const tabTh18 = document.getElementById("tabTh18");
const tabTh17 = document.getElementById("tabTh17");
const tabSaved = document.getElementById("tabSaved");
const allTabs = [tabAll, tabTh18, tabTh17, tabSaved];

let currentSession = null;

// ------------------------------------------------------------
// Giriş kontrolü — oturum yoksa login sayfasına gönder
// ------------------------------------------------------------
async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
  }
  currentSession = session;
  return session;
}

// ------------------------------------------------------------
// Düzenleri getir ve çiz
// ------------------------------------------------------------
async function loadBases() {
  grid.innerHTML = `<p class="grid-status">Yükleniyor...</p>`;
  paginationEl.innerHTML = "";

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // "Kaydedilenler" görünümündeysek önce kaydedilen düzen id'lerini alıyoruz
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
    .select("id, image_url, link, town_hall, created_at, profiles!inner(id, username)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (currentSearch) {
    query = query.ilike("profiles.username", `%${currentSearch}%`);
  }

  if (currentView === "th17" || currentView === "th18") {
    query = query.eq("town_hall", currentView === "th17" ? 17 : 18);
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
  const { data } = await supabase
    .from("ratings")
    .select("base_id, rating")
    .eq("user_id", currentSession.user.id)
    .in("base_id", baseIds);
  return Object.fromEntries((data || []).map((r) => [r.base_id, r.rating]));
}

async function getMySaved(baseIds) {
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

  card.innerHTML = `
    <div class="base-image-wrap">
      <img src="${base.image_url}" alt="${escapeHtml(base.profiles.username)} kullanıcısının düzeni" loading="lazy" />
      <span class="th-badge">TH${base.town_hall}</span>
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
// Puan gönder (1-5)
// ------------------------------------------------------------
async function submitRating(baseId, value) {
  await supabase.from("ratings").upsert(
    { base_id: baseId, user_id: currentSession.user.id, rating: value },
    { onConflict: "base_id,user_id" }
  );
  loadBases();
}

// ------------------------------------------------------------
// Kaydet / kaydı kaldır
// ------------------------------------------------------------
async function toggleSave(baseId, btn) {
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
    // Kaydedilenler görünümündeyken kaydı kaldırınca kart listeden düşmeli
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
// ------------------------------------------------------------
// Görünüm sekmeleri (Tüm Düzenler / TH18 / TH17 / Kaydedilenler)
// ------------------------------------------------------------
function setView(view, activeTab) {
  if (currentView === view) return;
  currentView = view;
  currentPage = 1;
  allTabs.forEach((t) => t.classList.remove("active"));
  activeTab.classList.add("active");
  loadBases();
}

tabAll.addEventListener("click", () => setView("all", tabAll));
tabTh18.addEventListener("click", () => setView("th18", tabTh18));
tabTh17.addEventListener("click", () => setView("th17", tabTh17));
tabSaved.addEventListener("click", () => setView("saved", tabSaved));

// ------------------------------------------------------------
// Arama
// ------------------------------------------------------------
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  currentSearch = searchInput.value.trim();
  currentPage = 1;
  loadBases();
});

// ------------------------------------------------------------
// Çıkış
// ------------------------------------------------------------
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "index.html";
});

// ------------------------------------------------------------
// Başlat
// ------------------------------------------------------------
(async function init() {
  await requireAuth();
  loadBases();
})();
