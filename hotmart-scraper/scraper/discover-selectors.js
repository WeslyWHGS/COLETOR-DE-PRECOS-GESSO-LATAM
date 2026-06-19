/**
 * discover-selectors.js
 *
 * Ferramenta de diagnóstico: abre o SEU checkout Hotmart, identifica
 * automaticamente os seletores do preço e do botão de seleção de país,
 * e imprime o resultado com instruções prontas para usar.
 *
 * Uso:
 *   CHECKOUT_URL=https://pay.hotmart.com/XXXXXXXX node discover-selectors.js
 *
 * O script vai:
 *   1. Abrir o checkout com browser VISÍVEL
 *   2. Mapear todos os elementos que parecem preços
 *   3. Mapear todos os elementos que parecem seletores de país
 *   4. Tirar screenshot anotado
 *   5. Imprimir as variáveis de ambiente prontas para copiar
 */

'use strict';

const { chromium } = require('playwright');
const fs            = require('fs');
const path          = require('path');

const CHECKOUT_URL = (process.env.CHECKOUT_URL || '').trim();

if (!CHECKOUT_URL) {
  console.error('\n[ERRO] Defina CHECKOUT_URL antes de rodar:\n');
  console.error('  Windows CMD :  set CHECKOUT_URL=https://pay.hotmart.com/XXX && node discover-selectors.js');
  console.error('  PowerShell  :  $env:CHECKOUT_URL="https://pay.hotmart.com/XXX"; node discover-selectors.js');
  console.error('  Mac/Linux   :  CHECKOUT_URL=https://pay.hotmart.com/XXX node discover-selectors.js\n');
  process.exit(1);
}

const OUTPUT_DIR = path.resolve(__dirname, '..', 'discovery');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const CURRENCY_HINTS = /[$€£₡R]|BRL|MXN|COP|ARS|PEN|CLP|BOB|CRC|DOP|GTQ|HNL|PYG|UYU|PAB|USD|EUR/;

