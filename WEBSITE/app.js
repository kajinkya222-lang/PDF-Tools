const KB = 1024;
const pdfjsLib = window.pdfjsLib;
const jsPDF = window.jspdf?.jsPDF;

if (pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const state = {
  imageFile: null,
  imagePdfPages: [],
  selectedPageIndex: -1,
  pdfFile: null,
  convertFile: null,
};

const byId = (id) => document.getElementById(id);

updateVisitorCounter();

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((tab) => {
      tab.classList.remove("active");
      tab.setAttribute("aria-selected", "false");
    });

    document.querySelectorAll(".tool-panel").forEach((panel) => {
      panel.classList.remove("active");
      panel.hidden = true;
    });

    button.classList.add("active");
    button.setAttribute("aria-selected", "true");
    const panel = byId(button.dataset.panel);
    panel.hidden = false;
    panel.classList.add("active");
  });
});

byId("pdf-scale").addEventListener("input", (event) => {
  byId("pdf-scale-value").textContent = `${Math.round(event.target.value * 100)}%`;
});

byId("convert-scale").addEventListener("input", (event) => {
  byId("convert-scale-value").textContent = `${Math.round(event.target.value * 100)}%`;
});

byId("image-brightness").addEventListener("input", (event) => {
  byId("image-brightness-value").textContent = `${event.target.value}%`;
  updateSelectedPage({ brightness: Number(event.target.value) });
});

byId("image-crop-inset").addEventListener("input", (event) => {
  byId("image-crop-inset-value").textContent = `${event.target.value}%`;
  updateSelectedPage({ cropInset: Number(event.target.value) });
});

byId("image-crop-mode").addEventListener("change", (event) => {
  updateSelectedPage({ cropMode: event.target.value });
});

byId("rotate-left").addEventListener("click", () => {
  const page = getSelectedPage();
  if (!page) return;
  updateSelectedPage({ rotation: normalizeRotation(page.edits.rotation - 90) });
});

byId("rotate-right").addEventListener("click", () => {
  const page = getSelectedPage();
  if (!page) return;
  updateSelectedPage({ rotation: normalizeRotation(page.edits.rotation + 90) });
});

byId("reset-page-edits").addEventListener("click", () => {
  const page = getSelectedPage();
  if (!page) return;
  page.edits = createDefaultEdits();
  syncEditorControls(page);
  drawSelectedPage();
});

byId("remove-page").addEventListener("click", () => {
  if (state.selectedPageIndex < 0) return;
  state.imagePdfPages.splice(state.selectedPageIndex, 1);
  state.selectedPageIndex = Math.min(state.selectedPageIndex, state.imagePdfPages.length - 1);
  renderImagePdfEditor();
});

byId("move-page-up").addEventListener("click", () => {
  moveSelectedPage(-1);
});

byId("move-page-down").addEventListener("click", () => {
  moveSelectedPage(1);
});

byId("shuffle-pages").addEventListener("click", () => {
  if (state.imagePdfPages.length < 2) return;
  const selectedPage = getSelectedPage();

  for (let index = state.imagePdfPages.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [state.imagePdfPages[index], state.imagePdfPages[target]] = [state.imagePdfPages[target], state.imagePdfPages[index]];
  }

  state.selectedPageIndex = Math.max(0, state.imagePdfPages.indexOf(selectedPage));
  renderImagePdfEditor();
});

byId("image-input").addEventListener("change", (event) => {
  state.imageFile = event.target.files[0] || null;
  showMessage("image-result", state.imageFile ? `Selected ${state.imageFile.name} (${formatBytes(state.imageFile.size)}).` : "");
});

