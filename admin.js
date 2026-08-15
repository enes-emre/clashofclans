import { supabase } from "./supabaseClient.js";

const PAGE_SIZE = 20;
let currentPage = 1;

const adminStatus = document.getElementById("adminStatus");
const tableWrap = document.getElementById("adminTableWrap");
const tableBody = document.getElementById("adminTableBody");
const paginationEl = document.getElementById("adminPagination");

const TH_OPTIONS = [13, 14, 15, 16, 17, 18];
const TYPE_OPTIONS = [
  { value: "war_base", label: "War Base" },
  { value: "trophy_base", label: "Trophy Base" },
  { value: "for_fun", label: "For Fun" },
];

// ------------------------------------------------------------
// Giriş + admin kontrolü
// ------------------------------------------------------------
async function checkAdminAccess() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "giris.html?redirect=admin.html";
    return false;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", session.user.id)
    .single();

  if (error || !profile || !profile.is_admin) {
    adminStatus.textContent = "Bu sayfaya erişim yetkin yok.";
    return false;
  }

  return true;
}

// ------------------------------------------------------------
// Düzenleri yükle ve tabloya çiz
// ------------------------------------------------------------
async function loadAdminBases() {
  adminStatus.textContent = "Yükleniyor...";
  tableWrap.classList.add("hidden");
  paginationEl.innerHTML = "";

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: bases, count, error } = await supabase
    .from("bases")
    .select("id, image_url, link, town_hall, base_type, profiles!inner(username)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    adminStatus.textContent = "Düzenler yüklenemedi.";
    console.error(error);
    return;
  }

  if (!bases || bases.length === 0) {
    adminStatus.textContent = "Hiç düzen bulunamadı.";
    return;
  }

  adminStatus.textContent = "";
  tableWrap.classList.remove("hidden");
  tableBody.innerHTML = "";

  bases.forEach((base) => {
    tableBody.appendChild(renderRow(base));
  });

  renderPagination(count || 0);
}

function renderRow(base) {
  const tr = document.createElement("tr");
  tr.dataset.baseId = base.id;

  const thSelectHtml = `
    <select class="admin-th-select">
      ${TH_OPTIONS.map((th) => `<option value="${th}" ${th === base.town_hall ? "selected" : ""}>TH${th}</option>`).join("")}
    </select>
  `;

  const typeSelectHtml = `
    <select class="admin-type-select">
      ${TYPE_OPTIONS.map(
        (t) => `<option value="${t.value}" ${t.value === base.base_type ? "selected" : ""}>${t.label}</option>`
      ).join("")}
    </select>
  `;

  tr.innerHTML = `
    <td><img src="${base.image_url}" alt="Düzen görseli" class="admin-thumb" /></td>
    <td>${escapeHtml(base.profiles.username)}</td>
    <td>${thSelectHtml}</td>
    <td>${typeSelectHtml}</td>
    <td><a href="${base.link}" target="_blank" rel="noopener noreferrer" class="admin-link">Aç ↗</a></td>
    <td class="admin-row-actions">
      <button type="button" class="admin-save-btn">Kaydet</button>
      <button type="button" class="admin-delete-btn">Sil</button>
    </td>
  `;

  tr.querySelector(".admin-save-btn").addEventListener("click", () => saveRow(base.id, tr));
  tr.querySelector(".admin-delete-btn").addEventListener("click", () => deleteRow(base.id, tr));

  return tr;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ------------------------------------------------------------
// Satırı kaydet (TH / tür güncelle)
// ------------------------------------------------------------
async function saveRow(baseId, tr) {
  const saveBtn = tr.querySelector(".admin-save-btn");
  const townHall = Number(tr.querySelector(".admin-th-select").value);
  const baseType = tr.querySelector(".admin-type-select").value;

  saveBtn.disabled = true;
  saveBtn.textContent = "Kaydediliyor...";

  const { error } = await supabase
    .from("bases")
    .update({ town_hall: townHall, base_type: baseType })
    .eq("id", baseId);

  saveBtn.disabled = false;
  saveBtn.textContent = error ? "Hata!" : "Kaydedildi ✓";

  setTimeout(() => {
    saveBtn.textContent = "Kaydet";
  }, 1500);

  if (error) console.error(error);
}

// ------------------------------------------------------------
// Satırı sil
// ------------------------------------------------------------
async function deleteRow(baseId, tr) {
  const confirmed = window.confirm("Bu düzeni kalıcı olarak silmek istediğine emin misin?");
  if (!confirmed) return;

  const deleteBtn = tr.querySelector(".admin-delete-btn");
  deleteBtn.disabled = true;
  deleteBtn.textContent = "Siliniyor...";

  const { error } = await supabase.from("bases").delete().eq("id", baseId);

  if (error) {
    console.error(error);
    deleteBtn.disabled = false;
    deleteBtn.textContent = "Sil";
    return;
  }

  tr.remove();
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
  loadAdminBases();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ------------------------------------------------------------
// Başlat
// ------------------------------------------------------------
(async function init() {
  const isAdmin = await checkAdminAccess();
  if (isAdmin) {
    loadAdminBases();
  }
})();
