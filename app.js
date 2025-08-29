class IKeyApp {
  // Placeholder base class representing existing iKey functionality.
}

// Implements the three-layer encryption architecture used for QR data,
// profile details and the double-wrapped health vault.
class ThreeLayerEncryption {
  // Generate a random 256-bit key encoded as base64
  static generateQrKey() {
    const buf = self.crypto.getRandomValues(new Uint8Array(32));
    return this.arrayBufferToBase64(buf.buffer);
  }

  static arrayBufferToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  static base64ToArrayBuffer(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer;
  }

  static async importKey(base64Key) {
    const raw = this.base64ToArrayBuffer(base64Key);
    return await self.crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  static async deriveKey(material, salt, iterations) {
    const enc = new TextEncoder();
    const keyMaterial = await self.crypto.subtle.importKey(
      'raw',
      enc.encode(material),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const key = await self.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const raw = await self.crypto.subtle.exportKey('raw', key);
    return this.arrayBufferToBase64(raw);
  }

  static async sha256(text) {
    const data = new TextEncoder().encode(text);
    const hash = await self.crypto.subtle.digest('SHA-256', data);
    return this.arrayBufferToBase64(hash);
  }

  static async encrypt(obj, keyBase64) {
    const key = await this.importKey(keyBase64);
    const iv = self.crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const encrypted = await self.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return {
      iv: this.arrayBufferToBase64(iv.buffer),
      data: this.arrayBufferToBase64(encrypted)
    };
  }

  static async decrypt(encObj, keyBase64) {
    const key = await this.importKey(keyBase64);
    const iv = new Uint8Array(this.base64ToArrayBuffer(encObj.iv));
    const data = this.base64ToArrayBuffer(encObj.data);
    const decrypted = await self.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    const decoded = new TextDecoder().decode(decrypted);
    return JSON.parse(decoded);
  }

  // Build encrypted record and return GUID + qrKey
  static async buildRecord(emergencyInfo, privateInfo, healthRecords, password) {
    const guid = self.crypto.randomUUID();
    const qrKey = this.generateQrKey();

    const publicData = await this.encrypt(emergencyInfo, qrKey);

    const gate = await this.sha256(qrKey + password);
    const gatedPrivate = { ...privateInfo, encryptedWith: gate };

    const vaultSalt = self.crypto.getRandomValues(new Uint8Array(16));
    const vaultKey = await this.deriveKey(qrKey, vaultSalt, 100000);
    const vaultEnc = await this.encrypt(healthRecords, vaultKey);

    return {
      guid,
      qrKey,
      storedData: {
        publicData,
        privateInfo: gatedPrivate,
        vault: {
          iv: vaultEnc.iv,
          data: vaultEnc.data,
          salt: this.arrayBufferToBase64(vaultSalt.buffer)
        }
      }
    };
  }

  static async unlockPublic(storedData, qrKey) {
    return await this.decrypt(storedData.publicData, qrKey);
  }

  static async unlockPrivate(storedData, qrKey, password) {
    const gate = await this.sha256(qrKey + password);
    if (!storedData.privateInfo || storedData.privateInfo.encryptedWith !== gate) {
      throw new Error('Invalid password');
    }
    const { encryptedWith, ...info } = storedData.privateInfo;
    return info;
  }

  static async unlockVault(storedData, qrKey) {
    const vaultSalt = new Uint8Array(this.base64ToArrayBuffer(storedData.vault.salt));
    const vaultKey = await this.deriveKey(qrKey, vaultSalt, 100000);
    return await this.decrypt({ iv: storedData.vault.iv, data: storedData.vault.data }, vaultKey);
  }
}

class UnifiedHealthApp extends IKeyApp {
  constructor() {
    super();
    this.vaultUnlocked = false;
    this.attachments = new Map();
    this.phvData = { sections: {}, attachments: [] };
  }

  async createAttachment(data, type) {
    // Placeholder for attachment creation and upload.
    const guid = self.crypto.randomUUID();
    this.attachments.set(guid, { data, type });
    this.phvData.attachments.push({ guid, type });
    return guid;
  }

  exportVault() {
    return this.phvData;
  }

  importVault(vaultData) {
    if (!vaultData) return;
    this.phvData = vaultData;
  }

  async loadVault(password) {
    // Placeholder for password verification and vault loading.
    if (window.currentBlob && window.currentBlob.vault) {
      this.importVault(window.currentBlob.vault);
    }
    this.vaultUnlocked = true;
    return true;
  }
}

// Expose a global instance for current UI to interact with
window.healthApp = new UnifiedHealthApp();

// ----------------- helpers -----------------
const state = { locations: [] }; // load from your decrypted vault on login

const uid = (p = "loc") => `${p}_${Math.random().toString(36).slice(2,8)}${Date.now().toString(36)}`;

const round6 = n => Math.round(Number(n) * 1e6) / 1e6;

function validLatLng(lat, lng) {
  const L = Number(lat), G = Number(lng);
  return Number.isFinite(L) && Number.isFinite(G) && L >= -90 && L <= 90 && G >= -180 && G <= 180;
}

// Google Maps (no API key)
const mapsOpen = ({ lat, lng }) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
const mapsEmbed = ({ lat, lng }) => `https://www.google.com/maps?q=${lat},${lng}&output=embed`;

const categoryLabels = {
  shelter: "🏠 Shelter",
  food: "🍽️ Food",
  medical: "🏥 Medical",
  services: "🏪 Services",
  contacts: "👥 Contacts",
  personal: "📋 Personal"
};
const getCategoryLabel = cat => categoryLabels[cat] || cat;

// ----------------- render -----------------
function renderPlaces() {
  const wrap = document.getElementById("placeList");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (!state.locations.length) {
    wrap.textContent = "No notes yet.";
    return;
  }

  state.locations.forEach(loc => {
    const card = document.createElement("div");
    card.style.border = "1px solid #ddd";
    card.style.borderRadius = "12px";
    card.style.padding = "12px";
    card.style.marginBottom = "12px";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "6px";

    const titleEl = document.createElement("div");
    titleEl.style.fontWeight = "700";
    titleEl.textContent = loc.title || "(Untitled note)";
    header.appendChild(titleEl);

    if (loc.category) {
      const cat = document.createElement("span");
      cat.textContent = getCategoryLabel(loc.category);
      cat.style.background = "#667eea";
      cat.style.color = "#fff";
      cat.style.fontSize = "12px";
      cat.style.padding = "2px 6px";
      cat.style.borderRadius = "8px";
      header.appendChild(cat);
    }

    card.appendChild(header);

    if (loc.coords) {
      const meta = document.createElement("div");
      meta.style.fontSize = "12px";
      meta.style.opacity = "0.8";
      meta.textContent = `(${loc.coords.lat}, ${loc.coords.lng})`;
      card.appendChild(meta);
    }

    if (loc.note) {
      const p = document.createElement("div");
      p.style.margin = "6px 0";
      p.textContent = loc.note;
      card.appendChild(p);
    }

    if (loc.coords) {
      const iframe = document.createElement("iframe");
      iframe.width = "100%";
      iframe.height = "220";
      iframe.style.border = "0";
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer-when-downgrade";
      iframe.src = mapsEmbed(loc.coords);
      card.appendChild(iframe);

      const a = document.createElement("a");
      a.href = mapsOpen(loc.coords);
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Open in Google Maps";
      a.style.display = "inline-block";
      a.style.marginTop = "8px";
      card.appendChild(a);
    }

    wrap.appendChild(card);
  });
}

// ----------------- save -----------------
async function savePlaceNote(place) {
  state.locations.unshift(place);

  try {
    localStorage.setItem("ikey.places.draft", JSON.stringify(state.locations));
  } catch {}

  // Encrypt & persist using existing pipeline
  // await vaultSave("vault", "locations", state.locations);

  renderPlaces();
}

// ----------------- init -----------------
document.addEventListener("DOMContentLoaded", () => {
  const modeRadios = Array.from(document.querySelectorAll('input[name="placeMode"]'));
  const manualRow = document.getElementById("manualCoords");
  const latInput = document.getElementById("latInput");
  const lngInput = document.getElementById("lngInput");
  const titleInput = document.getElementById("titleInput");
  const noteInput = document.getElementById("noteInput");
  const saveBtn = document.getElementById("savePlaceBtn");
  const locationToggle = document.getElementById("locationToggle");
  const locationOptions = document.getElementById("locationOptions");
  const categoryButtons = Array.from(document.querySelectorAll(".category-btn"));
  let selectedCategory = null;

  if (!saveBtn) return;

  const updateModeUI = () => {
    const mode = modeRadios.find(r => r.checked)?.value || "here";
    manualRow.style.display = mode === "manual" ? "flex" : "none";
  };
  modeRadios.forEach(r => r.addEventListener("change", updateModeUI));
  updateModeUI();

  const updateLocationUI = () => {
    locationOptions.style.display = locationToggle.checked ? "block" : "none";
  };
  locationToggle.addEventListener("change", updateLocationUI);
  updateLocationUI();

  categoryButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("selected")) {
        btn.classList.remove("selected");
        selectedCategory = null;
      } else {
        categoryButtons.forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        selectedCategory = btn.dataset.category;
      }
    });
  });

  try {
    const cached = JSON.parse(localStorage.getItem("ikey.places.draft") || "[]");
    if (Array.isArray(cached)) state.locations = cached;
  } catch {}

  saveBtn.addEventListener("click", async () => {
    const title = (titleInput.value || "").trim();
    const note = (noteInput.value || "").trim();
    const includeLocation = locationToggle.checked;

    const reset = () => {
      titleInput.value = "";
      noteInput.value = "";
      latInput.value = "";
      lngInput.value = "";
      categoryButtons.forEach(b => b.classList.remove("selected"));
      selectedCategory = null;
      locationToggle.checked = false;
      updateLocationUI();
    };

    if (includeLocation) {
      const mode = modeRadios.find(r => r.checked)?.value || "here";
      if (mode === "manual") {
        const lat = parseFloat(latInput.value);
        const lng = parseFloat(lngInput.value);
        if (!validLatLng(lat, lng)) {
          alert("Please enter valid coordinates:\n-90 ≤ latitude ≤ 90\n-180 ≤ longitude ≤ 180");
          return;
        }
        const place = {
          id: uid(),
          title,
          note,
          category: selectedCategory,
          type: "coords",
          coords: { lat: round6(lat), lng: round6(lng) },
          createdAt: Date.now()
        };
        await savePlaceNote(place);
        reset();
        return;
      }

      if (!("geolocation" in navigator)) {
        alert("Geolocation not available on this device/browser.");
        return;
      }
      navigator.geolocation.getCurrentPosition(pos => {
        (async () => {
          try {
            const lat = round6(pos.coords.latitude);
            const lng = round6(pos.coords.longitude);
            if (!validLatLng(lat, lng)) {
              alert("Got invalid coordinates from the device.");
              return;
            }
            const place = {
              id: uid(),
              title,
              note,
              category: selectedCategory,
              type: "coords",
              coords: { lat, lng },
              createdAt: Date.now()
            };
            await savePlaceNote(place);
            reset();
          } catch (e) {
            console.error(e);
          }
        })();
      }, err => {
        alert("Couldn't get your location. You can switch to 'Enter coordinates'.");
        console.error(err);
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      return;
    }

    const place = {
      id: uid(),
      title,
      note,
      category: selectedCategory,
      type: "note",
      createdAt: Date.now()
    };
    await savePlaceNote(place);
    reset();
  });

  renderPlaces();
});