byId("image-pdf-input").addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  showMessage("image-pdf-result", `Loading ${files.length} image${files.length > 1 ? "s" : ""}...`);

  for (const file of files) {
    const image = await loadImage(file);
    state.imagePdfPages.push({
      file,
      image,
      thumbUrl: URL.createObjectURL(file),
      edits: createDefaultEdits(),
    });
  }

  if (state.selectedPageIndex < 0) {
    state.selectedPageIndex = 0;
  }

  event.target.value = "";
  renderImagePdfEditor();
  const totalSize = state.imagePdfPages.reduce((sum, page) => sum + page.file.size, 0);
  showMessage(
    "image-pdf-result",
    `${state.imagePdfPages.length} page${state.imagePdfPages.length > 1 ? "s" : ""} ready (${formatBytes(totalSize)}).`
  );
});

byId("pdf-input").addEventListener("change", (event) => {
  state.pdfFile = event.target.files[0] || null;
  showMessage("pdf-result", state.pdfFile ? `Selected ${state.pdfFile.name} (${formatBytes(state.pdfFile.size)}).` : "");
});

byId("convert-input").addEventListener("change", (event) => {
  state.convertFile = event.target.files[0] || null;
  showMessage("convert-result", state.convertFile ? `Selected ${state.convertFile.name} (${formatBytes(state.convertFile.size)}).` : "");
});

byId("compress-image").addEventListener("click", async () => {
  if (!state.imageFile) {
    showMessage("image-result", "Choose a photo first.", true);
    return;
  }

  const button = byId("compress-image");
  runBusy(button, "Compressing...", async () => {
    if (byId("image-format").value === "application/pdf") {
      ensurePdfWriter();
    }

    const targetBytes = Number(byId("image-target").value) * KB;
    const mime = byId("image-format").value;
    const output = await compressImage(state.imageFile, mime, targetBytes);
    renderDownload("image-result", output);
  });
});

byId("compress-pdf").addEventListener("click", async () => {
  if (!state.pdfFile) {
    showMessage("pdf-result", "Choose a PDF first.", true);
    return;
  }

  const button = byId("compress-pdf");
  runBusy(button, "Compressing...", async () => {
    ensurePdfTools();
    const quality = Number(byId("pdf-quality").value);
    const scale = Number(byId("pdf-scale").value);
    const output = await compressPdf(state.pdfFile, quality, scale);
    renderDownload("pdf-result", output);
  });
});

byId("create-image-pdf").addEventListener("click", async () => {
  if (!state.imagePdfPages.length) {
    showMessage("image-pdf-result", "Choose at least one image first.", true);
    return;
  }

  const button = byId("create-image-pdf");
  runBusy(button, "Creating...", async () => {
    ensurePdfWriter();
    const quality = Number(byId("image-pdf-quality").value);
    const maxWidth = Number(byId("image-pdf-width").value);
    const targetBytes = Number(byId("image-pdf-target").value) * KB;
    const mode = byId("image-pdf-mode").value;
    const output = await imagesToPdfWithTarget(state.imagePdfPages, quality, maxWidth, targetBytes, mode);
    renderDownload("image-pdf-result", output);
  });
});

byId("convert-pdf").addEventListener("click", async () => {
  if (!state.convertFile) {
    showMessage("convert-result", "Choose a PDF first.", true);
    return;
  }

  const button = byId("convert-pdf");
  runBusy(button, "Converting...", async () => {
    ensurePdfReader();
    const mime = byId("convert-format").value;
    const scale = Number(byId("convert-scale").value);
    const outputs = await pdfToImages(state.convertFile, mime, scale);
    renderDownloads("convert-result", outputs);
  });
});

renderImagePdfEditor();

