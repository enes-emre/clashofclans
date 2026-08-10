import { supabase, usernameToFakeEmail, REMEMBER_FLAG_KEY } from "./supabaseClient.js";

// Nereden ve neden gönderildiğini URL'den oku (örn. giris.html?redirect=paylas.html)
const params = new URLSearchParams(window.location.search);
const redirectTarget = params.get("redirect") || "index.html";

// Not: element bulunamazsa (örn. eski bir dosya sürümü) sayfa çökmesin diye kontrol ediyoruz
const redirectNotice = document.getElementById("redirectNotice");
if (redirectNotice && params.get("redirect") === "paylas.html") {
  redirectNotice.classList.remove("hidden");
}

// ------------------------------------------------------------
// DOM referansları
// ------------------------------------------------------------
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const statusMsg = document.getElementById("statusMsg");

const loginSubmitBtn = document.getElementById("loginSubmitBtn");
const registerSubmitBtn = document.getElementById("registerSubmitBtn");

function showStatus(message, type = "error") {
  statusMsg.textContent = message;
  statusMsg.classList.toggle("success", type === "success");
}

function clearStatus() {
  statusMsg.textContent = "";
  statusMsg.classList.remove("success");
}

// ------------------------------------------------------------
// Zaten girişliyse doğrudan ana sayfaya yönlendir
// ------------------------------------------------------------
(async function redirectIfLoggedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = redirectTarget;
  }
})();

// ------------------------------------------------------------
// Sekme geçişleri
// ------------------------------------------------------------
tabLogin.addEventListener("click", () => {
  tabLogin.classList.add("active");
  tabRegister.classList.remove("active");
  tabLogin.setAttribute("aria-selected", "true");
  tabRegister.setAttribute("aria-selected", "false");
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
  clearStatus();
});

tabRegister.addEventListener("click", () => {
  tabRegister.classList.add("active");
  tabLogin.classList.remove("active");
  tabRegister.setAttribute("aria-selected", "true");
  tabLogin.setAttribute("aria-selected", "false");
  registerForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  clearStatus();
});

// ------------------------------------------------------------
// GİRİŞ YAP
// ------------------------------------------------------------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();

  const username = document.getElementById("loginUsername").value;
  const password = document.getElementById("loginPassword").value;
  const rememberMe = document.getElementById("rememberMe").checked;

  if (!username || !password) {
    showStatus("Kullanıcı adı ve şifre gerekli.");
    return;
  }

  localStorage.setItem(REMEMBER_FLAG_KEY, rememberMe ? "true" : "false");

  loginSubmitBtn.disabled = true;
  loginSubmitBtn.textContent = "Giriş yapılıyor...";

  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToFakeEmail(username),
    password,
  });

  loginSubmitBtn.disabled = false;
  loginSubmitBtn.textContent = "Giriş Yap";

  if (error) {
    console.error("Giriş hatası:", error.message); // gerçek sebep konsolda görünür
    showStatus("Kullanıcı adı veya şifre hatalı.");
    return;
  }

  showStatus("Giriş başarılı, yönlendiriliyorsun...", "success");
  window.location.href = redirectTarget;
});

// ------------------------------------------------------------
// HESAP OLUŞTUR
// ------------------------------------------------------------
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();

  const username = document.getElementById("registerUsername").value;
  const password = document.getElementById("registerPassword").value;
  const passwordConfirm = document.getElementById("registerPasswordConfirm").value;

  if (!username || !password || !passwordConfirm) {
    showStatus("Tüm alanları doldurman gerekiyor.");
    return;
  }

  if (password !== passwordConfirm) {
    showStatus("Girilen şifreler birbiriyle uyuşmuyor.");
    return;
  }

  if (password.length < 6) {
    showStatus("Şifre en az 6 karakter olmalı.");
    return;
  }

  registerSubmitBtn.disabled = true;
  registerSubmitBtn.textContent = "Hesap oluşturuluyor...";

  const { error } = await supabase.auth.signUp({
    email: usernameToFakeEmail(username),
    password,
    options: {
      data: { username: username.trim() },
    },
  });

  registerSubmitBtn.disabled = false;
  registerSubmitBtn.textContent = "Hesap Oluştur";

  if (error) {
    if (error.message.includes("already registered")) {
      showStatus("Bu kullanıcı adı zaten alınmış.");
    } else {
      showStatus("Hesap oluşturulamadı: " + error.message);
    }
    return;
  }

  showStatus("Hesabın oluşturuldu! Şimdi giriş yapabilirsin.", "success");
  registerForm.reset();
  tabLogin.click();
});
