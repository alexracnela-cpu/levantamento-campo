# RondaLuz — regras de trabalho

App web (PWA) de levantamento de campo de iluminação pública em Manaus.
HTML/CSS/JS sem build, Leaflet, Supabase (RLS), publicado pelo GitHub Pages a cada push na `main`
(https://alexracnela-cpu.github.io/levantamento-campo/; conferir a VERSAO em .../sw.js).
Interface e textos sempre em português.

## Toda mudança no app vale também para o treinamento (regra do usuário)
Depois de qualquer alteração em `js/`, `css/` ou `icones/`:
1. Ajuste o simulador se precisar (`treinamento/demo.js`: dados de exemplo e o Supabase de mentira;
   `treinamento/shell.html`: roteiro; `treinamento/build.py`: lista `MODULOS` quando surgir módulo novo).
2. Gere a página: `python3 treinamento/build.py` → `treinamento/rondaluz-treinamento.html` (não vai para o Git).
3. Republique o artefato **"RondaLuz — Treinamento (v31)"** (slug `6c3dbae9-47f4-4a19-975e-5d4c48bb10bf`)
   com `publish_files`, arquivo como `index.html`, usando a versão atual como `base_version`.
   (O antigo, slug `2607a81c-…`, é público e não dá para republicar sem acesso à internet; não usar.)
4. Teste o fluxo mexido no simulador (Playwright + Leaflet local) antes de publicar.

## Outras regras
- Mudou arquivo do app: aumente `VERSAO` em `sw.js` (e inclua arquivos novos na lista `ARQUIVOS`).
- Tabela/coluna nova no Supabase: crie um `.sql` em `supabase/`, acrescente ao `schema.sql`,
  dê `GRANT ... TO authenticated` (projetos novos não liberam tabelas para a API) e passe o SQL
  pronto para o usuário rodar no SQL Editor. Confira depois se foi aplicado.
- O app envia campos novos assim que publicado: sem o SQL rodado, a fila do celular fica parada.
- Símbolo = bloco do AutoCAD (`js/simbolo.js`), tamanho padrão 2,5 m, inserção no centro do poste.
- Rede: secundária contínua, primária tracejada; existente azul, inexistente laranja (`js/rede.js`).
