(() => {
  'use strict';

  async function blobToImage(blob, index) {
    const url = URL.createObjectURL(blob);
    const image = document.createElement('img');
    image.className = 'server-print-page';
    image.alt = 'Страница ' + (index + 1);
    image.src = url;
    document.getElementById('serverPrintRoot').appendChild(image);

    try {
      if (image.decode) await image.decode();
      else await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }

  async function run() {
    const snapshot = window.__TURNSTILE_PRINT_SNAPSHOT;
    if (!snapshot || !window.TeamPdf?.renderPages) {
      throw new Error('print_payload_missing');
    }

    const pages = await window.TeamPdf.renderPages(snapshot);

    for (let index = 0; index < pages.length; index++) {
      await blobToImage(pages[index].blob, index);
    }

    const ready = document.createElement('div');
    ready.id = 'pdf-ready';
    ready.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ready);
  }

  run().catch(error => {
    console.error(error);
    const failed = document.createElement('div');
    failed.id = 'pdf-failed';
    failed.textContent = String(error?.message || error);
    document.body.appendChild(failed);
  });
})();
