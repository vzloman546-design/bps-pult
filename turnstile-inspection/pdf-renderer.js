(() => {
  'use strict';

  const PX_PER_PT = 300 / 72;
  const PAGE_W = 3508;
  const PAGE_H = 2481;
  const PDF_W = 841.889764;
  const PDF_H = 595.303937;

  let assetsPromise = null;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Не удалось загрузить шаблон документа'));
      image.src = src;
    });
  }

  async function assets() {
    if (!assetsPromise) {
      assetsPromise = (async () => {
        const embedded = window.TURNSTILE_ASSETS;
        if (!embedded?.pages?.length || !embedded?.atlas || !embedded?.meta) {
          throw new Error('Не загружен встроенный шаблон документа');
        }
        const [pages, atlas] = await Promise.all([
          Promise.all(embedded.pages.map(loadImage)),
          loadImage(embedded.atlas)
        ]);
        return { pages, atlas, meta: embedded.meta };
      })();
    }
    return assetsPromise;
  }

  function measure(meta, text, fontPt) {
    const scale = (fontPt * PX_PER_PT) / meta.fontSize;
    let width = 0;
    for (const ch of String(text ?? '')) {
      width += (meta.glyphs[ch] || meta.glyphs['?'] || { advance: meta.fontSize * .5 }).advance * scale;
    }
    return width;
  }

  function bitmapText(ctx, renderAssets, text, x, baselineY, fontPt, options = {}) {
    text = String(text ?? '');
    if (!text) return;

    const { atlas, meta } = renderAssets;
    const scale = (fontPt * PX_PER_PT) / meta.fontSize;
    const align = options.align || 'left';
    const total = measure(meta, text, fontPt);
    let cursor = x;

    if (align === 'center') cursor -= total / 2;
    if (align === 'right') cursor -= total;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    for (const ch of text) {
      const glyph = meta.glyphs[ch] || meta.glyphs['?'];
      if (!glyph) continue;
      if (ch !== ' ' && glyph.w > 0 && glyph.h > 0) {
        ctx.drawImage(
          atlas,
          glyph.x, glyph.y, glyph.w, glyph.h,
          cursor + glyph.left * scale,
          baselineY + glyph.top * scale,
          glyph.w * scale,
          glyph.h * scale
        );
      }
      cursor += glyph.advance * scale;
    }
  }

  function wrap(meta, text, fontPt, maxWidth) {
    const paragraphs = String(text || '').replace(/\r/g, '').split('\n');
    const lines = [];

    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) {
        lines.push('');
        continue;
      }

      const words = paragraph.trim().split(/\s+/);
      let line = '';

      for (const word of words) {
        const candidate = line ? line + ' ' + word : word;
        if (measure(meta, candidate, fontPt) <= maxWidth) {
          line = candidate;
          continue;
        }

        if (line) lines.push(line);

        if (measure(meta, word, fontPt) <= maxWidth) {
          line = word;
          continue;
        }

        let part = '';
        for (const char of word) {
          const next = part + char;
          if (part && measure(meta, next, fontPt) > maxWidth) {
            lines.push(part);
            part = char;
          } else {
            part = next;
          }
        }
        line = part;
      }

      if (line) lines.push(line);
    }

    return lines;
  }

  function textBox(ctx, renderAssets, text, box, options = {}) {
    if (!String(text || '').trim()) return;

    const pad = options.pad ?? 10;
    const align = options.align || 'center';
    const sizes = options.sizes || [9, 8.5, 8, 7.5, 7];
    let chosen = sizes[sizes.length - 1];
    let lines = [];

    for (const size of sizes) {
      const lineHeight = size * PX_PER_PT * (options.lineHeight || 1.12);
      const maxLines = Math.max(1, Math.floor((box.h - pad * 2) / lineHeight));
      const candidate = wrap(renderAssets.meta, text, size, box.w - pad * 2);
      if (candidate.length <= maxLines) {
        chosen = size;
        lines = candidate;
        break;
      }
      lines = candidate;
    }

    const lineHeight = chosen * PX_PER_PT * (options.lineHeight || 1.12);
    const maxLines = Math.max(1, Math.floor((box.h - pad * 2) / lineHeight));

    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      let last = lines[maxLines - 1];
      while (last && measure(renderAssets.meta, last + '…', chosen) > box.w - pad * 2) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = last + '…';
    }

    const totalHeight = lines.length * lineHeight;
    const firstBaseline = box.y + (box.h - totalHeight) / 2 + chosen * PX_PER_PT * .82;

    lines.forEach((line, index) => {
      let x = box.x + pad;
      let textAlign = 'left';

      if (align === 'center') {
        x = box.x + box.w / 2;
        textAlign = 'center';
      } else if (align === 'right') {
        x = box.x + box.w - pad;
        textAlign = 'right';
      }

      bitmapText(ctx, renderAssets, line, x, firstBaseline + index * lineHeight, chosen, {
        align: textAlign
      });
    });
  }

  function gateCounts(checks) {
    const result = { total: checks.length, ok: 0, service: 0, bad: 0, blank: 0 };
    for (const check of checks) {
      if (check.status === 'Исправно') result.ok++;
      else if (check.status === 'Требует обслуживания') result.service++;
      else if (check.status === 'Неисправно') result.bad++;
      else result.blank++;
    }
    return result;
  }

  function drawGateRows(ctx, renderAssets, checks, x, y) {
    for (let index = 0; index < checks.length; index++) {
      const top = y[index];
      const bottom = y[index + 1];
      const height = bottom - top;
      const check = checks[index];
      const values = [
        check.visual,
        check.power,
        check.reader,
        check.status,
        check.remarks
      ];

      for (let column = 0; column < 5; column++) {
        textBox(
          ctx,
          renderAssets,
          values[column],
          {
            x: x[column + 2] + 3,
            y: top + 3,
            w: x[column + 3] - x[column + 2] - 6,
            h: height - 6
          },
          {
            align: column === 4 ? 'left' : 'center',
            pad: column === 4 ? 12 : 8,
            sizes: column === 4 ? [8.5, 8, 7.5, 7] : [9, 8.5, 8, 7.5]
          }
        );
      }
    }
  }

  function drawGateSummary(ctx, renderAssets, checks, slots, y1, y2) {
    const counts = gateCounts(checks);
    const values = [counts.total, counts.ok, counts.service, counts.bad];

    values.forEach((value, index) => {
      const [x1, x2] = slots[index];
      ctx.fillStyle = 'rgb(237,237,237)';
      ctx.fillRect(x1 - 5, y1 + 18, (x2 - x1) + 10, (y2 - y1) - 36);
      textBox(
        ctx,
        renderAssets,
        String(value),
        { x: x1 - 5, y: y1 + 12, w: (x2 - x1) + 10, h: (y2 - y1) - 24 },
        { align: 'center', sizes: [9] }
      );
    });
  }

  function overlayGate(ctx, renderAssets, gateNo, checks) {
    if (gateNo === 1) {
      const x = [197,315,817,1277,1655,2115,2493,3309];
      const y = [696,791,885,979,1073,1167,1261,1356,1450,1544,1638];
      drawGateRows(ctx, renderAssets, checks, x, y);
      drawGateSummary(ctx, renderAssets, checks, [
        [1017,1116],[1319,1418],[1817,1917],[2153,2252]
      ], 1638, 1735);
      return;
    }

    const coordinates = {
      2: {
        x:[197,314,820,1279,1657,2117,2495,3310],
        slots:[[1021,1120],[1322,1422],[1821,1921],[2157,2256]]
      },
      3: {
        x:[199,318,820,1263,1647,2119,2474,3307],
        slots:[[1020,1120],[1322,1422],[1821,1920],[2157,2256]]
      },
      4: {
        x:[206,318,820,1263,1647,2119,2474,3300],
        slots:[[1020,1120],[1322,1422],[1821,1920],[2157,2256]]
      }
    };

    const y = [
      348,438,527,617,706,796,886,975,1065,1154,1244,
      1333,1423,1513,1602,1692,1781,1871,1961,2050,2140
    ];

    const coords = coordinates[gateNo];
    drawGateRows(ctx, renderAssets, checks, coords.x, y);
    drawGateSummary(ctx, renderAssets, checks, coords.slots, 2140, 2236);
  }

  function drawDynamicConclusion(ctx, renderAssets, gates) {
    const left = 500;
    const right = 3005;
    const top = 225;
    const bottom = 650;

    ctx.fillStyle = '#fff';
    ctx.fillRect(left, top, right - left, bottom - top);

    const columns = [left, 900, 1400, 1900, 2450, right];
    const rowHeight = 68;
    const rows = gates.length + 1;
    const tableBottom = top + rowHeight * rows;

    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 2;

    for (const x of columns) {
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, tableBottom);
      ctx.stroke();
    }

    for (let row = 0; row <= rows; row++) {
      const y = top + row * rowHeight;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }

    const headers = ['Гейт', 'Осмотрено', 'Исправно', 'Обслуживание', 'Неисправно'];
    headers.forEach((header, index) => {
      textBox(
        ctx,
        renderAssets,
        header,
        {
          x: columns[index] + 4,
          y: top + 4,
          w: columns[index + 1] - columns[index] - 8,
          h: rowHeight - 8
        },
        { align: 'center', sizes: [8.5,8,7.5] }
      );
    });

    gates.forEach((gate, index) => {
      const counts = gateCounts(gate.checks);
      const values = [
        String(gate.gateNo),
        String(counts.total),
        String(counts.ok),
        String(counts.service),
        String(counts.bad)
      ];
      const y = top + rowHeight * (index + 1);

      values.forEach((value, column) => {
        textBox(
          ctx,
          renderAssets,
          value,
          {
            x: columns[column] + 4,
            y: y + 4,
            w: columns[column + 1] - columns[column] - 8,
            h: rowHeight - 8
          },
          { align: 'center', sizes: [9] }
        );
      });
    });
  }

  async function canvasPage(renderAssets, templateIndex, overlay) {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.drawImage(renderAssets.pages[templateIndex], 0, 0);

    if (overlay) overlay(ctx);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        value => value ? resolve(value) : reject(new Error('Не удалось сформировать страницу PDF')),
        'image/jpeg',
        1
      );
    });

    return { blob, width: PAGE_W, height: PAGE_H };
  }

  async function renderPages(snapshot) {
    const renderAssets = await assets();
    const gates = [...(snapshot.gates || [])].sort((a,b) => a.gateNo - b.gateNo);
    const pages = [];

    pages.push(await canvasPage(renderAssets, 0));

    for (const gate of gates) {
      pages.push(await canvasPage(
        renderAssets,
        gate.gateNo,
        ctx => overlayGate(ctx, renderAssets, gate.gateNo, gate.checks || [])
      ));
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    pages.push(await canvasPage(
      renderAssets,
      5,
      ctx => drawDynamicConclusion(ctx, renderAssets, gates)
    ));

    return pages;
  }

  function ascii(text) {
    return new TextEncoder().encode(text);
  }

  function concat(chunks) {
    let size = 0;
    for (const chunk of chunks) size += chunk.length;
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }

  async function buildPdf(pages) {
    const jpegs = [];
    for (const page of pages) {
      jpegs.push(new Uint8Array(await page.blob.arrayBuffer()));
    }

    const count = pages.length;
    const objectCount = 2 + count * 3;
    const chunks = [];
    const offsets = new Array(objectCount + 1).fill(0);
    let length = 0;

    const push = chunk => {
      chunks.push(chunk);
      length += chunk.length;
    };

    const object = (id, parts) => {
      offsets[id] = length;
      push(ascii(id + ' 0 obj\n'));
      for (const part of parts) push(typeof part === 'string' ? ascii(part) : part);
      push(ascii('\nendobj\n'));
    };

    push(ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);

    const pageIds = Array.from({ length: count }, (_, index) => 3 + index * 3);
    object(2, [
      '<< /Type /Pages /Count ' + count +
      ' /Kids [' + pageIds.map(id => id + ' 0 R').join(' ') + '] >>'
    ]);

    for (let index = 0; index < count; index++) {
      const pageId = 3 + index * 3;
      const imageId = pageId + 1;
      const contentId = pageId + 2;
      const jpeg = jpegs[index];

      object(pageId, [
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
        PDF_W.toFixed(3) + ' ' + PDF_H.toFixed(3) +
        '] /Resources << /XObject << /Im0 ' + imageId +
        ' 0 R >> >> /Contents ' + contentId + ' 0 R >>'
      ]);

      object(imageId, [
        '<< /Type /XObject /Subtype /Image /Width ' + PAGE_W +
        ' /Height ' + PAGE_H +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
        jpeg.length + ' >>\nstream\n',
        jpeg,
        '\nendstream'
      ]);

      const commands =
        'q\n' + PDF_W.toFixed(3) + ' 0 0 ' + PDF_H.toFixed(3) +
        ' 0 0 cm\n/Im0 Do\nQ\n';
      const commandBytes = ascii(commands);

      object(contentId, [
        '<< /Length ' + commandBytes.length + ' >>\nstream\n',
        commandBytes,
        'endstream'
      ]);
    }

    const xref = length;
    push(ascii('xref\n0 ' + (objectCount + 1) + '\n0000000000 65535 f \n'));

    for (let id = 1; id <= objectCount; id++) {
      push(ascii(String(offsets[id]).padStart(10, '0') + ' 00000 n \n'));
    }

    push(ascii(
      'trailer\n<< /Size ' + (objectCount + 1) +
      ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n'
    ));

    return new Blob([concat(chunks)], { type: 'application/pdf' });
  }

  window.TeamPdf = {
    renderPages,

    async generate(snapshot) {
      const pages = await renderPages(snapshot);
      const pdfBlob = await buildPdf(pages);
      return { pages, pdfBlob };
    }
  };
})();
