"""Monta a página de treinamento (um único HTML) a partir do código real do app."""
import base64
import re
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
AQUI = Path(__file__).parent

# ordem de dependência; store.js é trocado pela versão em memória
MODULOS = ['util', 'store', 'api', 'simbolo', 'sync', 'rede', 'relatorio', 'avisos', 'tema', 'mapa', 'comum', 'zip', 'lider', 'banco', 'motoqueiro', 'app']

CRIAR_MAPA_DEMO = '''export function criarMapa(el, { centro = MANAUS, zoom = 17 } = {}) {
  const mapa = L.map(el, { zoomControl: true, minZoom: 15, maxZoom: 22 }).setView(centro, zoom);
  mapa.setMaxBounds(L.latLngBounds(em(-700, -700), em(700, 700)));
  desenharCidadeFalsa(mapa);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapa);
  setTimeout(() => mapa.invalidateSize(), 60);
  return mapa;
}

'''


def fonte(nome):
    if nome == 'store':
        return (AQUI / 'store-memoria.js').read_text()
    txt = (APP / 'js' / f'{nome}.js').read_text()
    if nome == 'mapa':
        txt = txt.replace('export const MANAUS = [-3.1019, -60.025];', 'export const MANAUS = CENTRO;')
        ini = txt.index('export function criarMapa')
        fim = txt.index('export function desenharArea')
        txt = txt[:ini] + CRIAR_MAPA_DEMO + txt[fim:]
    if nome == 'comum':
        txt = txt.replace('<div class="linha-botoes"><a class="btn" href="${url}" target="_blank" rel="noopener" download="${esc(arq.nome)}">Abrir em tela cheia / baixar</a></div>', '')
        assert 'download=' not in txt
    return txt


def transformar(nome, txt):
    # imports -> desestruturação do registro de módulos
    def imp(m):
        nomes = ' '.join(m.group(1).split())
        mod = m.group(2)
        return f'const {{ {nomes} }} = M.{mod};'
    txt, n = re.subn(r"import\s*\{([^}]*)\}\s*from\s*'\./(\w+)\.js';", imp, txt)
    assert 'import ' not in re.sub(r"//.*", '', txt).split('\n')[0:0] or True
    exportados = re.findall(r'^export\s+(?:async\s+)?(?:function|const|let|class)\s+([\w$]+)', txt, flags=re.M)
    txt = re.sub(r'^export\s+', '', txt, flags=re.M)
    sobra = re.findall(r'^\s*(import|export)\b.*$', txt, flags=re.M)
    assert not sobra, (nome, sobra)
    return f"M.{nome} = (() => {{\n{txt}\nreturn {{ {', '.join(exportados)} }};\n}})();\n"


def css_app():
    css = (APP / 'css' / 'app.css').read_text()
    css = css.replace('html, body { height: 100%; margin: 0; }\n', '')
    css = css.replace('\nbody {\n', '\n.app {\n', 1)
    css = css.replace('body.modo-campo', '.app.modo-campo')
    css = css.replace('100dvh', '100cqh').replace('100vh', '100cqh')
    css = re.sub(r'@media \(max-width: (\d+)px\)', r'@container app (max-width: \1px)', css)
    assert 'body' not in css.replace('.app', ''), [l for l in css.splitlines() if 'body' in l]
    for nome in ('fundo-canto.svg', 'fundo-canto-2.svg'):
        uri = 'data:image/svg+xml;base64,' + base64.b64encode((APP / 'icones' / nome).read_bytes()).decode()
        css = css.replace(f'url("../icones/{nome}")', f'url("{uri}")')
    css = css.replace('background-attachment: fixed;', 'background-attachment: local;')
    assert '../icones/' not in css
    return css


def main():
    modulos = '\n'.join(transformar(n, fonte(n)) for n in MODULOS)
    demo = (AQUI / 'demo.js').read_text().replace('/*MODULOS*/', 'const M = {};\n' + modulos)
    script = demo + '\n' + (AQUI / 'controle.js').read_text()
    icone = 'data:image/svg+xml;base64,' + base64.b64encode((APP / 'icones' / 'icone.svg').read_bytes()).decode()
    # o app usa icones/icone.svg; na página publicada vira data: URI
    script = script.replace('src="icones/icone.svg"', f'src="{icone}"').replace('src="icones/icone-192.png"', f'src="{icone}"')
    script = script.replace("'icones/icone-192.png'", f"'{icone}'")
    assert 'icones/' not in script, 'ainda há caminho de ícone no script'
    html = (AQUI / 'shell.html').read_text()
    html = html.replace('/*LEAFLET_CSS*/', (AQUI / 'leaflet.css').read_text())
    html = html.replace('/*APP_CSS*/', css_app())
    html = html.replace('/*ICONE*/', icone)
    for marca, nome in (('/*CANTO1*/', 'fundo-canto.svg'), ('/*CANTO2*/', 'fundo-canto-2.svg')):
        html = html.replace(marca, 'data:image/svg+xml;base64,' + base64.b64encode((APP / 'icones' / nome).read_bytes()).decode())
    html = html.replace('/*SCRIPT*/', script.replace('</script>', '<\\/script>'))
    saida = AQUI / 'rondaluz-treinamento.html'
    saida.write_text(html)
    print(saida, len(html))


main()