async function runBusy(button, text, task) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = text;

  try {
    await task();
  } catch (error) {
    const target = getResultTarget(button.id);
    showMessage(target, error.message || "Something went wrong while processing the file.", true);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function getResultTarget(buttonId) {
  if (buttonId === "create-image-pdf") return "image-pdf-result";
  if (buttonId.includes("image")) return "image-result";
  if (buttonId.includes("convert")) return "convert-result";
  return "pdf-result";
}

function updateVisitorCounter() {
  const key = "tinypdf-studio-visits";
  const currentVisits = Number(localStorage.getItem(key) || "0") + 1;
  localStorage.setItem(key, String(currentVisits));
  byId("visitor-count").textContent = currentVisits.toLocaleString();
}

function createDefaultEdits() {
  return {
    brightness: 100,
    cropInset: 0,
    cropMode: "full",
    rotation: 0,
  };
}

function getSelectedPage() {
  return state.imagePdfPages[state.selectedPageIndex] || null;
}

function updateSelectedPage(edits) {
  const page = getSelectedPage();
  if (!page) return;
  page.edits = { ...page.edits, ...edits };
  drawSelectedPage();
}

function moveSelectedPage(direction) {
  const from = state.selectedPageIndex;
  const to = from + direction;

  if (from < 0 || to < 0 || to >= state.imagePdfPages.length) {
    return;
  }

  [state.imagePdfPages[from], state.imagePdfPages[to]] = [state.imagePdfPages[to], state.imagePdfPages[from]];
  state.selectedPageIndex = to;
  renderImagePdfEditor();
}

function renderImagePdfEditor() {
  const pageList = byId("image-page-list");
  pageList.innerHTML = "";

  state.imagePdfPages.forEach((page, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `page-button${index === state.selectedPageIndex ? " active" : ""}`;
    button.addEventListener("click", () => {
      state.selectedPageIndex = index;
      renderImagePdfEditor();
    });

    const image = document.createElement("img");
    image.src = page.thumbUrl;
    image.alt = "";

    const title = document.createElement("span");
    title.textContent = `Page ${index + 1}: ${page.file.name}`;

    button.append(image, title);
    pageList.appendChild(button);
  });

  const page = getSelectedPage();
  syncEditorControls(page);
  drawSelectedPage();
}

function syncEditorControls(page) {
  const disabled = !page;
  const controls = [
    "rotate-left",
    "rotate-right",
    "image-brightness",
    "image-crop-mode",
    "image-crop-inset",
    "image-pdf-mode",
    "image-pdf-target",
    "image-pdf-quality",
    "image-pdf-width",
    "reset-page-edits",
    "remove-page",
    "move-page-up",
    "move-page-down",
    "shuffle-pages",
    "create-image-pdf",
  ];

  controls.forEach((id) => {
    byId(id).disabled = disabled;
  });

  if (!page) {
    byId("image-brightness").value = 100;
    byId("image-brightness-value").textContent = "100%";
    byId("image-crop-mode").value = "full";
    byId("image-crop-inset").value = 0;
    byId("image-crop-inset-value").textContent = "0%";
    return;
  }

  byId("image-brightness").value = page.edits.brightness;
  byId("image-brightness-value").textContent = `${page.edits.brightness}%`;
  byId("image-crop-mode").value = page.edits.cropMode;
  byId("image-crop-inset").value = page.edits.cropInset;
  byId("image-crop-inset-value").textContent = `${page.edits.cropInset}%`;
  byId("move-page-up").disabled = state.selectedPageIndex <= 0;
  byId("move-page-down").disabled = state.selectedPageIndex >= state.imagePdfPages.length - 1;
  byId("shuffle-pages").disabled = state.imagePdfPages.length < 2;
}

function drawSelectedPage() {
  const page = getSelectedPage();
  const canvas = byId("image-editor-canvas");
  const empty = byId("editor-empty");

  if (!page) {
    canvas.style.display = "none";
    empty.hidden = false;
    return;
  }

  const preview = renderEditedPageToCanvas(page, 1000);
  canvas.width = preview.width;
  canvas.height = preview.height;
  canvas.getContext("2d").drawImage(preview, 0, 0);
  canvas.style.display = "block";
  empty.hidden = true;
}

function renderEditedPageToCanvas(page, maxWidth) {
  const source = page.image;
  const crop = getCropRect(source, page.edits);
  const isSideways = Math.abs(page.edits.rotation) % 180 === 90;
  const outputWidth = isSideways ? crop.height : crop.width;
  const outputHeight = isSideways ? crop.width : crop.height;
  const scale = Math.min(1, maxWidth / outputWidth);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = Math.max(1, Math.round(outputWidth * scale));
  canvas.height = Math.max(1, Math.round(outputHeight * scale));

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((page.edits.rotation * Math.PI) / 180);
  ctx.filter = `brightness(${page.edits.brightness}%)`;
  ctx.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    -(crop.width * scale) / 2,
    -(crop.height * scale) / 2,
    crop.width * scale,
    crop.height * scale
  );
  ctx.restore();

  return canvas;
}

