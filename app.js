(function () {
  const START_DATE = new Date(2022, 11, 10);
  const LOCAL_PASSWORD_HASH =
    "bf9df5a155fbd9ca3740da07a8b4875179181107c1687986c29bae3d24b49c50";
  const LOCAL_AUTH_KEY = "ml99-local-authenticated";
  const AUTH_FAILS_KEY = "ml99-auth-fail-count";
  const AUTH_LOCK_UNTIL_KEY = "ml99-auth-lock-until";
  const AUTH_MAX_FAILS = 5;
  const AUTH_LOCK_MS = 60 * 1000;
  const PASSWORD_LENGTH = 6;
  const DB_NAME = "lq-love-daily";
  const DB_VERSION = 1;
  const STORES = {
    photos: "photos",
  };
  const NOTES_KEY = "lq-love-notes";
  const MEDIA_TABLE = "ml99_media";
  const NOTES_TABLE = "ml99_notes";
  const NOTE_NOTIFY_FUNCTION = "notify-note-change";
  const SIGNED_URL_TTL_SECONDS = 12 * 60 * 60;
  const SUPABASE_SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const DEFAULT_CLOUD_CONFIG = {
    url: "",
    anonKey: "",
    authEmail: "",
    mediaBucket: "ml99-media",
    imageMaxEdge: 1800,
    imageQuality: 0.82,
    thumbMaxEdge: 520,
    thumbQuality: 0.76,
  };

  const elements = {
    authGate: document.querySelector("#authGate"),
    authForm: document.querySelector("#authForm"),
    authPassword: document.querySelector("#authPassword"),
    authError: document.querySelector("#authError"),
    authSubmit: document.querySelector("#authSubmit"),
    appShell: document.querySelector("#appShell"),
    daysTogether: document.querySelector("#daysTogether"),
    daysToMilestone: document.querySelector("#daysToMilestone"),
    nextAnniversary: document.querySelector("#nextAnniversary"),
    anniversaryLine: document.querySelector("#anniversaryLine"),
    milestoneLine: document.querySelector("#milestoneLine"),
    coverSlideImage: document.querySelector("#coverSlideImage"),
    coverSlideCount: document.querySelector("#coverSlideCount"),
    coverSlideTitle: document.querySelector("#coverSlideTitle"),
    photoInput: document.querySelector("#photoInput"),
    photoStatus: document.querySelector("#photoStatus"),
    photoGallery: document.querySelector("#photoGallery"),
    noteForm: document.querySelector("#noteForm"),
    noteType: document.querySelector("#noteType"),
    noteTo: document.querySelector("#noteTo"),
    noteTitle: document.querySelector("#noteTitle"),
    noteBody: document.querySelector("#noteBody"),
    noteList: document.querySelector("#noteList"),
    formStatus: document.querySelector("#formStatus"),
    noteSubmitLabel: document.querySelector("#noteSubmitLabel"),
    noteCancelEdit: document.querySelector("#noteCancelEdit"),
    lightbox: document.querySelector("#lightbox"),
    lightboxImage: document.querySelector("#lightboxImage"),
    lightboxCaption: document.querySelector("#lightboxCaption"),
    closeLightbox: document.querySelector("#closeLightbox"),
    emptyTemplate: document.querySelector("#emptyTemplate"),
  };

  const cloud = {
    mode: "local",
    client: null,
    config: { ...DEFAULT_CLOUD_CONFIG },
    initError: "",
  };

  let dbPromise;
  let appStarted = false;
  let coverTimer = null;
  let coverIndex = 0;
  let photoWallTimer = null;
  let editingNote = null;
  const objectUrls = {
    photos: new Set(),
  };

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((error) => {
      console.error(error);
      elements.authError.textContent = "初始化失败，请稍后重试。";
    });
  });

  window.addEventListener("beforeunload", () => {
    Object.values(objectUrls).forEach((urls) => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    });
  });

  async function init() {
    await setupCloudClient();
    clearStoredAuthSession();
    bindAuthEvents();

    elements.authPassword.value = "";
    elements.authPassword.focus();
  }

  async function setupCloudClient() {
    const config = normalizeCloudConfig(globalThis.ML99_SUPABASE_CONFIG);
    cloud.config = config;

    if (!isUsableCloudConfig(config)) {
      cloud.mode = "local";
      return;
    }

    cloud.mode = "cloud";

    if (!globalThis.supabase || typeof globalThis.supabase.createClient !== "function") {
      try {
        await loadSupabaseSdk();
      } catch (error) {
        console.error(error);
        cloud.initError = "云端组件没有加载完成，请刷新页面。";
        return;
      }
    }

    cloud.client = globalThis.supabase.createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

  function loadSupabaseSdk() {
    return new Promise((resolve, reject) => {
      if (globalThis.supabase && typeof globalThis.supabase.createClient === "function") {
        resolve();
        return;
      }

      const existingScript = document.querySelector(
        `script[src="${SUPABASE_SDK_URL}"]`
      );
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = SUPABASE_SDK_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function normalizeCloudConfig(rawConfig) {
    return {
      ...DEFAULT_CLOUD_CONFIG,
      ...(rawConfig || {}),
    };
  }

  function isUsableCloudConfig(config) {
    return Boolean(
      config.url &&
        config.anonKey &&
        config.authEmail &&
        !String(config.url).includes("YOUR_") &&
        !String(config.anonKey).includes("YOUR_")
    );
  }

  function isCloudMode() {
    return cloud.mode === "cloud";
  }

  function bindAuthEvents() {
    elements.authForm.addEventListener("submit", handleAuthSubmit);
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();

    const lockSeconds = getAuthLockSeconds();
    if (lockSeconds > 0) {
      elements.authError.textContent = `尝试次数过多，请 ${lockSeconds} 秒后再试。`;
      return;
    }

    const password = elements.authPassword.value.trim();
    if (!password) {
      elements.authError.textContent = "请输入密码。";
      elements.authPassword.focus();
      return;
    }

    if (!/^\d+$/.test(password) || password.length !== PASSWORD_LENGTH) {
      elements.authError.textContent = `请输入完整 ${PASSWORD_LENGTH} 位密码。`;
      elements.authPassword.select();
      return;
    }

    setAuthBusy(true);
    elements.authError.textContent = "";

    try {
      await signInWithLocalPassword(password);

      if (isCloudMode()) {
        await signInWithCloudPassword(password);
      }

      clearAuthFailures();
      elements.authPassword.value = "";
      await unlockSite();
    } catch (error) {
      console.error(error);
      const lockStarted = registerAuthFailure();
      elements.authError.textContent = lockStarted
        ? "密码不正确，已暂时锁定 60 秒。"
        : getAuthErrorMessage(error);
      elements.authPassword.select();
    } finally {
      if (!appStarted) {
        setAuthBusy(false);
      }
    }
  }

  async function signInWithCloudPassword(password) {
    if (!cloud.client) {
      throw new Error(cloud.initError || "云端配置还没有完成。");
    }

    const { error } = await cloud.client.auth.signInWithPassword({
      email: cloud.config.authEmail,
      password,
    });

    if (error) {
      throw error;
    }
  }

  async function signInWithLocalPassword(password) {
    const inputHash = await sha256(password);
    if (inputHash !== LOCAL_PASSWORD_HASH) {
      throw new Error("密码不正确。");
    }
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function clearStoredAuthSession() {
    try {
      sessionStorage.removeItem(LOCAL_AUTH_KEY);
    } catch (error) {
      // Ignore storage failures; the form still requires the password.
    }

    const projectRef = getSupabaseProjectRef(cloud.config.url);
    if (!projectRef) {
      return;
    }

    try {
      Object.keys(localStorage)
        .filter((key) => key === `sb-${projectRef}-auth-token`)
        .forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      // Ignore storage failures; Supabase is also configured not to persist sessions.
    }
  }

  function getSupabaseProjectRef(url) {
    try {
      return new URL(url).hostname.split(".")[0];
    } catch (error) {
      return "";
    }
  }

  function registerAuthFailure() {
    const failures = readNumber(AUTH_FAILS_KEY) + 1;
    writeNumber(AUTH_FAILS_KEY, failures);

    if (failures >= AUTH_MAX_FAILS) {
      writeNumber(AUTH_LOCK_UNTIL_KEY, Date.now() + AUTH_LOCK_MS);
      writeNumber(AUTH_FAILS_KEY, 0);
      return true;
    }

    return false;
  }

  function clearAuthFailures() {
    writeNumber(AUTH_FAILS_KEY, 0);
    writeNumber(AUTH_LOCK_UNTIL_KEY, 0);
  }

  function getAuthLockSeconds() {
    const lockUntil = readNumber(AUTH_LOCK_UNTIL_KEY);
    const remaining = lockUntil - Date.now();
    if (remaining <= 0) {
      return 0;
    }
    return Math.ceil(remaining / 1000);
  }

  function readNumber(key) {
    try {
      return Number(localStorage.getItem(key)) || 0;
    } catch (error) {
      return 0;
    }
  }

  function writeNumber(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (error) {
      // Ignore storage failures; auth will still rely on Supabase/local hash.
    }
  }

  function getAuthErrorMessage(error) {
    if (isCloudMode()) {
      if (cloud.initError) {
        return cloud.initError;
      }
      if (error.message && error.message !== "密码不正确。") {
        return "密码正确，但云端暂时无法登录，请稍后刷新再试。";
      }
    }

    return error.message || "密码不正确。";
  }

  function setAuthBusy(isBusy) {
    elements.authSubmit.disabled = isBusy;
    elements.authSubmit.querySelector(".button-label").textContent = isBusy
      ? "验证中"
      : "进入";
  }

  async function unlockSite() {
    if (appStarted) {
      return;
    }

    appStarted = true;
    document.body.classList.remove("is-locked");
    elements.authGate.setAttribute("aria-hidden", "true");
    elements.appShell.setAttribute("aria-hidden", "false");
    setDefaultCoverSource();
    renderRelationshipTimer();
    setInterval(renderRelationshipTimer, 60 * 60 * 1000);

    if (!isCloudMode()) {
      dbPromise = openDatabase();
    }

    bindEvents();
    await renderAll();
  }

  function setDefaultCoverSource() {
    const { defaultSrc, defaultSrcset, defaultSizes } =
      elements.coverSlideImage.dataset;
    if (defaultSrcset) {
      elements.coverSlideImage.setAttribute("srcset", defaultSrcset);
    }
    if (defaultSizes) {
      elements.coverSlideImage.setAttribute("sizes", defaultSizes);
    }
    elements.coverSlideImage.src = defaultSrc;
  }

  function bindEvents() {
    elements.photoInput.addEventListener("change", () =>
      handleMediaInput(elements.photoInput, STORES.photos)
    );
    elements.noteForm.addEventListener("submit", handleNoteSubmit);
    elements.noteCancelEdit.addEventListener("click", resetNoteFormState);
    elements.photoGallery.addEventListener("mouseenter", stopPhotoWallAutoplay);
    elements.photoGallery.addEventListener("mouseleave", startPhotoWallAutoplay);
    elements.photoGallery.addEventListener("focusin", stopPhotoWallAutoplay);
    elements.photoGallery.addEventListener("focusout", startPhotoWallAutoplay);
    elements.closeLightbox.addEventListener("click", closeLightbox);
    elements.lightbox.addEventListener("click", (event) => {
      if (event.target === elements.lightbox) {
        closeLightbox();
      }
    });
  }

  function renderRelationshipTimer() {
    const today = startOfDay(new Date());
    const start = startOfDay(START_DATE);
    const elapsed = Math.max(1, daysBetween(start, today) + 1);
    const nextMilestone = Math.ceil(elapsed / 100) * 100;
    const isMilestoneToday = elapsed % 100 === 0;
    const targetDay = isMilestoneToday ? elapsed : nextMilestone;
    const targetDate = addDays(start, targetDay - 1);
    const daysLeft = isMilestoneToday ? 0 : nextMilestone - elapsed;
    const anniversary = getNextAnniversary(today);

    elements.daysTogether.textContent = elapsed.toLocaleString("zh-CN");
    elements.daysToMilestone.textContent = daysLeft.toLocaleString("zh-CN");
    elements.nextAnniversary.textContent = `第 ${anniversary.years.toLocaleString(
      "zh-CN"
    )} 周年`;
    elements.anniversaryLine.textContent = anniversary.daysLeft
      ? `${formatDate(anniversary.date)} · 还有 ${anniversary.daysLeft.toLocaleString(
          "zh-CN"
        )} 天。`
      : `今天就是第 ${anniversary.years.toLocaleString("zh-CN")} 周年。`;
    elements.milestoneLine.textContent = isMilestoneToday
      ? `今天就是第 ${targetDay.toLocaleString("zh-CN")} 天，整百天快乐。`
      : `第 ${targetDay.toLocaleString("zh-CN")} 天会在 ${formatDate(
          targetDate
        )} 到来。`;
  }

  function getNextAnniversary(today) {
    const anniversaryDate = new Date(
      today.getFullYear(),
      START_DATE.getMonth(),
      START_DATE.getDate()
    );

    if (anniversaryDate < today) {
      anniversaryDate.setFullYear(anniversaryDate.getFullYear() + 1);
    }

    return {
      date: anniversaryDate,
      daysLeft: daysBetween(today, anniversaryDate),
      years: Math.max(1, anniversaryDate.getFullYear() - START_DATE.getFullYear()),
    };
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function daysBetween(start, end) {
    return Math.floor((end - start) / 86400000);
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(date);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        Object.values(STORES).forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, {
              keyPath: "id",
              autoIncrement: true,
            });
            store.createIndex("createdAt", "createdAt");
          }
        });
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function handleMediaInput(input, storeName) {
    const files = Array.from(input.files || []);
    input.value = "";

    if (!files.length) {
      return;
    }

    const statusElement = getMediaStatusElement(storeName);
    const label = input.closest(".action-button");
    const actionText = "正在压缩并保存照片";

    input.disabled = true;
    label?.classList.add("is-busy");
    setStatus(statusElement, `${actionText} 1 / ${files.length}...`);

    let savedCount = 0;
    let failedCount = 0;

    for (const [index, file] of files.entries()) {
      setStatus(statusElement, `${actionText} ${index + 1} / ${files.length}...`);
      try {
        await addMedia(storeName, file);
        savedCount += 1;
      } catch (error) {
        failedCount += 1;
        console.error(error);
      }
    }

    input.disabled = false;
    label?.classList.remove("is-busy");

    if (savedCount) {
      setStatus(
        statusElement,
        failedCount
          ? `已保存 ${savedCount} 个，${failedCount} 个失败。`
          : `已保存 ${savedCount} 个。`
      );
    } else {
      setStatus(statusElement, getMediaSaveError(storeName), true);
    }

    await renderPhotos();

    window.setTimeout(() => {
      clearStatus(statusElement);
    }, 2400);
  }

  function getMediaStatusElement(storeName) {
    return storeName === STORES.photos ? elements.photoStatus : null;
  }

  function getMediaSaveError(storeName) {
    return "保存失败，请换一张浏览器可读取的照片。";
  }

  async function addMedia(storeName, file) {
    if (storeName === STORES.photos) {
      return addPhoto(file);
    }
    throw new Error("不支持的媒体类型。");
  }

  async function addPhoto(file) {
    const imageSet = await compressImage(file);

    if (isCloudMode()) {
      return addCloudPhoto(file, imageSet);
    }

    return addLocalMedia(STORES.photos, {
      blob: imageSet.photoBlob,
      thumbBlob: imageSet.thumbBlob,
      name: file.name || "未命名照片",
      type: imageSet.photoBlob.type,
      size: imageSet.photoBlob.size,
      originalSize: file.size,
      width: imageSet.width,
      height: imageSet.height,
      createdAt: Date.now(),
    });
  }

  async function compressImage(file) {
    const image = await loadImage(file);

    try {
      const photoSize = fitWithin(
        image.naturalWidth,
        image.naturalHeight,
        cloud.config.imageMaxEdge
      );
      const thumbSize = fitWithin(
        image.naturalWidth,
        image.naturalHeight,
        cloud.config.thumbMaxEdge
      );

      const photoBlob = await drawImageToBlob(
        image,
        photoSize,
        cloud.config.imageQuality
      );
      const thumbBlob = await drawImageToBlob(
        image,
        thumbSize,
        cloud.config.thumbQuality
      );

      return {
        photoBlob,
        thumbBlob,
        width: photoSize.width,
        height: photoSize.height,
        thumbWidth: thumbSize.width,
        thumbHeight: thumbSize.height,
      };
    } finally {
      URL.revokeObjectURL(image.dataset.objectUrl);
    }
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.dataset.objectUrl = url;
      image.onload = () => resolve(image);
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("图片读取失败。"));
      };
      image.src = url;
    });
  }

  function fitWithin(width, height, maxEdge) {
    const edge = Math.max(1, Number(maxEdge) || DEFAULT_CLOUD_CONFIG.imageMaxEdge);
    const scale = Math.min(1, edge / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  async function drawImageToBlob(image, size, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext("2d", {
      alpha: true,
      desynchronized: true,
    });
    context.drawImage(image, 0, 0, size.width, size.height);

    const webpBlob = await canvasToBlob(canvas, "image/webp", quality);
    if (webpBlob) {
      return webpBlob;
    }

    const jpegBlob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (jpegBlob) {
      return jpegBlob;
    }

    throw new Error("图片压缩失败。");
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      canvas.toBlob(resolve, type, quality);
    });
  }

  async function addCloudPhoto(file, imageSet) {
    ensureCloudClient();

    const id = getUuid();
    const extension = imageSet.photoBlob.type === "image/jpeg" ? "jpg" : "webp";
    const photoPath = `photos/${id}.${extension}`;
    const thumbPath = `thumbs/${id}.${extension}`;
    const uploadedPaths = [];

    try {
      await uploadCloudFile(photoPath, imageSet.photoBlob);
      uploadedPaths.push(photoPath);
      await uploadCloudFile(thumbPath, imageSet.thumbBlob);
      uploadedPaths.push(thumbPath);

      const { error } = await cloud.client.from(MEDIA_TABLE).insert({
        id,
        kind: "photo",
        title: file.name || "未命名照片",
        storage_path: photoPath,
        thumb_path: thumbPath,
        mime_type: imageSet.photoBlob.type,
        byte_size: imageSet.photoBlob.size,
        original_byte_size: file.size,
        width: imageSet.width,
        height: imageSet.height,
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      await removeCloudFiles(uploadedPaths);
      throw error;
    }
  }

  async function uploadCloudFile(path, file) {
    const { error } = await cloud.client.storage
      .from(cloud.config.mediaBucket)
      .upload(path, file, {
        cacheControl: "31536000",
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (error) {
      throw error;
    }
  }

  async function getAllMedia(storeName) {
    if (isCloudMode()) {
      return getCloudMedia(storeName);
    }
    return getLocalMedia(storeName);
  }

  async function getCloudMedia(storeName) {
    ensureCloudClient();
    const kind = "photo";
    const { data, error } = await cloud.client
      .from(MEDIA_TABLE)
      .select("*")
      .eq("kind", kind)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return Promise.all((data || []).map((row) => mapCloudMediaRow(row)));
  }

  async function mapCloudMediaRow(row) {
    const url = await getSignedUrl(row.storage_path);
    const thumbUrl = row.thumb_path ? await getSignedUrl(row.thumb_path) : url;

    return {
      id: row.id,
      name: row.title || "未命名文件",
      type: row.mime_type,
      size: row.byte_size,
      originalSize: row.original_byte_size,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
      storagePath: row.storage_path,
      thumbPath: row.thumb_path,
      url,
      thumbUrl,
    };
  }

  async function getSignedUrl(path) {
    const { data, error } = await cloud.client.storage
      .from(cloud.config.mediaBucket)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error) {
      throw error;
    }

    return data.signedUrl;
  }

  async function deleteMedia(storeName, item) {
    if (isCloudMode()) {
      return deleteCloudMedia(item);
    }
    return deleteLocalMedia(storeName, item.id);
  }

  async function deleteCloudMedia(item) {
    ensureCloudClient();
    await removeCloudFiles([item.storagePath, item.thumbPath].filter(Boolean));

    const { error } = await cloud.client.from(MEDIA_TABLE).delete().eq("id", item.id);
    if (error) {
      throw error;
    }
  }

  async function removeCloudFiles(paths) {
    if (!paths.length || !cloud.client) {
      return;
    }

    const { error } = await cloud.client.storage
      .from(cloud.config.mediaBucket)
      .remove(paths);

    if (error) {
      throw error;
    }
  }

  async function addLocalMedia(storeName, item) {
    const db = await dbPromise;
    return runTransaction(db, storeName, "readwrite", (store) => {
      store.add(item);
    });
  }

  async function getLocalMedia(storeName) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result || [];
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteLocalMedia(storeName, id) {
    const db = await dbPromise;
    await runTransaction(db, storeName, "readwrite", (store) => {
      store.delete(id);
    });
  }

  function runTransaction(db, storeName, mode, task) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      task(store);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async function renderAll() {
    await Promise.all([renderPhotos(), renderNotes()]);
  }

  async function renderPhotos() {
    clearObjectUrls(STORES.photos);
    stopPhotoWallAutoplay();
    elements.photoGallery.innerHTML = "";

    try {
      const photos = (await getAllMedia(STORES.photos)).map((photo) =>
        attachDisplayUrls(STORES.photos, photo)
      );

      if (!photos.length) {
        elements.photoGallery.appendChild(
          createEmptyState("把第一张合照或日常照片放进这里。")
        );
        return;
      }

      photos.forEach((photo) => {
        const card = document.createElement("article");
        card.className = "media-card photo-card";
        applyPhotoCardSizing(card, photo);
        card.innerHTML = `
          <button class="preview-button" type="button" aria-label="预览 ${escapeHtml(
            photo.name
          )}">
            <img src="${photo.thumbUrl || photo.url}" alt="${escapeHtml(
              photo.name
            )}" loading="lazy" />
          </button>
          <div class="media-meta">
            <span class="media-title">
              <strong>${escapeHtml(photo.name)}</strong>
              <small>${formatFileSize(photo.size)} · ${formatTime(
                photo.createdAt
              )}</small>
            </span>
            <div class="media-actions">
              <button class="action-button danger delete-media" type="button">删除</button>
            </div>
          </div>
        `;

        card.querySelector(".preview-button").addEventListener("click", () => {
          openLightbox(photo.url, photo.name);
        });
        card.querySelector(".delete-media").addEventListener("click", async () => {
          await handleDeleteMedia({
            storeName: STORES.photos,
            item: photo,
            label: "照片",
            statusElement: elements.photoStatus,
            renderAfterDelete: renderPhotos,
            button: card.querySelector(".delete-media"),
          });
        });
        elements.photoGallery.appendChild(card);
      });

      startPhotoWallAutoplay();
    } catch (error) {
      console.error(error);
      elements.photoGallery.appendChild(
        createEmptyState("照片暂时加载失败，请检查云端配置。")
      );
      setStatus(elements.photoStatus, "照片加载失败，请检查 Supabase 设置。", true);
    }
  }

  function applyPhotoCardSizing(card, photo) {
    const width = Number(photo.width);
    const height = Number(photo.height);

    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return;
    }

    const ratio = width / height;
    const visibleRatio = clampValue(ratio, 0.68, 1.55);
    const cardWidth = Math.round(clampValue(230 * visibleRatio, 190, 330));
    card.style.setProperty("--photo-card-width", `${cardWidth}px`);
  }

  function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function attachDisplayUrls(storeName, item) {
    if (isCloudMode()) {
      return item;
    }

    const url = createObjectUrl(storeName, item.blob);
    const thumbUrl = item.thumbBlob ? createObjectUrl(storeName, item.thumbBlob) : url;
    return {
      ...item,
      url,
      thumbUrl,
    };
  }

  function renderCoverSlideshow(photos) {
    stopCoverTimer();

    if (!photos.length) {
      coverIndex = 0;
      setCoverSlide({
        name: "ML99",
        url: elements.coverSlideImage.dataset.defaultSrc,
        srcset: elements.coverSlideImage.dataset.defaultSrcset,
        sizes: elements.coverSlideImage.dataset.defaultSizes,
        position: "Photo Wall",
      });
      return;
    }

    coverIndex = Math.min(coverIndex, photos.length - 1);
    showCoverPhoto(photos, coverIndex);

    if (photos.length > 1) {
      coverTimer = window.setInterval(() => {
        coverIndex = (coverIndex + 1) % photos.length;
        showCoverPhoto(photos, coverIndex);
      }, 4200);
    }
  }

  function showCoverPhoto(photos, index) {
    const photo = photos[index];
    setCoverSlide({
      name: photo.name,
      url: photo.url,
      position: `${index + 1} / ${photos.length}`,
    });
  }

  function setCoverSlide(slide) {
    elements.coverSlideImage.classList.remove("is-visible");
    window.setTimeout(() => {
      if (slide.srcset) {
        elements.coverSlideImage.setAttribute("srcset", slide.srcset);
      } else {
        elements.coverSlideImage.removeAttribute("srcset");
      }
      if (slide.sizes) {
        elements.coverSlideImage.setAttribute("sizes", slide.sizes);
      } else {
        elements.coverSlideImage.removeAttribute("sizes");
      }
      elements.coverSlideImage.src = slide.url;
      elements.coverSlideImage.alt = slide.name;
      elements.coverSlideCount.textContent = slide.position;
      elements.coverSlideTitle.textContent = slide.name;
      elements.coverSlideImage.classList.add("is-visible");
    }, 160);
  }

  function stopCoverTimer() {
    if (coverTimer) {
      window.clearInterval(coverTimer);
      coverTimer = null;
    }
  }

  async function handleDeleteMedia({
    storeName,
    item,
    label,
    statusElement,
    renderAfterDelete,
    button,
  }) {
    if (!confirm(`确定删除这${label === "照片" ? "张" : "个"}${label}吗？`)) {
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "删除中";
    setStatus(statusElement, `正在删除${label}...`);

    try {
      await deleteMedia(storeName, item);
      setStatus(statusElement, `已删除${label}。`);
      await renderAfterDelete();
      window.setTimeout(() => clearStatus(statusElement), 1600);
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.textContent = originalText;
      setStatus(statusElement, `${label}删除失败，请稍后再试。`, true);
    }
  }

  function startPhotoWallAutoplay() {
    stopPhotoWallAutoplay();

    if (!elements.photoGallery || elements.photoGallery.children.length <= 1) {
      return;
    }

    photoWallTimer = window.setInterval(() => {
      const cards = Array.from(
        elements.photoGallery.querySelectorAll(".photo-card")
      );
      if (
        !cards.length ||
        elements.photoGallery.scrollWidth <= elements.photoGallery.clientWidth
      ) {
        stopPhotoWallAutoplay();
        return;
      }

      const galleryLeft = elements.photoGallery.getBoundingClientRect().left;
      const currentLeft = elements.photoGallery.scrollLeft;
      const maxLeft =
        elements.photoGallery.scrollWidth - elements.photoGallery.clientWidth;
      const nextCard = cards.find((card) => {
        const cardLeft =
          card.getBoundingClientRect().left - galleryLeft + currentLeft;
        return cardLeft > currentLeft + 8;
      });
      const nextLeft = nextCard
        ? nextCard.getBoundingClientRect().left - galleryLeft + currentLeft
        : 0;

      elements.photoGallery.scrollTo({
        left: Math.min(nextLeft, maxLeft),
        behavior: "smooth",
      });
    }, 3600);
  }

  function stopPhotoWallAutoplay() {
    if (photoWallTimer) {
      window.clearInterval(photoWallTimer);
      photoWallTimer = null;
    }
  }

  function createObjectUrl(storeName, blob) {
    const url = URL.createObjectURL(blob);
    objectUrls[storeName].add(url);
    return url;
  }

  function clearObjectUrls(storeName) {
    objectUrls[storeName].forEach((url) => URL.revokeObjectURL(url));
    objectUrls[storeName].clear();
  }

  function createEmptyState(message) {
    const node = elements.emptyTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("p").textContent = message;
    return node;
  }

  function openLightbox(url, caption) {
    elements.lightboxImage.src = url;
    elements.lightboxImage.alt = caption;
    elements.lightboxCaption.textContent = caption;
    if (typeof elements.lightbox.showModal === "function") {
      elements.lightbox.showModal();
    }
  }

  function closeLightbox() {
    if (elements.lightbox.open) {
      elements.lightbox.close();
    }
    elements.lightboxImage.removeAttribute("src");
  }

  async function handleNoteSubmit(event) {
    event.preventDefault();
    const body = elements.noteBody.value.trim();
    const title = elements.noteTitle.value.trim();

    if (!body) {
      elements.formStatus.textContent = "先写一点内容再保存。";
      elements.noteBody.focus();
      return;
    }

    setStatus(elements.formStatus, "正在保存...");

    try {
      const noteInput = {
        id: editingNote?.id || getId(),
        type: elements.noteType.value,
        to: elements.noteTo.value,
        title: title || "没有标题的小记录",
        body,
        createdAt: editingNote?.createdAt || Date.now(),
      };
      const action = editingNote ? "updated" : "created";
      const previousNote = editingNote ? { ...editingNote } : null;
      const savedNote = editingNote
        ? await updateNote(noteInput)
        : await addNote(noteInput);
      const notification = await notifyNoteChange(action, savedNote, previousNote);
      resetNoteFormState();
      setStatus(
        elements.formStatus,
        notification.ok
          ? getNoteSuccessMessage(action)
          : `${getNoteSuccessMessage(action)}微信提醒未发送。`,
        !notification.ok
      );
      await renderNotes();
      window.setTimeout(() => {
        clearStatus(elements.formStatus);
      }, 1800);
    } catch (error) {
      console.error(error);
      setStatus(elements.formStatus, "保存失败，请检查云端配置。", true);
    }
  }

  async function addNote(note) {
    if (isCloudMode()) {
      ensureCloudClient();
      const id = getUuid();
      const { data, error } = await cloud.client
        .from(NOTES_TABLE)
        .insert({
          id,
          note_type: note.type,
          note_to: note.to,
          title: note.title,
          body: note.body,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }
      return mapCloudNoteRow(data);
    }

    const notes = getLocalNotes();
    notes.unshift(note);
    saveLocalNotes(notes);
    return note;
  }

  async function updateNote(note) {
    if (isCloudMode()) {
      ensureCloudClient();
      const { data, error } = await cloud.client
        .from(NOTES_TABLE)
        .update({
          note_type: note.type,
          note_to: note.to,
          title: note.title,
          body: note.body,
        })
        .eq("id", note.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }
      return mapCloudNoteRow(data);
    }

    const notes = getLocalNotes().map((item) =>
      item.id === note.id ? { ...item, ...note } : item
    );
    saveLocalNotes(notes);
    return notes.find((item) => item.id === note.id) || note;
  }

  function mapCloudNoteRow(note) {
    return {
      id: note.id,
      type: note.note_type,
      to: note.note_to,
      title: note.title,
      body: note.body,
      createdAt: note.created_at,
    };
  }

  async function notifyNoteChange(action, note, previousNote = null) {
    if (!isCloudMode()) {
      return { ok: true, skipped: true };
    }

    try {
      ensureCloudClient();
      const { data, error } = await cloud.client.functions.invoke(
        NOTE_NOTIFY_FUNCTION,
        {
          body: {
            action,
            note,
            previousNote,
          },
        }
      );

      if (error) {
        throw error;
      }

      return data && data.ok === false ? data : { ok: true, data };
    } catch (error) {
      console.warn("微信提醒发送失败", error);
      return { ok: false, error };
    }
  }

  function getNoteSuccessMessage(action) {
    if (action === "updated") {
      return "已更新。";
    }
    if (action === "deleted") {
      return "已删除。";
    }
    return "已保存。";
  }

  function resetNoteFormState() {
    editingNote = null;
    elements.noteForm.reset();
    elements.noteSubmitLabel.textContent = "保存";
    elements.noteCancelEdit.classList.add("is-hidden");
  }

  function startEditNote(note) {
    editingNote = { ...note };
    elements.noteType.value = note.type;
    elements.noteTo.value = note.to;
    elements.noteTitle.value = note.title;
    elements.noteBody.value = note.body;
    elements.noteSubmitLabel.textContent = "更新";
    elements.noteCancelEdit.classList.remove("is-hidden");
    setStatus(elements.formStatus, "正在修改这条日志。");
    elements.noteForm.scrollIntoView({ behavior: "smooth", block: "start" });
    elements.noteBody.focus();
  }

  async function getNotes() {
    if (isCloudMode()) {
      ensureCloudClient();
      const { data, error } = await cloud.client
        .from(NOTES_TABLE)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []).map((note) => mapCloudNoteRow(note));
    }

    return getLocalNotes();
  }

  async function deleteNote(id) {
    if (isCloudMode()) {
      ensureCloudClient();
      const { error } = await cloud.client.from(NOTES_TABLE).delete().eq("id", id);
      if (error) {
        throw error;
      }
      return;
    }

    saveLocalNotes(getLocalNotes().filter((item) => item.id !== id));
  }

  function getLocalNotes() {
    try {
      return JSON.parse(localStorage.getItem(NOTES_KEY)) || [];
    } catch (error) {
      return [];
    }
  }

  function saveLocalNotes(notes) {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  }

  async function renderNotes() {
    elements.noteList.innerHTML = "";

    try {
      const notes = await getNotes();

      if (!notes.length) {
        elements.noteList.appendChild(
          createEmptyState("第一条日志或留言，会让这里开始有时间的重量。")
        );
        return;
      }

      notes.forEach((note) => {
        const card = document.createElement("article");
        card.className = "note-card";
        card.innerHTML = `
          <div class="note-top">
            <div>
              <span class="note-chip">${escapeHtml(note.type)} · 给 ${escapeHtml(
                note.to
              )}</span>
              <h3>${escapeHtml(note.title)}</h3>
            </div>
            <div class="note-actions">
              <button class="action-button secondary edit-note" type="button">修改</button>
              <button class="action-button danger delete-note" type="button">删除</button>
            </div>
          </div>
          <p>${escapeHtml(note.body)}</p>
          <div class="note-meta">${formatTime(note.createdAt)}</div>
        `;
        card.querySelector(".edit-note").addEventListener("click", () => {
          startEditNote(note);
        });
        card.querySelector(".delete-note").addEventListener("click", async () => {
          await handleDeleteNote(note, card.querySelector(".delete-note"));
        });
        elements.noteList.appendChild(card);
      });
    } catch (error) {
      console.error(error);
      elements.noteList.appendChild(
        createEmptyState("日志和留言暂时加载失败，请检查云端配置。")
      );
      setStatus(elements.formStatus, "加载失败，请检查 Supabase 设置。", true);
    }
  }

  async function handleDeleteNote(note, button) {
    if (!confirm("确定删除这条日志或留言吗？")) {
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "删除中";
    setStatus(elements.formStatus, "正在删除...");

    try {
      await deleteNote(note.id);
      const notification = await notifyNoteChange("deleted", note);
      if (editingNote?.id === note.id) {
        resetNoteFormState();
      }
      setStatus(
        elements.formStatus,
        notification.ok ? "已删除。" : "已删除。微信提醒未发送。",
        !notification.ok
      );
      await renderNotes();
      window.setTimeout(() => clearStatus(elements.formStatus), 1600);
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.textContent = originalText;
      setStatus(elements.formStatus, "删除失败，请稍后再试。", true);
    }
  }

  function setStatus(element, message, isError = false) {
    if (!element) {
      return;
    }
    element.textContent = message;
    element.classList.toggle("is-error", isError);
  }

  function clearStatus(element) {
    if (!element) {
      return;
    }
    element.textContent = "";
    element.classList.remove("is-error");
  }

  function ensureCloudClient() {
    if (!cloud.client) {
      throw new Error(cloud.initError || "云端配置还没有完成。");
    }
  }

  function getId() {
    if (
      globalThis.crypto &&
      typeof globalThis.crypto.randomUUID === "function"
    ) {
      return globalThis.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getUuid() {
    if (
      globalThis.crypto &&
      typeof globalThis.crypto.randomUUID === "function"
    ) {
      return globalThis.crypto.randomUUID();
    }

    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
      (
        Number(char) ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(char) / 4)))
      ).toString(16)
    );
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function formatFileSize(size) {
    if (!Number.isFinite(size)) {
      return "未知大小";
    }
    if (size < 1024 * 1024) {
      return `${Math.max(1, Math.round(size / 1024))} KB`;
    }
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
