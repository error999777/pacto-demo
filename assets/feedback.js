"use strict";

const feedbackDialog = $("feedback-dialog");
const maxFeedbackImage = 4 * 1024 * 1024;
const feedbackPages = {queue: "Нужны действия", clients: "Клиенты", results: "Аналитика", team: "Команда", settings: "Настройки"};
const demoFeedback = [];
const feedbackFields = ["x", "y", "width", "height"];
let imageOriginal;
let imageAttached;
let crop;
let dragging;
let feedbackView = "write";
let feedbackPage;
let feedbackSequence = 0;
let inboxSequence = 0;
let sendingFeedback = false;
let preparingAttachment = false;

function feedbackMessage(text) {
  $("feedback-status").textContent = text;
}

function updateFeedbackSend() {
  $("feedback-send").disabled = Boolean(crop || preparingAttachment || sendingFeedback);
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function prepareImage(source, width, height) {
  if (width <= 0 || height <= 0) throw new Error("Не удалось прочитать изображение.");
  const ratio = Math.min(1, 1800 / Math.max(width, height));
  const canvas = makeCanvas(Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio)));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function setAttachment(canvas) {
  imageOriginal = imageAttached = canvas;
  endCrop();
  renderFeedbackImage();
}

function renderFeedbackImage() {
  $("feedback-preview").hidden = !imageAttached;
  $("feedback-undo").hidden = imageAttached === imageOriginal;
  const canvas = $("feedback-canvas");
  canvas.width = imageAttached?.width || 1;
  canvas.height = imageAttached?.height || 1;
  if (imageAttached) canvas.getContext("2d").drawImage(imageAttached, 0, 0);
}

function updateCrop() {
  const guide = $("feedback-selection");
  if (!crop) return;
  for (const [key, dimension] of [["x", "width"], ["y", "height"], ["width", "width"], ["height", "height"]]) {
    guide.style.setProperty("--" + key, (crop[key] / imageAttached[dimension] * 100) + "%");
    $("feedback-" + key).value = crop[key];
  }
}

function beginCrop() {
  if (!imageAttached) return;
  crop = {x: 0, y: 0, width: imageAttached.width, height: imageAttached.height};
  $("feedback-image").dataset.cropping = "true";
  $("feedback-selection").hidden = false;
  $("feedback-crop-controls").hidden = false;
  $("feedback-image-actions").hidden = true;
  updateFeedbackSend();
  updateCrop();
  $("feedback-x").focus({preventScroll: true});
}

function endCrop() {
  crop = dragging = undefined;
  delete $("feedback-image").dataset.cropping;
  $("feedback-selection").hidden = true;
  $("feedback-crop-controls").hidden = true;
  $("feedback-image-actions").hidden = false;
  updateFeedbackSend();
}

function readCrop() {
  if (!imageAttached || !crop) return null;
  const values = Object.fromEntries(feedbackFields.map(key => [key, $("feedback-" + key).valueAsNumber]));
  if (!Object.values(values).every(Number.isInteger)) return null;
  if (values.x < 0 || values.y < 0 || values.width < 1 || values.height < 1 ||
      values.x + values.width > imageAttached.width || values.y + values.height > imageAttached.height) return null;
  return values;
}

function cropPoint(event) {
  const bounds = $("feedback-canvas").getBoundingClientRect();
  const x = Math.round((event.clientX - bounds.left) / bounds.width * imageAttached.width);
  const y = Math.round((event.clientY - bounds.top) / bounds.height * imageAttached.height);
  return {x: Math.max(0, Math.min(imageAttached.width, x)), y: Math.max(0, Math.min(imageAttached.height, y))};
}

$("feedback-image").addEventListener("pointerdown", event => {
  if (!crop || dragging || event.button !== 0) return;
  const point = cropPoint(event);
  dragging = {...point, pointerId: event.pointerId};
  $("feedback-image").setPointerCapture(event.pointerId);
});

function moveCrop(event) {
  if (!dragging || dragging.pointerId !== event.pointerId || !crop) return;
  const point = cropPoint(event);
  if (point.x === dragging.x || point.y === dragging.y) return;
  crop = {
    x: Math.min(point.x, dragging.x), y: Math.min(point.y, dragging.y),
    width: Math.abs(point.x - dragging.x), height: Math.abs(point.y - dragging.y)
  };
  updateCrop();
}

$("feedback-image").addEventListener("pointermove", moveCrop);
$("feedback-image").addEventListener("pointerup", event => {
  moveCrop(event);
  dragging = undefined;
});
$("feedback-image").addEventListener("lostpointercapture", () => { dragging = undefined; });
$("feedback-crop-controls").addEventListener("input", event => {
  if (event.target.tagName !== "INPUT") return;
  const area = readCrop();
  if (area) {
    crop = area;
    updateCrop();
    feedbackMessage("");
  }
});

