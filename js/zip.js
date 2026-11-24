// Monta um arquivo .zip no navegador (sem compressão: fotos JPG já vêm comprimidas).
// Uso: const z = new Zip(); await z.adicionar('pasta/arquivo.txt', 'texto' | Blob | Uint8Array); z.gerar() -> Blob

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dataDos(d) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dia = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [hora, dia];
}

async function paraBytes(conteudo) {
  if (conteudo instanceof Uint8Array) return conteudo;
  if (typeof conteudo === 'string') return new TextEncoder().encode(conteudo);
  if (conteudo instanceof ArrayBuffer) return new Uint8Array(conteudo);
  return new Uint8Array(await conteudo.arrayBuffer());
}

export class Zip {
  constructor() {
    this.partes = [];
    this.central = [];
    this.posicao = 0;
    this.nomes = new Set();
    this.bytes = 0;
  }

  // Evita nomes repetidos dentro do zip (acrescenta " (2)", " (3)"…).
  nomeLivre(nome) {
    let n = nome.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!this.nomes.has(n)) { this.nomes.add(n); return n; }
    const ponto = n.lastIndexOf('.');
    const [base, ext] = ponto > n.lastIndexOf('/') ? [n.slice(0, ponto), n.slice(ponto)] : [n, ''];
    for (let i = 2; ; i++) {
      const t = `${base} (${i})${ext}`;
      if (!this.nomes.has(t)) { this.nomes.add(t); return t; }
    }
  }

  async adicionar(nome, conteudo, data = new Date()) {
    const dados = await paraBytes(conteudo);
    const nomeBytes = new TextEncoder().encode(this.nomeLivre(nome));
    const crc = crc32(dados);
    const [hora, dia] = dataDos(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8 (acentos)
    local.setUint16(8, 0, true); // sem compressão
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nomeBytes.length, true);
    local.setUint16(28, 0, true);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, hora, true);
    cen.setUint16(14, dia, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, dados.length, true);
    cen.setUint32(24, dados.length, true);
    cen.setUint16(28, nomeBytes.length, true);
    cen.setUint32(42, this.posicao, true);

    this.partes.push(local.buffer, nomeBytes, dados);
    this.central.push(cen.buffer, nomeBytes);
    this.posicao += 30 + nomeBytes.length + dados.length;
    this.bytes += dados.length;
    if (this.posicao > 0xFFFFFFFF - 1e6) throw new Error('Pacote grande demais (mais de 4 GB). Baixe menos demandas por vez.');
  }

  gerar() {
    const tamCentral = this.central.reduce((t, p) => t + p.byteLength, 0);
    const fim = new DataView(new ArrayBuffer(22));
    const qtd = this.central.length / 2;
    fim.setUint32(0, 0x06054b50, true);
    fim.setUint16(8, qtd, true);
    fim.setUint16(10, qtd, true);
    fim.setUint32(12, tamCentral, true);
    fim.setUint32(16, this.posicao, true);
    return new Blob([...this.partes, ...this.central, fim.buffer], { type: 'application/zip' });
  }
}

// Entrega um Blob como download.
export function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