async function run() {
  console.log('\n' + '═'.repeat(60));
  console.log('  Hotmart Selector Discovery');
  console.log(`  URL: ${CHECKOUT_URL}`);
  console.log('═'.repeat(60));
  console.log('\n  O browser vai abrir. Aguarde o checkout carregar...\n');

  const browser = await chromium.launch({
    headless: false, // VISÍVEL para você ver o que está acontecendo
    slowMo:   500,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    viewport:  { width: 1366, height: 768 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale:    'pt-BR',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  console.log('  Carregando checkout…');
  await page.goto(CHECKOUT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  console.log('  ✓ Página carregada. Analisando elementos…\n');

  // ── Mapeia elementos de PREÇO ─────────────────────────────────────────────

  const priceElements = await page.evaluate((currencySource) => {
    const rx      = new RegExp(currencySource);
    const walker  = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const results = [];

    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      const el   = walker.currentNode.parentElement;
      if (!el || !text || text.length < 2 || text.length > 60) continue;
      if (!rx.test(text) || !/\d/.test(text)) continue;

      const fontSize = parseFloat(window.getComputedStyle(el).fontSize || '0');
      const rect     = el.getBoundingClientRect();

      // Gera seletor CSS para este elemento
      function getSelector(elem) {
        if (elem.id) return `#${elem.id}`;
        const classes = Array.from(elem.classList).slice(0, 3).join('.');
        if (classes) return `${elem.tagName.toLowerCase()}.${classes}`;
        return elem.tagName.toLowerCase();
      }

      results.push({
        text,
        fontSize,
        selector:  getSelector(el),
        tag:       el.tagName.toLowerCase(),
        classes:   el.className,
        dataAttrs: JSON.stringify(el.dataset),
        top:       Math.round(rect.top),
        left:      Math.round(rect.left),
      });
    }

    results.sort((a, b) => b.fontSize - a.fontSize);
    return results.slice(0, 10);
  }, CURRENCY_HINTS.source);

  // ── Mapeia elementos de SELEÇÃO DE PAÍS ──────────────────────────────────

  const countryElements = await page.evaluate(() => {
    const keywords = /país|country|locale|idioma|flag|bandeira|moeda|currency|location/i;
    const results  = [];

    function getSelector(elem) {
      if (elem.id) return `#${elem.id}`;
      const classes = Array.from(elem.classList).slice(0, 3).join('.');
      if (classes) return `${elem.tagName.toLowerCase()}.${classes}`;
      return elem.tagName.toLowerCase();
    }

    const candidates = document.querySelectorAll('button, [role="button"], a, [class*="country"], [class*="locale"], [class*="flag"], [class*="currency"], [aria-label]');

    candidates.forEach(el => {
      const text   = (el.textContent || '').trim().slice(0, 60);
      const label  = el.getAttribute('aria-label') || '';
      const cls    = el.className || '';
      const rect   = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;

      if (!visible) return;

      const relevant = keywords.test(cls) || keywords.test(label) ||
                       /^[A-Z]{2}$/.test(text) ||
                       (text.length < 20 && /\p{Emoji_Flag_Sequence}/u.test(text));

      if (relevant) {
        results.push({
          text,
          label,
          selector: getSelector(el),
          tag:      el.tagName.toLowerCase(),
          classes:  cls,
          top:      Math.round(rect.top),
          left:     Math.round(rect.left),
        });
      }
    });

    return results.slice(0, 10);
  });

  // ── Screenshot anotado ────────────────────────────────────────────────────

  const screenshotPath = path.join(OUTPUT_DIR, 'checkout-discovery.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`  📸 Screenshot salvo: ${screenshotPath}\n`);

  // ── HTML completo para análise manual ────────────────────────────────────

  const htmlPath = path.join(OUTPUT_DIR, 'checkout.html');
  const html     = await page.content();
  fs.writeFileSync(htmlPath, html, 'utf8');

  await browser.close();

  // ── Relatório ─────────────────────────────────────────────────────────────

  console.log('═'.repeat(60));
  console.log('  ELEMENTOS DE PREÇO ENCONTRADOS');
  console.log('═'.repeat(60));

  if (priceElements.length === 0) {
    console.log('  ⚠️  Nenhum elemento de preço detectado automaticamente.');
    console.log('  → Abra o arquivo discovery/checkout.html no navegador');
    console.log('    e use Ctrl+F para buscar o símbolo da moeda.\n');
  } else {
    priceElements.forEach((p, i) => {
      console.log(`\n  [${i + 1}] Texto     : "${p.text}"`);
      console.log(`       Font-size : ${p.fontSize}px | Tag: <${p.tag}>`);
      console.log(`       Seletor   : ${p.selector}`);
      console.log(`       Classes   : ${p.classes.slice(0, 80)}`);
      if (p.dataAttrs !== '{}') {
        console.log(`       data-*    : ${p.dataAttrs}`);
      }
      console.log(`       Posição   : top=${p.top}px left=${p.left}px`);
    });
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  ELEMENTOS DE SELEÇÃO DE PAÍS ENCONTRADOS');
  console.log('═'.repeat(60));

  if (countryElements.length === 0) {
    console.log('  ⚠️  Nenhum seletor de país detectado automaticamente.');
    console.log('  → Verifique no screenshot se existe um botão de bandeira/país.');
    console.log('    Pode ser que o checkout não tenha seletor de país visível\n');
    console.log('    ou que o botão apareça só após rolar a página.\n');
  } else {
    countryElements.forEach((c, i) => {
      console.log(`\n  [${i + 1}] Texto  : "${c.text}"`);
      console.log(`       Seletor: ${c.selector}`);
      console.log(`       Classes: ${c.classes.slice(0, 80)}`);
      if (c.label) console.log(`       aria-label: ${c.label}`);
      console.log(`       Posição: top=${c.top}px left=${c.left}px`);
    });
  }

  // ── Variáveis de ambiente prontas para copiar ────────────────────────────

  console.log('\n' + '═'.repeat(60));
  console.log('  PRÓXIMOS PASSOS');
  console.log('═'.repeat(60));

  const bestPrice   = priceElements[0];
  const bestCountry = countryElements[0];

  console.log('\n  1. Analise o screenshot: discovery/checkout-discovery.png');
  console.log('  2. Identifique o elemento de PREÇO e o BOTÃO de país');
  console.log('  3. Adicione os seletores no GitHub Secrets do repositório:\n');

  if (bestPrice) {
    console.log(`     PRICE_SELECTOR    = ${bestPrice.selector}`);
    console.log(`     (texto detectado: "${bestPrice.text}")\n`);
  }

  if (bestCountry) {
    console.log(`     COUNTRY_BTN_SELECTOR = ${bestCountry.selector}`);
    console.log(`     (texto detectado: "${bestCountry.text}")\n`);
  }

  console.log('  4. Teste localmente com os seletores definidos:');
  console.log('     Windows CMD:');
  console.log(`       set CHECKOUT_URL=${CHECKOUT_URL}`);
  if (bestPrice)   console.log(`       set PRICE_SELECTOR=${bestPrice.selector}`);
  if (bestCountry) console.log(`       set COUNTRY_BTN_SELECTOR=${bestCountry.selector}`);
  console.log('       set DEBUG=true');
  console.log('       node collect-prices.js\n');

  console.log(`  📁 Arquivos de análise salvos em: ${OUTPUT_DIR}`);
  console.log('     - checkout-discovery.png  (screenshot visual)');
  console.log('     - checkout.html           (HTML completo para Ctrl+F)');
  console.log('\n' + '═'.repeat(60) + '\n');
}

run().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
