// ============================================================
// Tüm sayfaların ortak kullandığı Supabase istemcisi.
// URL ve anon key'i sadece burada tanımlıyoruz, diğer dosyalar
// bu modülden import ediyor.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://kdxtvayswxsmvfnfgxwr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHR2YXlzd3hzbXZmbmZneHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDE4NjEsImV4cCI6MjEwMTYxNzg2MX0.i0RAknolBzHtwUHpAvlXQXm1EjDcsCybcHe3NUiQvfY";

// "Beni hatırla" mantığı: işaretliyse localStorage (kalıcı),
// değilse sessionStorage (sekme kapanınca silinir).
const REMEMBER_FLAG_KEY = "sb-remember-me";

const dualStorage = {
  getItem: (key) => {
    const remember = localStorage.getItem(REMEMBER_FLAG_KEY) === "true";
    return remember ? localStorage.getItem(key) : sessionStorage.getItem(key);
  },
  setItem: (key, value) => {
    const remember = localStorage.getItem(REMEMBER_FLAG_KEY) === "true";
    if (remember) {
      localStorage.setItem(key, value);
    } else {
      sessionStorage.setItem(key, value);
    }
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: dualStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

export function usernameToFakeEmail(username) {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  return `${clean}@kullanici.local`;
}

export { REMEMBER_FLAG_KEY };
