import { supabase } from "./supabaseClient.js";

const form = document.getElementById("shareForm");
const statusMsg = document.getElementById("statusMsg");
const submitBtn = document.getElementById("shareSubmitBtn");
const fileInput = document.getElementById("baseImage");
const previewImg = document.getElementById("imagePreview");
const thButtons = document.querySelectorAll("#thSelect .th-btn");
const typeButtons = document.querySelectorAll("#typeSelect .th-btn");

let selectedTownHall = 17;
let selectedBaseType = "war_base";

thButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    thButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedTownHall = Number(btn.dataset.th);
  });
});

typeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    typeButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedBaseType = btn.dataset.type;
  });
});

function showStatus(message, type = "error") {
  statusMsg.textContent = message;
  statusMsg.classList.toggle("success", type === "success");
}

// Giriş kontrolü — girişi yoksa, geri dönmesi için bilgilendirerek giriş sayfasına gönder
(async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "giris.html?redirect=paylas.html";
  }
})();

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) {
    previewImg.src = URL.createObjectURL(file);
    previewImg.classList.remove("hidden");
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showStatus("");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "giris.html?redirect=paylas.html";
    return;
  }

  const file = fileInput.files[0];
  const link = document.getElementById("baseLink").value.trim();

  if (!file || !link) {
    showStatus("Fotoğraf ve link gerekli.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Yükleniyor...";

  const filePath = `${session.user.id}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("base-images")
    .upload(filePath, file);

  if (uploadError) {
    showStatus("Fotoğraf yüklenemedi: " + uploadError.message);
    submitBtn.disabled = false;
    submitBtn.textContent = "Paylaş";
    return;
  }

  const { data: publicUrlData } = supabase.storage.from("base-images").getPublicUrl(filePath);

  const { error: insertError } = await supabase.from("bases").insert({
    user_id: session.user.id,
    image_url: publicUrlData.publicUrl,
    link,
    town_hall: selectedTownHall,
    base_type: selectedBaseType,
  });

  submitBtn.disabled = false;
  submitBtn.textContent = "Paylaş";

  if (insertError) {
    showStatus("Düzen kaydedilemedi: " + insertError.message);
    return;
  }

  showStatus("Düzen paylaşıldı!", "success");
  form.reset();
  previewImg.classList.add("hidden");
  setTimeout(() => {
    window.location.href = "index.html";
  }, 800);
});
