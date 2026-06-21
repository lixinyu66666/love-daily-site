(function () {
  const START_DATE = new Date(2022, 11, 10);
  const PASSWORD = "620725";
  const AUTH_KEY = "ml99-authenticated";
  const DB_NAME = "lq-love-daily";
  const DB_VERSION = 1;
  const STORES = {
    photos: "photos",
    videos: "videos",
  };
  const NOTES_KEY = "lq-love-notes";

  const elements = {
    authGate: document.querySelector("#authGate"),
    authForm: document.querySelector("#authForm"),
    authPassword: document.querySelector("#authPassword"),
    authError: document.querySelector("#authError"),
    appShell: document.querySelector("#appShell"),
    daysTogether: document.querySelector("#daysTogether"),
    daysToMilestone: document.querySelector("#daysToMilestone"),
    milestoneLine: document.querySelector("#milestoneLine"),
    coverSlideImage: document.querySelector("#coverSlideImage"),
    coverSlideCount: document.querySelector("#coverSlideCount"),
    coverSlideTitle: document.querySelector("#coverSlideTitle"),
    photoInput: document.querySelector("#photoInput"),
    videoInput: document.querySelector("#videoInput"),
    photoGallery: document.querySelector("#photoGallery"),
    videoGallery: document.querySelector("#videoGallery"),
    noteForm: document.querySelector("#noteForm"),
    noteType: document.querySelector("#noteType"),
    noteTo: document.querySelector("#noteTo"),
    noteTitle: document.querySelector("#noteTitle"),
    noteBody: document.querySelector("#noteBody"),
    noteList: document.querySelector("#noteList"),
    formStatus: document.querySelector("#formStatus"),
    lightbox: document.querySelector("#lightbox"),
    lightboxImage: document.querySelector("#lightboxImage"),
    lightboxCaption: document.querySelector("#lightboxCaption"),
    closeLightbox: document.querySelector("#closeLightbox"),
    emptyTemplate: document.querySelector("#emptyTemplate"),
  };

  let dbPromise;
  let appStarted = false;
  let coverTimer = null;
  let coverIndex = 0;
  const objectUrls = {
    photos: new Set(),
    videos: new Set(),
  };

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("beforeunload", () => {
    Object.values(objectUrls).forEach((urls) => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    });
  });

  function init() {
    bindAuthEvents();
    if (isAuthenticated()) {
      unlockSite();
    } else {
      elements.authPassword.focus();
    }
  }

  function bindAuthEvents() {
    elements.authForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (elements.authPassword.value === PASSWORD) {
        sessionStorage.setItem(AUTH_KEY, "true");
        elements.authPassword.value = "";
        unlockSite();
        return;
      }

      elements.authError.textContent = "密码不正确。";
      elements.authPassword.select();
    });
  }

  function isAuthenticated() {
    try {
      return sessionStorage.getItem(AUTH_KEY) === "true";
    } catch (error) {
      return false;
    }
  }

  function unlockSite() {
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
    dbPromise = openDatabase();
    bindEvents();
    renderAll();
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
    elements.videoInput.addEventListener("change", () =>
      handleMediaInput(elements.videoInput, STORES.videos)
    );
    elements.noteForm.addEventListener("submit", handleNoteSubmit);
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

    elements.daysTogether.textContent = elapsed.toLocaleString("zh-CN");
    elements.daysToMilestone.textContent = daysLeft.toLocaleString("zh-CN");
    elements.milestoneLine.textContent = isMilestoneToday
      ? `今天就是第 ${targetDay.toLocaleString("zh-CN")} 天，整百天快乐。`
      : `第 ${targetDay.toLocaleString("zh-CN")} 天会在 ${formatDate(
          targetDate
        )} 到来。`;
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

    await Promise.all(
      files.map((file) =>
        addMedia(storeName, {
          blob: file,
          name: file.name || "未命名文件",
          type: file.type,
          size: file.size,
          createdAt: Date.now(),
        })
      )
    );

    if (storeName === STORES.photos) {
      await renderPhotos();
    } else {
      await renderVideos();
    }
  }

  async function addMedia(storeName, item) {
    const db = await dbPromise;
    return runTransaction(db, storeName, "readwrite", (store) => {
      store.add(item);
    });
  }

  async function getAllMedia(storeName) {
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

  async function deleteMedia(storeName, id) {
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
    await Promise.all([renderPhotos(), renderVideos()]);
    renderNotes();
  }

  async function renderPhotos() {
    clearObjectUrls(STORES.photos);
    const photos = await getAllMedia(STORES.photos);
    const photosWithUrls = photos.map((photo) => ({
      ...photo,
      url: createObjectUrl(STORES.photos, photo.blob),
    }));

    renderCoverSlideshow(photosWithUrls);
    elements.photoGallery.innerHTML = "";

    if (!photosWithUrls.length) {
      elements.photoGallery.appendChild(
        createEmptyState("把第一张合照或日常照片放进这里。")
      );
      return;
    }

    photosWithUrls.forEach((photo) => {
      const card = document.createElement("article");
      card.className = "media-card photo-card";
      card.innerHTML = `
        <button class="preview-button" type="button" aria-label="预览 ${escapeHtml(
          photo.name
        )}">
          <img src="${photo.url}" alt="${escapeHtml(photo.name)}" loading="lazy" />
        </button>
        <div class="media-meta">
          <span class="media-title">
            <strong>${escapeHtml(photo.name)}</strong>
            <small>${formatTime(photo.createdAt)}</small>
          </span>
          <button class="icon-button delete-media" type="button" aria-label="删除 ${
            escapeHtml(photo.name)
          }">×</button>
        </div>
      `;

      card.querySelector(".preview-button").addEventListener("click", () => {
        openLightbox(photo.url, photo.name);
      });
      card.querySelector(".delete-media").addEventListener("click", async () => {
        await deleteMedia(STORES.photos, photo.id);
        await renderPhotos();
      });
      elements.photoGallery.appendChild(card);
    });
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

  async function renderVideos() {
    clearObjectUrls(STORES.videos);
    const videos = await getAllMedia(STORES.videos);
    elements.videoGallery.innerHTML = "";

    if (!videos.length) {
      elements.videoGallery.appendChild(
        createEmptyState("上传一段短视频，给这段日常留一点声音和光。")
      );
      return;
    }

    videos.forEach((video) => {
      const url = createObjectUrl(STORES.videos, video.blob);
      const card = document.createElement("article");
      card.className = "media-card video-card";
      card.innerHTML = `
        <video src="${url}" controls preload="metadata"></video>
        <div class="media-meta">
          <span class="media-title">
            <strong>${escapeHtml(video.name)}</strong>
            <small>${formatFileSize(video.size)} · ${formatTime(video.createdAt)}</small>
          </span>
          <button class="icon-button delete-media" type="button" aria-label="删除 ${
            escapeHtml(video.name)
          }">×</button>
        </div>
      `;
      card.querySelector(".delete-media").addEventListener("click", async () => {
        await deleteMedia(STORES.videos, video.id);
        await renderVideos();
      });
      elements.videoGallery.appendChild(card);
    });
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

  function handleNoteSubmit(event) {
    event.preventDefault();
    const body = elements.noteBody.value.trim();
    const title = elements.noteTitle.value.trim();

    if (!body) {
      elements.formStatus.textContent = "先写一点内容再保存。";
      elements.noteBody.focus();
      return;
    }

    const notes = getNotes();
    notes.unshift({
      id: getId(),
      type: elements.noteType.value,
      to: elements.noteTo.value,
      title: title || "没有标题的小记录",
      body,
      createdAt: Date.now(),
    });
    saveNotes(notes);
    elements.noteForm.reset();
    elements.formStatus.textContent = "已保存。";
    window.setTimeout(() => {
      elements.formStatus.textContent = "";
    }, 1800);
    renderNotes();
  }

  function getNotes() {
    try {
      return JSON.parse(localStorage.getItem(NOTES_KEY)) || [];
    } catch (error) {
      return [];
    }
  }

  function saveNotes(notes) {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
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

  function renderNotes() {
    const notes = getNotes();
    elements.noteList.innerHTML = "";

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
          <button class="action-button danger" type="button">删除</button>
        </div>
        <p>${escapeHtml(note.body)}</p>
        <div class="note-meta">${formatTime(note.createdAt)}</div>
      `;
      card.querySelector("button").addEventListener("click", () => {
        saveNotes(notes.filter((item) => item.id !== note.id));
        renderNotes();
      });
      elements.noteList.appendChild(card);
    });
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