function getCropRect(image, edits) {
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  if (edits.cropMode === "inset") {
    const insetX = Math.round(width * (edits.cropInset / 100));
    const insetY = Math.round(height * (edits.cropInset / 100));
    return {
      x: insetX,
      y: insetY,
      width: Math.max(1, width - insetX * 2),
      height: Math.max(1, height - insetY * 2),
    };
  }

  const ratios = {
    square: 1,
    portrait: 4 / 5,
    landscape: 16 / 9,
  };
  const targetRatio = ratios[edits.cropMode];

  if (!targetRatio) {
    return { x: 0, y: 0, width, height };
  }

  const currentRatio = width / height;
  if (currentRatio > targetRatio) {
    const cropWidth = Math.round(height * targetRatio);
    return { x: Math.round((width - cropWidth) / 2), y: 0, width: cropWidth, height };
  }

  const cropHeight = Math.round(width / targetRatio);
  return { x: 0, y: Math.round((height - cropHeight) / 2), width, height: cropHeight };
}

function normalizeRotation(rotation) {
  return ((rotation % 360) + 360) % 360;
}

async function compressImage(file, mime, targetBytes) {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: mime !== "image/jpeg" });
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  let quality = mime === "image/png" ? 0.92 : 0.86;
  let blob;

  for (let attempt = 0; attempt < 28; attempt += 1) {
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    if (mime === "application/pdf") {
      const jpeg = await canvasToBlob(canvas, "image/jpeg", quality);
      blob = await imageBlobToPdf(jpeg, canvas.width, canvas.height);
    } else {
      blob = await canvasToBlob(canvas, mime, quality);
    }

    if (blob.size <= targetBytes) break;

    if (mime === "image/png") {
      width *= 0.82;
      height *= 0.82;
    } else if (quality > 0.24) {
      quality -= 0.08;
    } else {
      width *= 0.86;
      height *= 0.86;
    }
  }

  const ext = mime === "application/pdf" ? "pdf" : mime.split("/")[1].replace("jpeg", "jpg");
  return {
    blob,
    name: replaceExtension(file.name, ext),
    previewUrl: mime === "application/pdf" ? null : URL.createObjectURL(blob),
    originalSize: file.size,
    type: mime,
  };
}

async function imageBlobToPdf(blob, width, height) {
  const dataUrl = await blobToDataUrl(blob);
  const orientation = width > height ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "px", format: [width, height], compress: true });
  pdf.addImage(dataUrl, "JPEG", 0, 0, width, height, undefined, "FAST");
  return pdf.output("blob");
}

async function compressPdf(file, quality, scale) {
  const pdf = await loadPdf(file);
  let outputPdf = null;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const image = canvas.toDataURL("image/jpeg", quality);
    const orientation = canvas.width > canvas.height ? "landscape" : "portrait";

    if (!outputPdf) {
      outputPdf = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height], compress: true });
    } else {
      outputPdf.addPage([canvas.width, canvas.height], orientation);
    }

    outputPdf.addImage(image, "JPEG", 0, 0, canvas.width, canvas.height, undefined, "FAST");
  }

  return {
    blob: outputPdf.output("blob"),
    name: replaceExtension(file.name, "compressed.pdf"),
    previewUrl: null,
    originalSize: file.size,
    type: "application/pdf",
    note: "Text may become image-based after strong compression.",
  };
}

