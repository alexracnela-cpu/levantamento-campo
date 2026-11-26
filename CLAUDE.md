# RondaLuz — regras de trabalho

App web (PWA) de levantamento de campo de iluminação pública em Manaus.
HTML/CSS/JS sem build, Leaflet, Supabase (RLS), publicado pelo GitHub Pages a cada push na `main`
(https://alexracnela-cpu.github.io/levantamento-campo/; conferir a VERSAO em .../sw.js).
Interface e textos sempre em português.

## ⚠ Produção é o servidor próprio (desde 25/11/2026), não o Supabase
- O RondaLuz roda no mao-srv-fleet (`/data/rondaluz`, https://rondaluz.manausluz.com.br): Postgres + PostgREST + api Node
  que imita o Supabase. **Sem tempo real** (`api.ouvir` confere a cada 20 s). O GitHub Pages deste repositório ainda aponta
  para o Supabase antigo e não é mais produção.
- O código do servidor fica no PC do usuário (`Downloads\Flui-Rondaluz\rondaluz\`). Para publicar: montar um zip
  `rondaluz-vX.Y.Z.zip` a partir do anterior, copiando daqui `js/*.js` (menos `api.js`) e `css/app.css` para `web/site/`;
  no `web/site/js/api.js` e no `web/site/sw.js` do servidor só acrescentar o que mudou (rotas novas, VERSAO, ARQUIVOS).
  Banco: `.sql` numerado em `sql-projeto/` (idempotente, sem `supabase_realtime`, termina com conferência) + `NOTA-vX.Y.Z.md`.
- Scripts inline do relatório e do tema têm hash na CSP do servidor (`web/seguranca.conf`): mudou, recalcule.

## Toda mudança no app vale também para o treinamento (regra do usuário)
Depois de qualquer alteração em `js/`, `css/` ou `icones/`:
1. Ajuste o simulador se precisar (`treinamento/demo.js`: dados de exemplo e o Supabase de mentira;
   `treinamento/shell.html`: roteiro; `treinamento/build.py`: lista `MODULOS` quando surgir módulo novo).
2. Gere a página: `python3 treinamento/build.py` → `treinamento/rondaluz-treinamento.html` (não vai para o Git).
3. Republique o artefato **"RondaLuz — Treinamento (v31.1)"** (slug `1f498996-0961-48e7-9641-169bda85000f`)
   com `publish_files`, arquivo como `index.html`, usando a versão atual como `base_version`.
   (Os antigos `2607a81c-…` e `6c3dbae9-…` ficaram públicos e não dá para republicar sem acesso à internet; não usar.)
   O montador recusa a palavra "body" no CSS (inclusive `tbody`): use classes.
4. Teste o fluxo mexido no simulador (Playwright + Leaflet local) antes de publicar.

## Outras regras
- Mudou arquivo do app: aumente `VERSAO` em `sw.js` (e inclua arquivos novos na lista `ARQUIVOS`).
- Tabela/coluna nova no Supabase: crie um `.sql` em `supabase/`, acrescente ao `schema.sql`,
  dê `GRANT ... TO authenticated` (projetos novos não liberam tabelas para a API) e passe o SQL
  pronto para o usuário rodar no SQL Editor. Confira depois se foi aplicado.
- O app envia campos novos assim que publicado: sem o SQL rodado, a fila do celular fica parada.
- Símbolo = bloco do AutoCAD (`js/simbolo.js`), tamanho padrão 2,5 m, inserção no centro do poste.
- Rede: secundária contínua, primária tracejada; existente azul, inexistente laranja (`js/rede.js`).