$("feedback-crop").addEventListener("click", beginCrop);
$("feedback-cancel-crop").addEventListener("click", () => { endCrop(); $("feedback-crop").focus(); });
$("feedback-apply").addEventListener("click", () => {
  const area = readCrop();
  if (!area) { feedbackMessage("Область должна помещаться внутри снимка."); return; }
  const canvas = makeCanvas(area.width, area.height);
  canvas.getContext("2d").drawImage(imageAttached, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  imageAttached = canvas;
  endCrop();
  renderFeedbackImage();
  $("feedback-crop").focus();
  feedbackMessage("Во вложении осталась выделенная область.");
});
$("feedback-undo").addEventListener("click", () => {
  imageAttached = imageOriginal;
  endCrop();
  renderFeedbackImage();
  $("feedback-crop").focus();
  feedbackMessage("Исходное изображение восстановлено.");
});
$("feedback-remove").addEventListener("click", () => {
  setAttachment(undefined);
  $("feedback-pick").focus();
  feedbackMessage("Изображение убрано.");
});

$("feedback-pick").addEventListener("click", () => $("feedback-file").click());
$("feedback-file").addEventListener("change", async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024) {
    feedbackMessage("Выберите PNG, JPEG или WebP размером до 12 МБ.");
    return;
  }
  const sequence = ++feedbackSequence;
  preparingAttachment = true;
  updateFeedbackSend();
  feedbackMessage("Открываем изображение…");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (sequence === feedbackSequence && feedbackDialog.open) {
      setAttachment(prepareImage(image, image.naturalWidth, image.naturalHeight));
      feedbackMessage("Изображение прикреплено.");
    }
  } catch {
    if (sequence === feedbackSequence) feedbackMessage("Не удалось открыть фото. Выберите другой файл.");
  } finally {
    URL.revokeObjectURL(url);
    if (sequence === feedbackSequence) {
      preparingAttachment = false;
      updateFeedbackSend();
    }
  }
});

function canCaptureScreen() {
  return typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

function playCapture(video) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Кадр не получен.")), 3000);
  });
  return Promise.race([video.play(), timeout]).finally(() => clearTimeout(timer));
}

$("feedback-capture").addEventListener("click", async () => {
  const sequence = ++feedbackSequence;
  const button = $("feedback-capture");
  const video = document.createElement("video");
  video.muted = true;
  let stream;
  preparingAttachment = true;
  updateFeedbackSend();
  button.disabled = true;
  feedbackDialog.dataset.capturing = "true";
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({video: true, audio: false, selfBrowserSurface: "include"});
    if (sequence !== feedbackSequence || !feedbackDialog.open) return;
    video.srcObject = stream;
    await playCapture(video);
    if (sequence === feedbackSequence && feedbackDialog.open) {
      setAttachment(prepareImage(video, video.videoWidth, video.videoHeight));
      feedbackMessage("Снимок готов. При желании выделите нужную область.");
    }
  } catch (error) {
    if (sequence === feedbackSequence && feedbackDialog.open) {
      feedbackMessage(error.name === "NotAllowedError" ? "Захват отменён. Можно приложить готовый скриншот."
        : "Не удалось получить кадр. Приложите готовый скриншот.");
    }
  } finally {
    stream?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    delete feedbackDialog.dataset.capturing;
    button.disabled = false;
    if (sequence === feedbackSequence) {
      preparingAttachment = false;
      updateFeedbackSend();
    }
    if (feedbackDialog.open) button.focus({preventScroll: true});
  }
});

function canvasBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Не удалось подготовить изображение.")), "image/png"));
}

async function attachmentData(canvas) {
  if (!canvas) return null;
  let blob = await canvasBlob(canvas);
  while (blob.size > maxFeedbackImage) {
    const smaller = makeCanvas(Math.max(1, Math.floor(canvas.width * .8)), Math.max(1, Math.floor(canvas.height * .8)));
    smaller.getContext("2d").drawImage(canvas, 0, 0, smaller.width, smaller.height);
    canvas = smaller;
    blob = await canvasBlob(canvas);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result.split(",", 2)[1]));
    reader.addEventListener("error", () => reject(new Error("Не удалось подготовить изображение.")));
    reader.readAsDataURL(blob);
  });
}

function feedbackRow(item) {
  const image = item.has_image ? `<details class="feedback-inbox-image">
      <summary>Открыть вложение</summary>
      <img src="${preview ? "data:image/png;base64," + esc(item.image) : "/api/feedback/" + esc(item.id) + "/image"}"
        loading="lazy" alt="Изображение к обращению">
    </details>` : "";
  return `<article class="feedback-entry work-panel">
    <div class="row-head"><strong>${esc(item.author_name)}</strong>
      <span class="tag status-chip" data-tone="${item.viewed_at ? "neutral" : "info"}">${item.viewed_at ? "Просмотрено" : "Новое"}</span></div>
    <p class="small muted">${esc(feedbackPages[item.page])} · ${esc(date(item.created_at))}</p>
    <p class="feedback-entry-message">${esc(item.message)}</p>${image}
    ${!item.viewed_at ? `<button type="button" data-feedback-viewed="${esc(item.id)}">Отметить просмотренным</button>` : ""}
  </article>`;
}

