import { supabase } from "./supabaseClient.js";

const PAGE_SIZE = 10; // 5 satır x 2 sütun

let currentPage = 1;
let currentSearch = "";

const grid = document.getElementById("basesGrid");
const paginationEl = document.getElementById("pagination");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const logoutBtn = document.getElementById("logoutBtn");

// ------------------------------------------------------------
// Giriş kontrolü — oturum yoksa login sayfasına gönder
// ------------------------------------------------------------
async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
  }
  return session;
}

// ------------------------------------------------------------
// Düzenleri getir ve çiz
// ------------------------------------------------------------
async function loadBases() {
  grid.innerHTML = `<p class="grid-status">Yükleniyor...</p>`;

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("bases")
    .select("id, image_url, link, created_at, profiles!inner(id, username)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (currentSearch) {
    query = query.ilike("profiles.username", `%${currentSearch}%`);
  }

  const { data: bases, count, error } = await query;

  if (error) {
    grid.innerHTML = `<p class="grid-status">Düzenler yüklenemedi.</p>`;
    console.error(error);
    return;
  }

  if (!bases || bases.length === 0) {
    grid.innerHTML = `<p class="grid-status">Hiç düzen bulunamadı.</p>`;
    paginationEl.innerHTML = "";
    return;
  }

  const baseIds = bases.map((b) => b.id);
  const userIds = [...new Set(bases.map((b) => b.profiles.id))];

  const [ratingRes, countRes, myRatings] = await Promise.all([
    supabase.from("base_ratings").select("base_id, avg_rating").in("base_id", baseIds),
    supabase.from("profile_stats").select("id, base_count").in("id", userIds),
    getMyRatings(baseIds),
  ]);

  const ratingMap = Object.fromEntries((ratingRes.data || []).map((r) => [r.base_id, r.avg_rating]));
  const countMap = Object.fromEntries((countRes.data || []).map((r) => [r.id, r.base_count]));

  grid.innerHTML = "";
  bases.forEach((base) => {
    grid.appendChild(
      renderCard(base, ratingMap[base.id], countMap[base.profiles.id], myRatings[base.id])
    );
  });

  renderPagination(count || 0);
}

async function getMyRatings(baseIds) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return {};
  const { data } = await supabase
    .from("ratings")
    .select("base_id, rating")
    .eq("user_id", session.user.id)
    .in("base_id", baseIds);
  return Object.fromEntries((data || []).map((r) => [r.base_id, r.rating]));
}

// ------------------------------------------------------------
// Tek bir düzen kartı oluştur
// ------------------------------------------------------------
function renderCard(base, avgRating, baseCount, myRating) {
  const card = document.createElement("article");
  card.className = "base-card";

  const ratingText = avgRating ? Number(avgRating).toFixed(1) : "—";

  card.innerHTML = `
    <div class="base-image-wrap">
      <img src="${base.image_url}" alt="${escapeHtml(base.profiles.username)} kullanıcısının düzeni" loading="lazy" />
      <span class="rating-badge">⭐ ${ratingText}</span>
    </div>
    <a class="base-link" href="${base.link}" target="_blank" rel="noopener noreferrer">Düzeni Aç ↗</a>
    <div class="base-meta">
      <span class="base-user">${escapeHtml(base.profiles.username)} <small>(${baseCount ?? 0} düzen)</small></span>
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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return;
  }
  await supabase.from("ratings").upsert(
    { base_id: baseId, user_id: session.user.id, rating: value },
    { onConflict: "base_id,user_id" }
  );
  loadBases();
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
