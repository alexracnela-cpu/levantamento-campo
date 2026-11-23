# RondaLuz — levantamentos de campo de iluminação pública (Manaus)

App web que abre no PC e no celular (instalável como app).

- **Líder (PC):** desenha a área no mapa, anexa o ofício, define título, descrição, prazo e motoqueiro, acompanha os pontos chegando ao vivo, muda o status e promove membros a líder na tela **Equipe**.
- **Motoqueiro (celular):** vê as tarefas dele, abre o ofício, vê a área e a própria posição pelo GPS, toca no mapa para pôr o símbolo do levantamento, arrasta, gira e muda o tamanho (em metros, escala real), preenche a ficha com observações e fotos. O app avisa quando o ponto fica fora da área.
- **Sem sinal:** pontos e fotos ficam guardados no celular e sobem sozinhos quando a internet volta. Os pedaços de mapa já vistos também ficam guardados.

Tudo em HTML, CSS e JavaScript, sem etapa de build. Mapa com Leaflet (OpenStreetMap e satélite Esri). Dados, login e arquivos no Supabase.

---

## Como colocar no ar

### 1. Supabase

1. Em <https://supabase.com>, crie um projeto (região: São Paulo).
2. **SQL Editor → New query**: cole todo o arquivo `supabase/schema.sql` e clique em **Run**.
   Ele cria as tabelas, as regras de acesso, os buckets `oficios` e `fotos` e liga o tempo real.
3. **Authentication → Sign In / Providers → Email**: desligue **Confirm email** e salve.
4. No topo do projeto, clique em **Connect** e copie a **Project URL** e a chave **publishable** (`sb_publishable_...`).
5. Abra `js/config.js` e cole os dois valores.

> Rode o `schema.sql` **antes** de criar a primeira conta: é ele que transforma a primeira conta em líder.

### 2. GitHub

Envie todos os arquivos desta pasta para o repositório `levantamento-campo`
(no site do GitHub: **Add file → Upload files**, arraste a pasta inteira e confirme).

### 3. Netlify

1. Em <https://app.netlify.com>: **Add new site → Import an existing project → GitHub** e escolha `levantamento-campo`.
2. Deixe o comando de build vazio e a pasta de publicação como `.` (o `netlify.toml` já cuida disso).
3. Depois de publicado, copie o endereço do site.
4. No Supabase, **Authentication → URL Configuration**: cole o endereço do site em **Site URL**.

### 4. Primeiro uso

1. Abra o site no PC e clique em **Criar conta**: essa primeira conta vira **líder**.
2. Os motoqueiros abrem o site no celular e criam a conta deles (entram como motoqueiro).
3. No celular, use **Adicionar à tela inicial** (Android: menu ⋮ do Chrome; iPhone: botão Compartilhar do Safari).
4. Permita **localização** e **câmera** quando o celular pedir.

---

## O símbolo

Igual ao bloco do AutoCAD: círculo duplo (o poste), braço e garra, com a metade de cima do círculo interno em vermelho.

- **Tamanho** = comprimento do centro do círculo até a ponta da garra, em metros.
- **Rumo** = para onde o braço aponta: 0° norte, 90° leste (padrão, como o bloco), 180° sul, 270° oeste.
- No celular: arraste o **círculo tracejado** para mover; arraste a **bolinha vermelha** da ponta para girar e esticar. Os botões − / + e ⟲ / ⟳ da ficha fazem ajuste fino.

As proporções do desenho ficam em `js/simbolo.js` (`PROPORCAO`) se precisar ajustar.

## Estrutura

```
index.html              página única
css/app.css             visual "prancheta de campo"
js/config.js            URL e chave do Supabase  ← preencher
js/app.js               acesso, rotas e barra do topo
js/lider.js             painel, nova tarefa, acompanhamento ao vivo, equipe
js/motoqueiro.js        minhas tarefas e mapa de campo
js/simbolo.js           desenho do símbolo em escala real
js/mapa.js              mapa, desenho da área, GPS
js/sync.js              fila de envio offline
js/store.js             armazenamento local (IndexedDB)
sw.js                   service worker (app e mapas offline)
supabase/schema.sql     banco, regras de acesso e arquivos
```

## Ao alterar o código

Aumente `VERSAO` em `sw.js` (ex.: `v1` → `v2`) para os celulares baixarem a versão nova.

## Fica para depois

Exportação para Power BI, KML e DXF; outros tipos de símbolo.