async function imagesToPdf(pages, quality, maxWidth) {
  let outputPdf = null;
  let firstFileName = pages[0].file.name;
  let originalSize = 0;

  for (const page of pages) {
    originalSize += page.file.size;
    const canvas = renderEditedPageToCanvas(page, maxWidth);
    const width = canvas.width;
    const height = canvas.height;
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const orientation = width > height ? "landscape" : "portrait";

    if (!outputPdf) {
      outputPdf = new jsPDF({ orientation, unit: "px", format: [width, height], compress: true });
    } else {
      outputPdf.addPage([width, height], orientation);
    }

    outputPdf.addImage(dataUrl, "JPEG", 0, 0, width, height, undefined, "FAST");
  }

  return {
    blob: outputPdf.output("blob"),
    name: pages.length === 1 ? replaceExtension(firstFileName, "pdf") : "images-to-pdf.pdf",
    previewUrl: null,
    originalSize,
    type: "application/pdf",
    converted: true,
  };
}

async function imagesToPdfWithTarget(pages, preferredQuality, preferredMaxWidth, targetBytes, mode) {
  if (mode === "strict") {
    return imagesToPdfUnderSize(pages, preferredQuality, preferredMaxWidth, targetBytes, {
      minQuality: 0.22,
      minWidth: 360,
      stepQuality: 0.07,
      stepWidth: 80,
      allowOverTargetReadable: false,
    });
  }

  const readableOutput = await imagesToPdf(pages, preferredQuality, preferredMaxWidth);
  readableOutput.targetBytes = targetBytes;
  readableOutput.qualityUsed = preferredQuality;
  readableOutput.maxWidthUsed = preferredMaxWidth;

  if (readableOutput.blob.size <= targetBytes) {
    readableOutput.note = `Saved under ${formatBytes(targetBytes)} without reducing document clarity.`;
    return readableOutput;
  }

  return imagesToPdfUnderSize(pages, preferredQuality, preferredMaxWidth, targetBytes, {
    minQuality: 0.72,
    minWidth: 1000,
    stepQuality: 0.05,
    stepWidth: 120,
    allowOverTargetReadable: true,
    readableFallback: readableOutput,
  });
}

async function imagesToPdfUnderSize(pages, preferredQuality, preferredMaxWidth, targetBytes, options) {
  const qualitySteps = buildDescendingSteps(preferredQuality, options.minQuality, options.stepQuality);
  const widthSteps = buildDescendingSteps(preferredMaxWidth, options.minWidth, options.stepWidth);
  let smallestOutput = null;
  let bestFittingOutput = null;

  for (const width of widthSteps) {
    for (const quality of qualitySteps) {
      const output = await imagesToPdf(pages, quality, width);
      output.targetBytes = targetBytes;
      output.qualityUsed = quality;
      output.maxWidthUsed = width;
      output.qualityScore = getPdfQualityScore(output, preferredQuality, preferredMaxWidth);

      if (!smallestOutput || output.blob.size < smallestOutput.blob.size) {
        smallestOutput = output;
      }

      if (output.blob.size <= targetBytes) {
        if (!bestFittingOutput || output.qualityScore > bestFittingOutput.qualityScore) {
          bestFittingOutput = output;
        }
      }
    }
  }

  if (bestFittingOutput) {
    bestFittingOutput.note = `Saved under ${formatBytes(targetBytes)} at ${Math.round(bestFittingOutput.qualityUsed * 100)}% quality, ${bestFittingOutput.maxWidthUsed}px page width.`;
    return bestFittingOutput;
  }

  if (options.allowOverTargetReadable && options.readableFallback) {
    options.readableFallback.overTarget = true;
    options.readableFallback.note = `Readable export is ${formatBytes(options.readableFallback.blob.size)}. Use fewer pages, crop tighter, or switch to Strict under target to force ${formatBytes(targetBytes)}.`;
    return options.readableFallback;
  }

  smallestOutput.note = `Smallest possible result is ${formatBytes(smallestOutput.blob.size)}. Remove pages, crop tighter, or lower page width to reach ${formatBytes(targetBytes)}.`;
  smallestOutput.overTarget = true;
  return smallestOutput;
}

