(function () {
  'use strict';

  if (document.getElementById('kwork-collector-btn')) return;

  // ── UI ──────────────────────────────────────────────────────────────────────

  const btn = document.createElement('button');
  btn.id = 'kwork-collector-btn';
  btn.textContent = '📥 Скачать raw.md';
  btn.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 999999;
    background: #21a038; color: #fff; border: none; border-radius: 8px;
    padding: 11px 18px; font-size: 14px; font-weight: 600; cursor: pointer;
    box-shadow: 0 3px 10px rgba(0,0,0,.35); transition: opacity .2s;
  `;
  btn.addEventListener('click', onCollect);
  document.body.appendChild(btn);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function setStatus(text, color = '#21a038') {
    btn.textContent = text;
    btn.style.background = color;
  }

  function getOrderId() {
    const m = location.search.match(/[?&]id=(\d+)/);
    return m ? m[1] : 'unknown';
  }

  // ── Expand all messages ──────────────────────────────────────────────────────

  async function expandAll() {
    // 1. "Загрузить ещё"
    const loadMore = [...document.querySelectorAll('a, span')]
      .find((el) => el.textContent.trim() === 'Загрузить ещё');
    if (loadMore) {
      loadMore.click();
      await sleep(4000);
    }

    // 2. "Показать все"
    const showAll = [...document.querySelectorAll('a, span')]
      .find((el) => el.textContent.trim() === 'Показать все');
    if (showAll) {
      showAll.click();
      await sleep(5000);
    }

    // 3. "Переписка, которая может относиться к заказу"
    const relatedNode = document.evaluate(
      "//span[contains(text(),'Переписка, которая может относиться')]",
      document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (relatedNode) {
      relatedNode.click();
      await sleep(3000);
    }

    // 4. Раскрыть блок "Услуги" (если свёрнут)
    const servicesToggle = [...document.querySelectorAll('[class*="toggle"], [class*="collapse"]')]
      .find((el) => el.textContent.includes('Услуги'));
    if (servicesToggle) {
      servicesToggle.click();
      await sleep(1000);
    }

    // 5. Раскрыть любые "Читать полностью" / "Показать полностью" внутри сообщений
    const expandInner = [...document.querySelectorAll(
      '[class*="message-expand"], [class*="expand-msg"], .js-expand-message, [class*="show-full-text"]'
    )];
    for (const el of expandInner) {
      el.click();
      await sleep(150);
    }

    // 6. Ещё раз "Загрузить ещё" — на случай появления после раскрытия
    const loadMore2 = [...document.querySelectorAll('a, span')]
      .find((el) => el.textContent.trim() === 'Загрузить ещё');
    if (loadMore2) {
      loadMore2.click();
      await sleep(4000);
    }
  }

  // ── Extract message text (full, with fallbacks) ──────────────────────────────

  // Конвертируем элемент в текст с сохранением переносов строк.
  // Клон временно вставляется в DOM (невидимым), чтобы innerText имел layout-контекст
  // и правильно обрабатывал <br>, <p>, <div> и CSS white-space: pre.
  function elementToText(el, removeSelectors = []) {
    const clone = el.cloneNode(true);
    removeSelectors.forEach((sel) => {
      clone.querySelectorAll(sel).forEach((e) => e.remove());
    });
    clone.style.cssText = 'position:fixed;left:-9999px;top:-9999px;pointer-events:none';
    document.body.appendChild(clone);
    const text = clone.innerText.trim();
    document.body.removeChild(clone);
    return text;
  }

  function getMsgText(msgBlock) {
    const selectors = [
      '.js-track-text-message',
      '.track-item__message-text',
      '.step-block-order__text',
      '[class*="message-text"]',
      '[class*="item__text"]',
    ];
    const removeBtn = ['button', '[class*="expand"]', '[class*="read-more"]', '[class*="message-quote"]'];
    for (const sel of selectors) {
      const el = msgBlock.querySelector(sel);
      if (el) {
        const text = elementToText(el, removeBtn);
        if (text) return text;
      }
    }
    // Fallback: весь текст блока минус автор/время
    return elementToText(msgBlock, ['.track--item__title', '.track--item__sidebar']);
  }

  // ── Extract all messages ────────────────────────────────────────────────────

  function extractMessages() {
    const result = [];
    const pageLists = document.querySelectorAll('.track-page-list');
    let isRelated = false;

    for (const pl of pageLists) {
      // Определяем секцию "относится к заказу"
      const toggle = pl.querySelector('.step-block-order__dialog-toggle');
      if (toggle) {
        isRelated = toggle.textContent.includes('относится к заказу');
      }

      let curDate = '';
      for (const child of pl.children) {
        // Заголовок даты
        if (child.className.includes('date-hr')) {
          curDate = child.textContent.trim();
          continue;
        }
        if (!child.classList.contains('track-page__group')) continue;

        for (const item of child.children) {
          // Один item может содержать НЕСКОЛЬКО сообщений от одного автора подряд
          const msgBlocks = item.querySelectorAll('.js-message-block');

          if (msgBlocks.length > 0) {
            for (const msgBlock of msgBlocks) {
              // ── Обычное сообщение ────────────────────────────────────────
              const author = msgBlock.querySelector('a[href*="/user/"]')?.textContent.trim() || '';
              const time   = msgBlock.querySelector('.track--item__sidebar-time')?.textContent.trim() || '';
              const text   = getMsgText(msgBlock);

              // Цитата — берём весь контейнер целиком (innerText работает, элемент в DOM)
              const quoteContainer = msgBlock.querySelector('[class*="message-quote"]');
              const quote = quoteContainer
                ? quoteContainer.innerText.trim().split('\n').filter(Boolean).map((l) => `> ${l}`).join('\n') + '\n\n'
                : '';

              // Файлы в сообщении
              const files = [];
              const seenUrls = new Set();
              msgBlock.querySelectorAll('a[href*="kwork.ru/files"]').forEach((a) => {
                if (seenUrls.has(a.href)) return;
                seenUrls.add(a.href);
                const name = a.getAttribute('data-name')
                  || a.textContent.trim()
                  || decodeURIComponent(a.href.split('/').pop().replace('?attachment=1', ''));
                files.push({ name, url: a.href });
              });

              result.push({
                type: 'message',
                section: isRelated ? 'related' : 'main',
                date: curDate,
                time,
                author,
                text: quote + text,
                files,
              });
            }
          } else {
            // ── Системное событие ──────────────────────────────────────────
            const h3 = item.querySelector('h3');
            if (!h3) continue;

            const sidebarRaw = item.querySelector('.track--item__sidebar, [class*="item__sidebar"]')?.textContent || item.textContent;

            // Время: сначала ищем элемент с классом, потом regex по тексту блока
            let time2 = item.querySelector('.track--item__sidebar-time, [class*="sidebar-time"]')?.textContent.trim() || '';
            if (!time2) {
              const tm = sidebarRaw.match(/\b(\d{1,2}:\d{2})\b/);
              if (tm) time2 = tm[1];
            }

            // Дата: используем curDate, при отсутствии ищем в тексте блока
            let dateStr = curDate;
            if (!dateStr) {
              const dm = sidebarRaw.match(/\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+\d{4})?/);
              if (dm) dateStr = dm[0];
            }

            // Тело: весь текст блока за вычетом заголовка и сайдбара
            const body  = elementToText(item, ['h3', '.track--item__sidebar', '[class*="item__sidebar"]']);
            const title = h3.textContent.replace(time2, '').trim();
            result.push({
              type: 'system',
              section: isRelated ? 'related' : 'main',
              date: dateStr,
              time: time2,
              title,
              text: body,
            });
          }
        }
      }
    }
    return result;
  }

  // ── Extract order meta ──────────────────────────────────────────────────────

  function extractOrderInfo() {
    const orderId = getOrderId();

    // Название кворка (услуги)
    const serviceEl = document.querySelector('table td a, [class*="order-service__title"], [class*="service-title"]');
    const serviceName = serviceEl ? serviceEl.textContent.trim() : '';

    // Заголовок страницы как fallback
    const titleH1 = document.querySelector('h1, .track-order__title');
    const pageTitle = titleH1 ? titleH1.textContent.trim() : document.title;

    // Стоимость
    const priceEl = document.querySelector(
      '.js-order-total-price, [class*="order-info__price--current"], [class*="order-info__price"]'
    );
    const price = priceEl ? priceEl.textContent.trim() : '';

    // Дата оплаты (из шапки заказа)
    const allText = document.body.innerText;
    const dateMatch = allText.match(/Заказ №\d+\s+([\d]+\s+\w+(?:\s+\d{4})?(?:,\s*[\d:]+)?)/);
    const paidDate = dateMatch ? dateMatch[1].trim() : '';

    // Покупатель
    const buyerLinks = [...document.querySelectorAll('a[href*="/user/"]')]
      .filter((a) => !a.href.includes('/messages') && !a.textContent.trim().toLowerCase().includes('lavrocoder'));
    const buyerLink = buyerLinks[0];
    const buyerName = buyerLink ? buyerLink.textContent.trim() : '';
    const buyerUrl  = buyerLink ? buyerLink.href : '';

    // Файлы заказа (общий список — дедупликация)
    const fileLinks = [];
    const seenUrls = new Set();
    document.querySelectorAll('a[href*="kwork.ru/files"]').forEach((a) => {
      if (seenUrls.has(a.href)) return;
      if (!a.href.includes('?attachment=1') && !a.href.includes('/archive.zip')) return;
      seenUrls.add(a.href);
      const name = a.getAttribute('data-name')
        || a.textContent.trim()
        || decodeURIComponent(a.href.split('/').pop().replace('?attachment=1', ''));
      fileLinks.push({ name, url: a.href });
    });

    // Отзыв
    let reviewText = '';
    let myReply    = '';
    const reviewIdx = allText.search(/оставил (положительный|отрицательный|нейтральный) отзыв/);
    if (reviewIdx >= 0) {
      const chunk = allText.substring(reviewIdx, reviewIdx + 600);
      const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
      // Ищем строку с текстом отзыва — пропускаем «оставил …», имя, «N лет назад», «Ответить»
      const skipRe = /оставил|лет назад|год назад|месяц|Ответить на отзыв|Статус|Цена|Покупатель|Выполнен/i;
      for (const line of lines) {
        if (!skipRe.test(line) && line.length > 5) {
          reviewText = line;
          break;
        }
      }
      // Ответ исполнителя
      const replyIdx = chunk.indexOf('lavrocoder');
      if (replyIdx >= 0) {
        const replyChunk = chunk.substring(replyIdx);
        const replyLines = replyChunk.split('\n').map((l) => l.trim()).filter(Boolean);
        for (const line of replyLines) {
          if (line !== 'lavrocoder' && !skipRe.test(line) && line.length > 5) {
            myReply = line;
            break;
          }
        }
      }
    }

    return { orderId, serviceName, pageTitle, price, paidDate, buyerName, buyerUrl, fileLinks, reviewText, myReply };
  }

  // ── Format Markdown ─────────────────────────────────────────────────────────

  function formatMessage(m) {
    const dt = [m.date, m.time].filter(Boolean).join(', ');
    let out = `**${m.author || '[системное]'}** (${dt}):\n`;

    if (m.text) {
      const normalizedText = m.text.split(/\n+/).map((l) => l.trim()).filter(Boolean).join('\n\n');
      out += normalizedText + '\n';
    } else if (!m.files?.length) {
      out += '[изображение или вложение без текста]\n';
    }

    if (m.files?.length) {
      out += '\n*Прикреплённые файлы:*\n';
      m.files.forEach((f) => {
        out += `- ${f.name || 'файл'} — ${f.url}\n`;
      });
    }

    return out + '\n---\n\n';
  }

  function formatSystemEvent(e) {
    const dt = [e.date, e.time].filter(Boolean).join(', ');
    let out = `**[${e.title}]**${dt ? ' (' + dt + ')' : ''}`;
    if (e.text) {
      const normalizedText = e.text.split(/\n+/).map((l) => l.trim()).filter(Boolean).join('\n\n');
      out += '\n\n' + normalizedText;
    }
    return out + '\n\n---\n\n';
  }

  function buildMarkdown(info, messages) {
    const title = info.serviceName || info.pageTitle || 'Заказ';
    let md = `# Заказ #${info.orderId} — ${title}\n\n`;
    md += `**Заказчик:** ${info.buyerName}${info.buyerUrl ? ' (' + info.buyerUrl + ')' : ''}\n`;
    md += `**Стоимость:** ${info.price}\n`;
    if (info.serviceName) md += `**Услуга:** ${info.serviceName}\n`;
    if (info.paidDate)    md += `**Дата оплаты:** ${info.paidDate}\n`;
    md += `**Статус:** Выполнен\n\n---\n\n`;

    // Сообщения из раздела "относится к заказу" (в хронологическом порядке)
    const relatedItems = messages.filter((m) => m.section === 'related');
    if (relatedItems.length) {
      md += `## Переписка до заказа (относится к заказу)\n\n`;
      relatedItems.forEach((m) => {
        md += m.type === 'message' ? formatMessage(m) : formatSystemEvent(m);
      });
    }

    // Основная переписка + системные события вперемешку (порядок DOM = хронология)
    const mainItems = messages.filter((m) => m.section === 'main');
    md += `## Переписка\n\n`;
    if (mainItems.length) {
      mainItems.forEach((m) => {
        md += m.type === 'message' ? formatMessage(m) : formatSystemEvent(m);
      });
    } else {
      md += '_Сообщений нет._\n\n';
    }

    // Файлы
    md += `## Файлы заказа\n\n`;
    if (info.fileLinks.length) {
      info.fileLinks.forEach((f) => { md += `- ${f.name || 'файл'} — ${f.url}\n`; });
    } else {
      md += 'Файлы не прикреплены.\n';
    }

    // Отзывы
    md += `\n## Отзывы\n\n`;
    if (info.reviewText) {
      md += `**Заказчик:** ${info.reviewText}\n`;
      md += `**Мой ответ:** ${info.myReply || 'не оставлен'}\n`;
    } else {
      md += 'Отзыв не оставлен.\n';
    }

    return md;
  }

  // ── Download ────────────────────────────────────────────────────────────────

  function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // ── Main ────────────────────────────────────────────────────────────────────

  async function onCollect() {
    btn.disabled = true;
    try {
      setStatus('⏳ Раскрываю переписку…');
      await expandAll();

      setStatus('⏳ Извлекаю данные…');
      await sleep(400);

      const info     = extractOrderInfo();
      const messages = extractMessages();
      const md       = buildMarkdown(info, messages);
      const filename = `${info.orderId}_raw.md`;

      downloadFile(md, filename);

      const msgCount = messages.filter((m) => m.type === 'message').length;
      setStatus(`✅ ${filename} (${msgCount} сообщ.)`, '#1a7a2d');
      setTimeout(() => {
        setStatus('📥 Скачать raw.md', '#21a038');
        btn.disabled = false;
      }, 4000);
    } catch (err) {
      setStatus('❌ Ошибка', '#c0392b');
      console.error('[kwork-collector]', err);
      setTimeout(() => {
        setStatus('📥 Скачать raw.md', '#21a038');
        btn.disabled = false;
      }, 4000);
    }
  }
})();
