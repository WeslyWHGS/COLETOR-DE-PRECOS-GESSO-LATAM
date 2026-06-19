# hotmart-price-scraper

Robô que coleta automaticamente os preços do seu checkout Hotmart em todos os países hispanos + Brasil, 2 vezes por dia, via GitHub Actions (gratuito). Os preços ficam salvos em `hotmart-prices.json` e são lidos pelo `price-converter.js` nas suas páginas de venda.

---

## Fluxo geral

```
GitHub Actions (7h e 12h Brasília)
       ↓
  Playwright abre o checkout Hotmart
       ↓
  Itera pelos 20 países (locale na URL)
       ↓
  Coleta o preço exibido em cada país
       ↓
  Salva hotmart-prices.json no repositório
       ↓
  price-converter.js na sua página carrega
  esse JSON e exibe os preços reais
```

---

## Passo a passo: configuração inicial

### 1. Criar o repositório no GitHub

1. Acesse [github.com/new](https://github.com/new)
2. Nome sugerido: `hotmart-price-scraper`
3. Visibilidade: **Public** (necessário para a URL raw funcionar) ou **Private** (precisará de token)
4. Clique em **Create repository**

### 2. Subir os arquivos

Faça upload desta pasta `hotmart-scraper/` para o repositório criado.
Estrutura esperada na raiz do repo:

```
hotmart-price-scraper/
├── .github/
│   └── workflows/
│       └── collect-prices.yml
├── scraper/
│   ├── collect-prices.js
│   ├── countries.js
│   └── package.json
├── hotmart-prices.json
└── README.md
```

### 3. Adicionar o Secret com a URL do checkout

1. No repositório GitHub → **Settings** → **Secrets and variables** → **Actions**
2. Clique em **New repository secret**
3. Nome: `HOTMART_CHECKOUT_URL`
4. Valor: a URL completa do seu checkout Hotmart
   - Exemplo: `https://pay.hotmart.com/XXXXXXXXXXXXXXXX?checkoutMode=2`
5. Clique em **Add secret**

> **Onde encontrar a URL:** Acesse seu produto na Hotmart → "Links de venda" → copie o link do checkout.

### 4. Executar manualmente pela primeira vez

1. No repositório GitHub → aba **Actions**
2. Clique em **Coletar Preços Hotmart** (no menu lateral)
3. Clique em **Run workflow** → **Run workflow**
4. Aguarde ~5 minutos
5. Verifique se `hotmart-prices.json` foi atualizado com os preços

### 5. Conectar ao price-converter.js

Após o passo 4, você terá a URL do seu JSON:
```
https://raw.githubusercontent.com/SEU_USUARIO/hotmart-price-scraper/main/hotmart-prices.json
```

Adicione no HTML da sua página de vendas, antes do `</body>`:

```html
<script
  src="price-converter.js"
  data-live-prices-url="https://raw.githubusercontent.com/SEU_USUARIO/hotmart-price-scraper/main/hotmart-prices.json">
</script>
```

**Ou** configure via JavaScript:
```javascript
PriceConverter.config({
  livePricesUrl: 'https://raw.githubusercontent.com/SEU_USUARIO/hotmart-price-scraper/main/hotmart-prices.json'
});
```

---

## Estrutura do hotmart-prices.json

```json
{
  "updatedAt": "2026-05-17T10:00:00.000Z",
  "checkoutUrl": "https://pay.hotmart.com/...",
  "totalCountries": 18,
  "prices": {
    "MX": {
      "currency": "MXN",
      "amount": 200.99,
      "formatted": "$200.99",
      "locale": "es_MX",
      "name": "México"
    },
    "BR": {
      "currency": "BRL",
      "amount": 51.99,
      "formatted": "R$ 51,99",
      "locale": "pt_BR",
      "name": "Brasil"
    }
  }
}
```

---

## Diagnóstico: o que fazer se um país não for coletado

### Ver os screenshots de debug

1. No GitHub → **Actions** → clique na execução mais recente
2. Em **Artifacts**, baixe `screenshots-XXXXX`
3. Abra o `.png` do país com problema para ver o que o Playwright viu

### O seletor CSS mudou (Hotmart atualizou o checkout)

1. Abra o checkout do seu produto no navegador
2. Clique com o botão direito no preço → **Inspecionar**
3. Anote o seletor CSS do elemento (ex: `.price-component__value`)
4. Adicione o Secret `PRICE_SELECTOR` no repositório com esse valor
5. Execute o workflow novamente

### Forçar re-execução manual

Na aba **Actions** → **Run workflow** a qualquer momento.

### Testar localmente (Windows)

```cmd
cd hotmart-scraper\scraper
npm install
npx playwright install chromium
set CHECKOUT_URL=https://pay.hotmart.com/XXXXXXXX
set DEBUG=true
node collect-prices.js
```

---

## Horário das coletas

Por padrão, o workflow roda às:
- **07:00 horário de Brasília** (10:00 UTC)
- **12:00 horário de Brasília** (15:00 UTC)

Para alterar, edite o arquivo `.github/workflows/collect-prices.yml`:

```yaml
on:
  schedule:
    - cron: '0 10 * * *'   # primeiro horário (UTC)
    - cron: '0 15 * * *'   # segundo horário (UTC)
```

Conversor de horário: [crontab.guru](https://crontab.guru)

---

## Custos

- **GitHub Actions gratuito:** 2.000 minutos/mês para repositórios públicos, 500 minutos para privados
- Cada execução demora ~5 minutos → 2×/dia × 30 dias = **300 minutos/mês** (dentro do limite gratuito)
- **APIs de câmbio e GeoIP:** gratuitas (usadas apenas como fallback quando o JSON não estiver disponível)

---

## Limitações

- O Hotmart pode atualizar o HTML do checkout, quebrando os seletores → verifique os screenshots quando um país parar de aparecer
- Países que exigem autenticação ou VPN no checkout não serão coletados
- A URL raw do GitHub tem cache de ~5 minutos na CDN → preços aparecem nas páginas com até 5 min de atraso após o commit