function getPdfQualityScore(output, preferredQuality, preferredMaxWidth) {
  const qualityScore = output.qualityUsed / preferredQuality;
  const widthScore = output.maxWidthUsed / preferredMaxWidth;
  return qualityScore * 0.58 + widthScore * 0.42;
}

function buildDescendingSteps(start, min, step) {
  const steps = [];
  let current = Number(start);

  while (current >= min) {
    steps.push(Number(current.toFixed(2)));
    current -= step;
  }

  if (!steps.includes(min)) {
    steps.push(min);
  }

  return steps;
}

async function pdfToImages(file, mime, scale) {
  const pdf = await loadPdf(file);
  const ext = mime === "image/png" ? "png" : "jpg";
  const outputs = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: mime === "image/png" });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await canvasToBlob(canvas, mime, 0.9);

    outputs.push({
      blob,
      name: `${stripExtension(file.name)}-page-${pageNumber}.${ext}`,
      previewUrl: URL.createObjectURL(blob),
      originalSize: file.size,
      type: mime,
      converted: true,
    });
  }

  return outputs;
}

function loadPdf(file) {
  return file.arrayBuffer().then((data) => pdfjsLib.getDocument({ data }).promise);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load that image."));
    image.src = URL.createObjectURL(file);
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not create the output file."));
    }, mime, quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the generated file."));
    reader.readAsDataURL(blob);
  });
}

function renderDownloads(targetId, outputs) {
  const target = byId(targetId);
  target.innerHTML = "";
  outputs.forEach((output) => target.appendChild(createDownloadCard(output)));
}

function renderDownload(targetId, output) {
  renderDownloads(targetId, [output]);
}

function createDownloadCard(output) {
  const url = URL.createObjectURL(output.blob);
  const card = document.createElement("article");
  card.className = "download-card";

  if (output.previewUrl) {
    const image = document.createElement("img");
    image.src = output.previewUrl;
    image.alt = "";
    card.appendChild(image);
  } else {
    const tile = document.createElement("div");
    tile.className = "preview-tile";
    tile.textContent = output.type.includes("pdf") ? "PDF" : "FILE";
    card.appendChild(tile);
  }

  const info = document.createElement("div");
  const title = document.createElement("p");
  title.className = "download-title";
  title.textContent = output.name;
  const meta = document.createElement("p");
  meta.className = "download-meta";
  const saved = Math.max(0, 1 - output.blob.size / output.originalSize);
  let resultLabel = output.converted
    ? "Converted file"
    : `<span class="status-good">${Math.round(saved * 100)}% smaller</span>`;

  if (output.targetBytes) {
    resultLabel = output.blob.size <= output.targetBytes
      ? `<span class="status-good">Under ${formatBytes(output.targetBytes)}</span>`
      : `<span class="status-warn">Over ${formatBytes(output.targetBytes)}</span>`;
  }

  meta.innerHTML = `${formatBytes(output.blob.size)} ${resultLabel}${output.note ? ` - ${output.note}` : ""}`;
  info.append(title, meta);
  card.appendChild(info);

  const link = document.createElement("a");
  link.className = "download-link";
  link.href = url;
  link.download = output.name;
  link.textContent = "Download";
  card.appendChild(link);

  return card;
}

function showMessage(targetId, message, isError = false) {
  const target = byId(targetId);
  target.innerHTML = message ? `<div class="message${isError ? " error" : ""}">${message}</div>` : "";
}

function ensurePdfReader() {
  if (!pdfjsLib) {
    throw new Error("PDF tools could not load. Check your internet connection and refresh the page.");
  }
}

function ensurePdfWriter() {
  if (!jsPDF) {
    throw new Error("PDF export tools could not load. Check your internet connection and refresh the page.");
  }
}

function ensurePdfTools() {
  ensurePdfReader();
  ensurePdfWriter();
}

function formatBytes(bytes) {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${(bytes / KB / KB).toFixed(2)} MB`;
}

function stripExtension(name) {
  return name.replace(/\.[^/.]+$/, "");
}

function replaceExtension(name, ext) {
  return `${stripExtension(name)}.${ext}`;
}