async function loadFeedbackInbox(before = null) {
  const sequence = ++inboxSequence;
  const inbox = $("feedback-inbox");
  if (!before) inbox.innerHTML = '<p class="muted">Загружаем обращения…</p>';
  try {
    const result = preview
      ? {items: [...demoFeedback].reverse(), next: null}
      : await api("/api/feedback" + (before ? "?before=" + before : ""));
    if (sequence !== inboxSequence || feedbackView !== "inbox" || !feedbackDialog.open) return;
    const list = result.items.map(feedbackRow).join("") || '<p class="empty">Обращений пока нет.</p>';
    const more = result.next ? `<button type="button" data-feedback-more="${result.next}">Показать ещё</button>` : "";
    if (before) {
      inbox.querySelector("[data-feedback-more]")?.remove();
      inbox.insertAdjacentHTML("beforeend", list + more);
    } else inbox.innerHTML = list + more;
  } catch (error) {
    if (sequence === inboxSequence) inbox.innerHTML = '<p class="muted">Не удалось загрузить обращения.</p><button type="button" data-feedback-reload>Повторить</button>';
  }
}

function switchFeedbackTab(tab) {
  if (tab === "inbox" && data.role !== "lead") return;
  feedbackView = tab;
  $("feedback-form").hidden = tab !== "write";
  $("feedback-inbox").hidden = tab !== "inbox";
  for (const button of $("feedback-tabs").querySelectorAll("[data-feedback-tab]")) {
    button.setAttribute("aria-pressed", String(button.dataset.feedbackTab === tab));
  }
  feedbackMessage("");
  if (tab === "inbox") loadFeedbackInbox();
}

$("open-feedback").addEventListener("click", () => {
  feedbackPage = view;
  $("feedback-tabs").hidden = data.role !== "lead";
  $("feedback-demo-hint").hidden = !preview;
  $("feedback-capture").hidden = !canCaptureScreen();
  $("feedback-capture-help").hidden = canCaptureScreen();
  switchFeedbackTab("write");
  feedbackDialog.showModal();
  $("feedback-message").focus();
});
$("close-feedback").addEventListener("click", () => feedbackDialog.close());
feedbackDialog.addEventListener("cancel", event => { if (sendingFeedback) event.preventDefault(); });
feedbackDialog.addEventListener("close", () => {
  feedbackSequence++;
  inboxSequence++;
  preparingAttachment = false;
  setAttachment(undefined);
  $("feedback-message").value = "";
  $("feedback-inbox").replaceChildren();
  feedbackMessage("");
});
$("feedback-tabs").addEventListener("click", event => {
  const button = event.target.closest("[data-feedback-tab]");
  if (button) switchFeedbackTab(button.dataset.feedbackTab);
});

$("feedback-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (sendingFeedback || preparingAttachment || crop) return;
  const message = $("feedback-message").value.trim();
  if (!message) { feedbackMessage("Опишите, что случилось."); $("feedback-message").focus(); return; }
  const button = event.submitter;
  sendingFeedback = true;
  $("close-feedback").disabled = true;
  $("feedback-tabs").inert = true;
  feedbackMessage("Сохраняем обращение…");
  try {
    await run(button, async () => {
      const image = await attachmentData(imageAttached);
      const payload = {message, page: feedbackPage, image};
      if (preview) {
        demoFeedback.push({...payload, id: crypto.randomUUID(), author_name: data.name, created_at: new Date().toISOString(), has_image: Boolean(image)});
      } else await api("/api/feedback", payload);
      $("feedback-message").value = "";
      setAttachment(undefined);
      feedbackDialog.close();
      notify(preview ? "Обращение добавлено в этой вкладке." : "Обращение отправлено.");
    }, $("feedback-status"));
  } finally {
    sendingFeedback = false;
    updateFeedbackSend();
    $("close-feedback").disabled = false;
    $("feedback-tabs").inert = false;
  }
});

$("feedback-inbox").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.feedbackViewed;
  if (id) {
    run(button, async () => {
      if (preview) entity(demoFeedback, id).viewed_at = new Date().toISOString();
      else await api("/api/feedback/" + id + "/viewed", {});
      const badge = button.closest(".feedback-entry").querySelector(".status-chip");
      badge.textContent = "Просмотрено";
      badge.dataset.tone = "neutral";
      button.remove();
      $("feedback-tabs").querySelector('[data-feedback-tab="inbox"]').focus();
    }, $("feedback-status"));
  } else if (button.dataset.feedbackMore || button.hasAttribute("data-feedback-reload")) {
    run(button, () => loadFeedbackInbox(button.dataset.feedbackMore || null), $("feedback-status"));
  }
});
