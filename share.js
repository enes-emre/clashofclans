import { supabase } from "./supabaseClient.js";

const form = document.getElementById("shareForm");
const statusMsg = document.getElementById("statusMsg");
const submitBtn = document.getElementById("shareSubmitBtn");
const fileInput = document.getElementById("baseImage");
const previewImg = document.getElementById("imagePreview");
const thButtons = document.querySelectorAll(".th-btn");

let selectedTownHall = 17;

thButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    thButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedTownHall = Number(btn.dataset.th);
  });
});

function showStatus(message, type = "error") {
  statusMsg.textContent = message;
  statusMsg.classList.toggle("success", type === "success");
}

// Giriş kontrolü
(async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
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
    window.location.href = "index.html";
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
    window.location.href = "duzenler.html";
  }, 800);
});
