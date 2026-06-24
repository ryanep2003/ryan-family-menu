function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function resizeImageFile(file, options = {}) {
  let maxSide = options.maxSide || 1200;
  let quality = options.quality || 0.78;
  const maxBytes = options.maxBytes || Infinity;
  const dataUrl = await readFileAsDataUrl(file);
  const image = new Image();
  image.src = dataUrl;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  const canvas = document.createElement("canvas");
  let resized = "";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    resized = canvas.toDataURL("image/jpeg", quality);

    if (resized.length * 0.75 <= maxBytes) return resized;

    maxSide = Math.max(420, Math.round(maxSide * 0.82));
    quality = Math.max(0.46, quality - 0.08);
  }

  return resized;
}

export function readFilesAsDataUrls(files, limit = 3, options = {}) {
  return Promise.all(
    [...files].slice(0, limit).map((file) => resizeImageFile(file, options))
  );
}
