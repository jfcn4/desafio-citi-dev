// Jardim do estoque: cada planta cadastrada vira uma planta desenhada.
// - Mais vasos em estoque = mais folhas e uma planta maior.
// - Estoque zero = planta murcha, com uma plaquinha de "esgotada".
// - A posição segue a luminosidade: cada planta fica na faixa de luz de que precisa
//   (sol pleno à esquerda, meia-sombra no meio, sombra embaixo da árvore à direita).
// - Uma venda derruba folhas; uma venda recusada (400) faz a planta balançar.
// O som ambiente é gerado na hora com a Web Audio API e começa desligado,
// porque o navegador só permite tocar som depois de um clique do visitante.
(() => {
  const SVG = "http://www.w3.org/2000/svg";
  const LARGURA = 1000;
  const ALTURA = 300;
  const CHAO = 268;
  const ALTURA_VASO = 28;
  const MAX_FOLHAS = 14;
  const ZONAS = {
    SOL_PLENO: { inicio: 30, fim: 350, rotulo: "Sol pleno", icone: "sol" },
    MEIA_SOMBRA: { inicio: 350, fim: 660, rotulo: "Meia-sombra", icone: "meia" },
    SOMBRA: { inicio: 660, fim: 970, rotulo: "Sombra", icone: "lua" },
  };
  // As faixas dividem esta largura conforme a quantidade de plantas de cada uma,
  // para uma faixa cheia não espremer as plantas
  const AREA = { inicio: 30, fim: 970 };

  // Ângulos das folhas em ordem de nascimento: as primeiras ficam no centro e
  // as próximas se abrem para os lados. Assim, quando o estoque cai, somem as
  // últimas folhas, e o desenho não se reorganiza inteiro.
  const ANGULOS = [0, -32, 32, -58, 58, -16, 16, -45, 45, -70, 70, -8, 8, -26];
  const VERDES = ["#4f7a4a", "#5d8a52", "#3f6b45", "#6b8f4e", "#557d5f"];
  const GATOS = ["#d9904a", "#8d8f8a", "#3d3a36", "#e2cfae"];
  const SECA = { folha: "#b3a57d", caule: "#8f8463" };

  const movimentoReduzido = window.matchMedia("(prefers-reduced-motion: reduce)");

  const criar = (tag, atributos = {}, pai = null) => {
    const no = document.createElementNS(SVG, tag);
    for (const [chave, valor] of Object.entries(atributos)) no.setAttribute(chave, valor);
    if (pai) pai.appendChild(no);
    return no;
  };

  // Gerador pseudoaleatório com semente: a mesma planta sempre ganha o mesmo formato
  const semente = (texto) => {
    let h = 2166136261;
    for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  };
  const gerador = (s) => () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function tipoDaPlanta(p) {
    const texto = `${p.nome} ${p.especie}`.toLowerCase();
    if (/cact|cereus|mandacaru|suculent|opuntia/.test(texto)) return "cacto";
    if (/espada|sansevieria|dracaena|zamio|lavand|alecrim|rosmarinus|capim|grama/.test(texto)) return "fina";
    if (/samambaia|nephrolepis|avenca|feto/.test(texto)) return "miuda";
    return semente(texto) % 2 === 0 ? "larga" : "miuda";
  }

  // ---------- Estilos ----------

  const estilo = document.createElement("style");
  estilo.textContent = `
    .jardim { position: relative; margin-top: 22px; border: 1px solid var(--linha, #ddd3bf); border-radius: 18px; overflow: hidden; background: #f1ecdf; }
    .jardim svg { display: block; width: 100%; height: auto; touch-action: pan-y; }
    .jardim-planta { cursor: pointer; outline: none; }
    .jardim-planta:focus-visible .jardim-vaso { stroke: var(--oliva, #8a9a5b); stroke-width: 4; }
    .jardim-brotar { animation: jardim-brotar 0.9s ease-out both; }
    @keyframes jardim-brotar { from { opacity: 0; } }
    .jardim-respira { transform-box: fill-box; transform-origin: bottom; animation: jardim-respira 3.6s ease-in-out infinite; }
    @keyframes jardim-respira { 50% { transform: scaleY(1.07); } }
    .jardim-zzz { animation: jardim-zzz 4.5s ease-in-out infinite; opacity: 0; }
    @keyframes jardim-zzz { 0% { opacity: 0; transform: translate(0, 0); } 30% { opacity: 0.7; } 100% { opacity: 0; transform: translate(6px, -16px); } }
    .jardim-botoes { position: absolute; bottom: 10px; right: 12px; display: flex; gap: 8px; }
    .jardim-botao {
      display: inline-flex; align-items: center; gap: 6px;
      border: 1px solid var(--linha, #ddd3bf); border-radius: 999px; padding: 6px 14px;
      background: rgba(255, 253, 248, 0.88); color: var(--musgo, #2f4a34); font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .jardim-botao[aria-pressed="true"] { background: var(--musgo, #2f4a34); color: var(--papel, #f6f1e7); border-color: transparent; }
    .jardim:fullscreen { display: flex; align-items: center; justify-content: center; border: none; border-radius: 0; background: #e3ebd3; }
    .jardim:fullscreen svg { width: min(100vw, calc(100vh * ${LARGURA} / ${ALTURA})); }
    .jardim-legenda {
      position: absolute; left: 12px; bottom: 10px; margin: 0; padding: 4px 12px; border-radius: 999px;
      background: rgba(255, 253, 248, 0.8); color: var(--tinta-suave, #5b6659); font-size: 12px;
    }
    .jardim-dica {
      position: absolute; pointer-events: none; transform: translate(-50%, calc(-100% - 10px));
      background: var(--musgo, #2f4a34); color: var(--papel, #f6f1e7); font-size: 12.5px; line-height: 1.3;
      padding: 6px 10px; border-radius: 10px; white-space: nowrap; opacity: 0; transition: opacity 0.2s;
    }
    .jardim-dica.visivel { opacity: 1; }
    .jardim-dica small { display: block; opacity: 0.8; }
    @media (max-width: 640px) {
      .jardim-legenda { display: none; }
      .jardim-botoes { bottom: auto; top: 6px; right: 6px; gap: 4px; }
      .jardim-botao { padding: 3px 9px; font-size: 11px; }
      .jardim-botao-tela { display: none; }
    }
    @media (prefers-reduced-motion: reduce) { .jardim-respira, .jardim-zzz, .jardim-brotar { animation: none; } }
  `;
  document.head.appendChild(estilo);

  // ---------- Cenário ----------

  const secao = document.getElementById("jardim");
  if (!secao) return;

  const svg = criar("svg", {
    viewBox: `0 0 ${LARGURA} ${ALTURA}`,
    role: "group",
    "aria-label": "Jardim do estoque: cada planta desenhada é uma planta da loja",
  });
  secao.appendChild(svg);

  const defs = criar("defs", {}, svg);
  const ceu = criar("linearGradient", { id: "jardim-ceu", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  criar("stop", { offset: 0, "stop-color": "#f5f6e6" }, ceu);
  criar("stop", { offset: 1, "stop-color": "#dfe9cf" }, ceu);
  const brilho = criar("radialGradient", { id: "jardim-sol" }, defs);
  criar("stop", { offset: 0, "stop-color": "#f7dc95", "stop-opacity": 0.9 }, brilho);
  criar("stop", { offset: 1, "stop-color": "#f7dc95", "stop-opacity": 0 }, brilho);
  const sombra = criar("linearGradient", { id: "jardim-sombra", x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  criar("stop", { offset: 0, "stop-color": "#2f4a34", "stop-opacity": 0 }, sombra);
  criar("stop", { offset: 1, "stop-color": "#2f4a34", "stop-opacity": 0.16 }, sombra);

  criar("rect", { width: LARGURA, height: ALTURA, fill: "url(#jardim-ceu)" }, svg);
  const sol = criar("circle", { cx: 120, cy: 30, r: 180, fill: "url(#jardim-sol)" }, svg);
  criar("rect", { x: 560, width: LARGURA - 560, height: ALTURA, fill: "url(#jardim-sombra)" }, svg);

  // Copa de árvore no canto da sombra
  const copa = criar("g", { fill: "#3f6b45", opacity: 0.2 }, svg);
  [[930, -10, 120], [820, -40, 110], [1000, 60, 90], [720, -70, 90]].forEach(([cx, cy, r]) =>
    criar("circle", { cx, cy, r }, copa)
  );

  criar("path", {
    d: `M0 ${CHAO - 40} C 180 ${CHAO - 85}, 330 ${CHAO - 30}, 520 ${CHAO - 62} S 820 ${CHAO - 90}, ${LARGURA} ${CHAO - 48} V ${ALTURA} H 0 Z`,
    fill: "#dde4c8",
  }, svg);
  criar("path", {
    d: `M0 ${CHAO - 6} C 200 ${CHAO - 16}, 420 ${CHAO + 4}, 640 ${CHAO - 10} S 880 ${CHAO - 2}, ${LARGURA} ${CHAO - 12} V ${ALTURA} H 0 Z`,
    fill: "#cdc29f",
  }, svg);

  // Faixas de luz: um rótulo com ícone em cada uma e uma divisória tracejada entre elas
  function desenharIconeLuz(tipo, x, y, pai) {
    const g = criar("g", { transform: `translate(${x} ${y})`, fill: "none", stroke: "#6f7a5f", "stroke-width": 1.6, "stroke-linecap": "round" }, pai);
    if (tipo === "sol") {
      criar("circle", { r: 4.5, fill: "#e9c46a", stroke: "#c99a3a" }, g);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        criar("path", { d: `M${Math.cos(a) * 7} ${Math.sin(a) * 7} L${Math.cos(a) * 9.5} ${Math.sin(a) * 9.5}`, stroke: "#c99a3a" }, g);
      }
    } else if (tipo === "meia") {
      criar("circle", { r: 6.5 }, g);
      criar("path", { d: "M0 -6.5 A6.5 6.5 0 0 0 0 6.5 Z", fill: "#6f7a5f", stroke: "none" }, g);
    } else {
      criar("path", { d: "M3 -6.5 A6.5 6.5 0 1 0 6.5 3 A5 5 0 0 1 3 -6.5 Z", fill: "#6f7a5f", stroke: "none" }, g);
    }
    return g;
  }

  for (const zona of Object.values(ZONAS)) {
    zona.texto = criar("text", {
      y: 31, "text-anchor": "middle",
      fill: "#5f6a52", "font-size": 13, "font-weight": 600, "letter-spacing": "2",
      "font-family": "DM Sans, system-ui, sans-serif",
    }, svg);
    zona.texto.textContent = zona.rotulo.toUpperCase();
    zona.iconeG = desenharIconeLuz(zona.icone, 0, 26.5, svg);
  }
  const divisorias = [0, 1].map(() =>
    criar("path", { stroke: "#9aa58a", "stroke-width": 1, "stroke-dasharray": "2 7", opacity: 0.7 }, svg)
  );

  function desenharFaixas() {
    for (const zona of Object.values(ZONAS)) {
      const centro = (zona.inicio + zona.fim) / 2;
      zona.texto.setAttribute("x", centro + 9);
      zona.iconeG.setAttribute("transform", `translate(${centro + 9 - (zona.rotulo.length * 9.6) / 2 - 22} 26.5)`);
    }
    [ZONAS.MEIA_SOMBRA.inicio, ZONAS.SOMBRA.inicio].forEach((x, i) =>
      divisorias[i].setAttribute("d", `M${x.toFixed(1)} 48 V ${CHAO - 40}`)
    );
  }
  desenharFaixas();

  const camadaPolen = criar("g", { "aria-hidden": "true" }, svg);
  const camadaPlantas = criar("g", {}, svg);
  const camadaQueda = criar("g", { "aria-hidden": "true" }, svg);
  const vazio = criar("text", {
    x: LARGURA / 2, y: CHAO - 90, "text-anchor": "middle", fill: "#7d846f", "font-size": 16,
    "font-family": "Fraunces, Georgia, serif", "font-style": "italic", display: "none",
  }, svg);
  vazio.textContent = "Nenhuma planta para mostrar com esses filtros.";

  const dica = document.createElement("div");
  dica.className = "jardim-dica";
  dica.setAttribute("aria-hidden", "true");
  secao.appendChild(dica);

  const legenda = document.createElement("p");
  legenda.className = "jardim-legenda";
  legenda.textContent = "Cada planta fica na faixa de luz de que precisa. Mais folhas, mais vasos; esgotadas murcham.";
  secao.appendChild(legenda);

  // Pólen flutuando devagar; na sombra ele brilha como vaga-lume
  const polens = Array.from({ length: 18 }, (_, i) => {
    const r = gerador(i + 7);
    const x = r() * LARGURA;
    return {
      no: criar("circle", { r: 1.4 + r() * 1.6, fill: x > 640 ? "#f3e7a1" : "#fff6d6" }, camadaPolen),
      x, y: 60 + r() * (CHAO - 80), fase: r() * 6.28, velocidade: 0.08 + r() * 0.12,
    };
  });

  // ---------- Desenho de cada planta ----------

  function desenharVaso(g, murcha) {
    criar("path", { class: "jardim-vaso", d: `M-18 ${-ALTURA_VASO} L18 ${-ALTURA_VASO} L14 0 L-14 0 Z`, fill: murcha ? "#b9785a" : "#c0603a", stroke: "transparent" }, g);
    criar("rect", { x: -21, y: -ALTURA_VASO - 6, width: 42, height: 8, rx: 2, fill: murcha ? "#9c6a52" : "#a24e2d" }, g);
    criar("ellipse", { cx: 0, cy: -ALTURA_VASO - 5, rx: 17, ry: 2.5, fill: murcha ? "#9b8466" : "#5a4632" }, g);
  }

  // Plaquinha espetada na terra, para a planta esgotada ser reconhecida de longe
  function desenharPlaca(g) {
    const placa = criar("g", { transform: `translate(13 ${-ALTURA_VASO - 4}) rotate(6)` }, g);
    criar("path", { d: "M0 0 V -26", stroke: "#8a6a45", "stroke-width": 2, "stroke-linecap": "round" }, placa);
    criar("rect", { x: -21, y: -40, width: 42, height: 15, rx: 3, fill: "#f6eedb", stroke: "#b8946a", "stroke-width": 1 }, placa);
    const texto = criar("text", {
      x: 0, y: -29.5, "text-anchor": "middle", "font-size": 8.5, "font-weight": 600,
      fill: "#a24e2d", "font-family": "DM Sans, system-ui, sans-serif",
    }, placa);
    texto.textContent = "esgotada";
  }

  // Planta esgotada: galhos que sobem pouco e caem por cima da borda do vaso,
  // com folhas secas e enroladas pendendo nas pontas
  function desenharMurcha(copaG, r) {
    const folhas = [];
    const pontas = [];
    for (let i = 0; i < 5; i++) {
      const lado = i % 2 === 0 ? 1 : -1;
      const alcance = 16 + i * 5 + r() * 6;
      const altura = 26 + r() * 16 - i * 2;
      const fimX = lado * (alcance + 10);
      const fimY = -altura * 0.3;
      const g = criar("g", {}, copaG);
      criar("path", {
        d: `M0 0 C ${lado * 3} ${-altura}, ${lado * alcance} ${-altura * 1.05}, ${fimX} ${fimY}`,
        fill: "none", stroke: SECA.caule, "stroke-width": 1.8, "stroke-linecap": "round",
      }, g);
      const lamina = criar("g", { transform: `translate(${fimX} ${fimY}) rotate(${lado * (150 + r() * 20)})` }, g);
      criar("path", { d: folhaPath(15, 4.5), fill: i % 2 === 0 ? SECA.folha : "#a8935f" }, lamina);
      criar("path", { d: "M0 -2 V -12", stroke: "#8f7d55", "stroke-width": 0.8 }, lamina);
      const meio = criar("g", { transform: `translate(${lado * alcance * 0.55} ${-altura * 0.82}) rotate(${lado * 115})` }, g);
      criar("path", { d: folhaPath(9, 3), fill: "#bfae80" }, meio);
      pontas.push({ x: fimX, y: fimY });
      folhas.push({ no: g, angulo: lado * (3 + r() * 6), fase: r() * 6.28, amplitude: 0.7 });
    }
    return { folhas, altura: 48, pontas };
  }

  function desenharGato(g, r) {
    const cor = GATOS[Math.floor(r() * GATOS.length)];
    const gato = criar("g", { transform: "translate(24 1) scale(0.72)" }, g);
    const corpo = criar("g", { class: "jardim-respira" }, gato);
    criar("path", { d: "M14 -4 C 26 -6, 26 -16, 16 -14", fill: "none", stroke: cor, "stroke-width": 3.5, "stroke-linecap": "round" }, corpo);
    criar("ellipse", { cx: 2, cy: -8, rx: 15, ry: 8.5, fill: cor }, corpo);
    criar("circle", { cx: -11, cy: -11, r: 7, fill: cor }, corpo);
    criar("path", { d: "M-17 -15 L-16 -22 L-11 -17 Z M-9 -17 L-5 -22 L-5 -14 Z", fill: cor }, corpo);
    criar("path", { d: "M-15 -11 q2 1.5 4 0 M-9 -11 q2 1.5 4 0", fill: "none", stroke: "#2b2622", "stroke-width": 1, "stroke-linecap": "round" }, corpo);
    const z = criar("text", { class: "jardim-zzz", x: -6, y: -24, "font-size": 9, fill: "#5b6659", "font-family": "DM Sans, sans-serif" }, gato);
    z.textContent = "z";
  }

  function folhaPath(comprimento, meiaLargura) {
    const l = comprimento;
    const w = meiaLargura;
    return `M0 0 C ${w} ${-l * 0.25}, ${w * 0.9} ${-l * 0.8}, 0 ${-l} C ${-w * 0.9} ${-l * 0.8}, ${-w} ${-l * 0.25}, 0 0 Z`;
  }

  function desenharCacto(copaG, p, r, murcha) {
    const cor = murcha ? "#b8ae86" : "#5f8a55";
    const altura = murcha ? 46 : 44 + Math.min(p.estoque, 20) * 3;
    const corpo = criar("g", {}, copaG);
    criar("rect", { x: -11, y: -altura, width: 22, height: altura + 2, rx: 11, fill: cor }, corpo);
    const bracos = murcha ? 0 : Math.min(3, Math.floor(p.estoque / 4));
    for (let i = 0; i < bracos; i++) {
      const lado = i % 2 === 0 ? 1 : -1;
      const y = -altura * (0.45 + 0.15 * i);
      criar("path", {
        d: `M${lado * 9} ${y} h${lado * 12} q${lado * 6} 0 ${lado * 6} -6 v-${16 + r() * 10}`,
        fill: "none", stroke: cor, "stroke-width": 10, "stroke-linecap": "round", "stroke-linejoin": "round",
      }, corpo);
    }
    for (let i = 0; i < 6; i++) {
      const y = -altura * (0.15 + 0.13 * i);
      criar("path", { d: `M-11 ${y} l-3 -1 M11 ${y - 4} l3 -1`, stroke: "#e9e2c4", "stroke-width": 1 }, corpo);
    }
    if (murcha) {
      for (const x of [-5, 0, 5]) {
        criar("path", { d: `M${x} ${-altura + 8} q 2 ${altura * 0.4} 0 ${altura * 0.8}`, fill: "none", stroke: "#958b66", "stroke-width": 1 }, corpo);
      }
    }
    return { folhas: [], altura, pontas: [{ x: 0, y: -altura }] };
  }

  function desenharFolhas(copaG, p, r, cores, murcha, folhasAntes) {
    const tipo = tipoDaPlanta(p);
    const quantidade = murcha ? 4 : Math.min(MAX_FOLHAS, p.estoque + 1);
    const crescimento = 0.75 + 0.5 * Math.min(p.estoque, 20) / 20;
    const base = (tipo === "fina" ? 92 : 78) * crescimento;
    const folhas = [];
    const pontas = [];

    for (let i = 0; i < quantidade; i++) {
      const sorteio = r();
      let angulo = ANGULOS[i] + (r() - 0.5) * 8;
      if (tipo === "fina") angulo *= 0.45;
      if (murcha) angulo = (i % 2 === 0 ? 1 : -1) * (80 + i * 12);

      const centralidade = 1 - Math.abs(angulo) / 160;
      const haste = murcha ? 22 : tipo === "fina" ? 4 : base * (0.45 + 0.3 * sorteio) * centralidade;
      const g = criar("g", {}, copaG);
      if (!murcha && i >= folhasAntes) g.classList.add("jardim-brotar");

      if (haste > 4) {
        criar("path", {
          d: `M0 0 Q ${(r() - 0.5) * 10} ${-haste / 2} 0 ${-haste}`,
          fill: "none", stroke: cores.caule, "stroke-width": 2, "stroke-linecap": "round",
        }, g);
      }

      let comprimento;
      if (tipo === "miuda" && !murcha) {
        comprimento = base * 0.5;
        for (let k = 0; k < 5; k++) {
          const y = -haste - k * comprimento * 0.2;
          const tamanho = 9 - k * 1.2;
          criar("ellipse", { cx: tamanho * 0.8, cy: y, rx: tamanho, ry: tamanho * 0.42, fill: cores.folha, transform: `rotate(-28 0 ${y})` }, g);
          criar("ellipse", { cx: -tamanho * 0.8, cy: y, rx: tamanho, ry: tamanho * 0.42, fill: cores.folha, transform: `rotate(28 0 ${y})` }, g);
        }
        criar("path", { d: `M0 ${-haste} V ${-haste - comprimento}`, stroke: cores.caule, "stroke-width": 1.5 }, g);
      } else {
        comprimento = murcha ? 22 : tipo === "fina" ? base * (0.75 + 0.35 * sorteio) * centralidade : base * 0.42;
        const meiaLargura = tipo === "fina" ? comprimento * 0.1 : comprimento * 0.42;
        const lamina = criar("g", { transform: `translate(0 ${-haste})` }, g);
        criar("path", { d: folhaPath(comprimento, meiaLargura), fill: cores.folha }, lamina);
        criar("path", { d: `M0 -2 V ${-comprimento * 0.85}`, stroke: cores.nervura, "stroke-width": 1, opacity: 0.55 }, lamina);
      }

      const alcance = haste + comprimento;
      const rad = (angulo * Math.PI) / 180;
      pontas.push({ x: Math.sin(rad) * alcance, y: -Math.cos(rad) * alcance });
      folhas.push({ no: g, angulo, fase: r() * 6.28, amplitude: murcha ? 0.8 : 1.5 + r() * 2 });
    }

    const altura = Math.max(...pontas.map((ponta) => -ponta.y), 20);
    return { folhas, altura, pontas };
  }

  function construir(planta) {
    const p = planta.dados;
    const r = gerador(semente(`${p.id}-${p.especie}`));
    const murcha = p.estoque === 0;
    const verde = VERDES[Math.floor(r() * VERDES.length)];
    const cores = murcha
      ? { folha: SECA.folha, caule: SECA.caule, nervura: "#efe6c9" }
      : { folha: verde, caule: "#3d5a37", nervura: "#d9e8c4" };

    planta.g.replaceChildren();
    planta.copa = criar("g", { transform: `translate(0 ${-ALTURA_VASO - 4})` }, planta.g);
    const giro = criar("g", {}, planta.copa);

    let desenho;
    if (tipoDaPlanta(p) === "cacto") desenho = desenharCacto(giro, p, r, murcha);
    else if (murcha) desenho = desenharMurcha(giro, r);
    else desenho = desenharFolhas(giro, p, r, cores, murcha, planta.folhasAntes ?? MAX_FOLHAS);

    if (murcha) {
      criar("path", { d: folhaPath(12, 4), fill: SECA.folha, transform: "translate(-27 -1) rotate(100)" }, planta.g);
    }
    desenharVaso(planta.g, murcha);
    if (murcha) desenharPlaca(planta.g);
    if (p.petFriendly) desenharGato(planta.g, r);

    planta.giro = giro;
    planta.folhas = desenho.folhas;
    planta.pontas = desenho.pontas;
    planta.altura = desenho.altura + ALTURA_VASO;
    planta.murcha = murcha;
    planta.corFolha = tipoDaPlanta(p) === "cacto" && !murcha ? "#5f8a55" : cores.folha;
    planta.folhasAntes = murcha ? 0 : Math.min(MAX_FOLHAS, p.estoque + 1);
    planta.chave = `${p.estoque}|${p.nome}|${p.especie}|${p.petFriendly}|${p.luminosidade}`;
    planta.g.setAttribute("aria-label", `${p.nome}: ${descreverEstoque(p.estoque)}, ${ZONAS[p.luminosidade].rotulo.toLowerCase()}. Ir para o cartão.`);
  }

  const descreverEstoque = (estoque) =>
    estoque === 0 ? "esgotada" : `${estoque} ${estoque === 1 ? "vaso" : "vasos"}`;

  // ---------- Estado e posições ----------

  const plantas = new Map();
  let ponteiro = null;

  function posicionar() {
    const porZona = { SOL_PLENO: [], MEIA_SOMBRA: [], SOMBRA: [] };
    for (const planta of plantas.values()) porZona[planta.dados.luminosidade]?.push(planta);

    // Cada faixa recebe espaço proporcional ao número de plantas, com um mínimo
    // para o rótulo caber mesmo quando ela está vazia
    const pesos = Object.values(porZona).map((lista) => Math.max(lista.length + 1, 2.6));
    const somaPesos = pesos.reduce((a, b) => a + b, 0);
    let inicio = AREA.inicio;
    Object.values(ZONAS).forEach((zona, i) => {
      zona.inicio = inicio;
      zona.fim = inicio + ((AREA.fim - AREA.inicio) * pesos[i]) / somaPesos;
      inicio = zona.fim;
    });
    desenharFaixas();

    const ordemDeDesenho = [];
    for (const [nome, lista] of Object.entries(porZona)) {
      const zona = ZONAS[nome];
      lista.sort((a, b) => a.dados.id - b.dados.id);
      const espaco = (zona.fim - zona.inicio) / Math.max(lista.length, 1);
      const duasFileiras = espaco < 58;
      lista.forEach((planta, i) => {
        const fundo = duasFileiras && i % 2 === 1;
        planta.alvoX = zona.inicio + espaco * (i + 0.5);
        planta.y = CHAO - (fundo ? 12 : 0);
        planta.escala = Math.max(0.5, Math.min(1.25, (espaco * (duasFileiras ? 1.7 : 1)) / 82)) * (fundo ? 0.93 : 1);
        if (planta.x === undefined) planta.x = planta.alvoX;
        planta.fundo = fundo;
      });
      ordemDeDesenho.push(...lista);
    }
    // Fileira de trás primeiro, para a da frente ficar por cima
    ordemDeDesenho.sort((a, b) => Number(b.fundo) - Number(a.fundo));
    ordemDeDesenho.forEach((planta) => camadaPlantas.appendChild(planta.g));
  }

  function novaPlanta(dados) {
    const g = criar("g", { class: "jardim-planta", tabindex: 0, role: "button" });
    const planta = { dados, g, inclinacao: 0, tremor: 0, agito: 0, fase: semente(String(dados.id)) % 628 / 100 };
    g.addEventListener("click", () => irParaCartao(dados.id));
    g.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" || evento.key === " ") {
        evento.preventDefault();
        irParaCartao(dados.id);
      }
    });
    g.addEventListener("pointerenter", () => {
      mostrarDica(planta);
      planta.agito = 1;
      Som.farfalhar();
    });
    g.addEventListener("focus", () => mostrarDica(planta));
    g.addEventListener("pointerleave", esconderDica);
    g.addEventListener("blur", esconderDica);
    return planta;
  }

  function atualizar(lista) {
    const ids = new Set(lista.map((p) => p.id));
    for (const [id, planta] of plantas) {
      if (!ids.has(id)) {
        planta.g.remove();
        plantas.delete(id);
      }
    }
    for (const dados of lista) {
      let planta = plantas.get(dados.id);
      if (!planta) {
        planta = novaPlanta(dados);
        plantas.set(dados.id, planta);
      }
      planta.dados = dados;
      if (planta.chave !== `${dados.estoque}|${dados.nome}|${dados.especie}|${dados.petFriendly}|${dados.luminosidade}`) construir(planta);
    }
    vazio.setAttribute("display", plantas.size === 0 ? "inline" : "none");
    posicionar();
    if (movimentoReduzido.matches) quadro(0);
  }

  // ---------- Interações ----------

  function irParaCartao(id) {
    const cartao = document.querySelector(`.cartao[data-id="${id}"]`);
    if (!cartao) return;
    cartao.scrollIntoView({ behavior: movimentoReduzido.matches ? "auto" : "smooth", block: "center" });
    cartao.classList.remove("pulsar");
    void cartao.offsetWidth;
    cartao.classList.add("pulsar");
  }

  function mostrarDica(planta) {
    const caixa = svg.getBoundingClientRect();
    const caixaSecao = secao.getBoundingClientRect();
    const p = planta.dados;
    dica.innerHTML = "";
    dica.append(p.nome);
    const detalhe = document.createElement("small");
    detalhe.textContent = `${descreverEstoque(p.estoque)} · ${ZONAS[p.luminosidade].rotulo.toLowerCase()}`;
    dica.appendChild(detalhe);
    dica.style.left = `${caixa.left - caixaSecao.left + (planta.alvoX / LARGURA) * caixa.width}px`;
    dica.style.top = `${caixa.top - caixaSecao.top + ((planta.y - planta.altura * planta.escala) / ALTURA) * caixa.height}px`;
    dica.classList.add("visivel");
  }

  function esconderDica() {
    dica.classList.remove("visivel");
  }

  svg.addEventListener("pointermove", (evento) => {
    const caixa = svg.getBoundingClientRect();
    ponteiro = {
      x: ((evento.clientX - caixa.left) / caixa.width) * LARGURA,
      y: ((evento.clientY - caixa.top) / caixa.height) * ALTURA,
    };
  });
  svg.addEventListener("pointerleave", () => (ponteiro = null));

  const quedas = [];

  function derrubarFolhas(planta, quantidade) {
    if (movimentoReduzido.matches || planta.pontas.length === 0) return;
    const cor = planta.corFolha;
    for (let i = 0; i < Math.min(quantidade, 6); i++) {
      const ponta = planta.pontas[(planta.pontas.length - 1 - i + planta.pontas.length) % planta.pontas.length];
      const x = planta.x + ponta.x * planta.escala;
      const y = planta.y + (ponta.y - ALTURA_VASO) * planta.escala;
      const no = criar("path", { d: folhaPath(14, 6), fill: cor }, camadaQueda);
      quedas.push({ no, x, y, inicioY: y, giro: Math.random() * 360, fase: Math.random() * 6.28, atraso: i * 140, nascimento: performance.now() });
    }
  }

  function vendeu(dados, quantidade) {
    const planta = plantas.get(dados.id);
    Som.sino();
    if (!planta) return;
    derrubarFolhas(planta, quantidade);
    planta.dados = dados;
    construir(planta);
    if (movimentoReduzido.matches) quadro(0);
  }

  function recusou(id) {
    Som.negado();
    const planta = plantas.get(id);
    if (planta) planta.tremor = 1;
  }

  // ---------- Animação ----------

  function quadro(t) {
    const vento = Math.sin(t / 7000) * 1.2;

    for (const planta of plantas.values()) {
      planta.x += (planta.alvoX - planta.x) * 0.08;

      let empurrao = 0;
      if (ponteiro) {
        const distancia = planta.x - ponteiro.x;
        const topo = planta.y - planta.altura * planta.escala - 20;
        if (Math.abs(distancia) < 110 && ponteiro.y > topo) {
          empurrao = Math.sign(distancia || 1) * (1 - Math.abs(distancia) / 110) * 16;
        }
      }
      planta.inclinacao += (empurrao - planta.inclinacao) * 0.08;

      const balanco = Math.sin(t / 1700 + planta.fase) * (planta.murcha ? 0.6 : 1.8) + vento;
      const tremor = planta.tremor > 0 ? Math.sin(t / 45) * 7 * planta.tremor : 0;
      planta.tremor = Math.max(0, planta.tremor - 0.018);
      planta.agito = Math.max(0, planta.agito - 0.015);
      const caido = planta.murcha && tipoDaPlanta(planta.dados) === "cacto" ? 12 : 0;

      planta.g.setAttribute("transform", `translate(${planta.x.toFixed(1)} ${planta.y}) scale(${planta.escala.toFixed(3)})`);
      planta.giro.setAttribute("transform", `rotate(${(balanco + planta.inclinacao + tremor + caido).toFixed(2)})`);
      for (const folha of planta.folhas) {
        const agito = Math.sin(t / 110 + folha.fase * 3) * 3.5 * planta.agito;
        const angulo = folha.angulo + Math.sin(t / 1100 + folha.fase) * folha.amplitude + agito;
        folha.no.setAttribute("transform", `rotate(${angulo.toFixed(2)})`);
      }
    }

    sol.setAttribute("opacity", (0.85 + Math.sin(t / 4000) * 0.15).toFixed(3));
    for (const polen of polens) {
      polen.y -= polen.velocidade;
      if (polen.y < 40) polen.y = CHAO - 10;
      const x = polen.x + Math.sin(t / 2600 + polen.fase) * 14;
      polen.no.setAttribute("cx", x.toFixed(1));
      polen.no.setAttribute("cy", polen.y.toFixed(1));
      polen.no.setAttribute("opacity", (0.35 + 0.35 * Math.sin(t / 900 + polen.fase)).toFixed(2));
    }

    for (let i = quedas.length - 1; i >= 0; i--) {
      const queda = quedas[i];
      const idade = performance.now() - queda.nascimento - queda.atraso;
      if (idade < 0) continue;
      const progresso = idade / 2600;
      const y = queda.inicioY + (CHAO - queda.inicioY) * Math.min(progresso, 1);
      const x = queda.x + Math.sin(idade / 300 + queda.fase) * 18;
      queda.no.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(queda.giro + idade / 8).toFixed(1)})`);
      queda.no.setAttribute("opacity", progresso < 0.8 ? 1 : Math.max(0, (1.2 - progresso) / 0.4).toFixed(2));
      if (progresso >= 1.2) {
        queda.no.remove();
        quedas.splice(i, 1);
      }
    }
  }

  let visivel = true;
  new IntersectionObserver(([entrada]) => (visivel = entrada.isIntersecting)).observe(secao);

  function laco(t) {
    if (visivel && !movimentoReduzido.matches) quadro(t);
    requestAnimationFrame(laco);
  }
  requestAnimationFrame(laco);

  // ---------- Som ambiente (Web Audio) ----------

  const Som = (() => {
    let ctx = null;
    let mestre = null;
    let eco = null;
    let ligado = false;
    let proximoPassaro = null;
    let ruidoFolhas = null;
    let ultimoFarfalhar = 0;

    function ruidoMarrom(segundos) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * segundos, ctx.sampleRate);
      const dados = buffer.getChannelData(0);
      let ultimo = 0;
      for (let i = 0; i < dados.length; i++) {
        ultimo = (ultimo + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        dados[i] = ultimo * 3.5;
      }
      return buffer;
    }

    function lfo(frequencia, profundidade, destino) {
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.frequency.value = frequencia;
      ganho.gain.value = profundidade;
      osc.connect(ganho).connect(destino);
      osc.start();
    }

    function montar() {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      mestre = ctx.createGain();
      mestre.gain.value = 0;
      mestre.connect(ctx.destination);

      // Eco suave, para dar sensação de espaço aberto
      eco = ctx.createDelay(1);
      eco.delayTime.value = 0.32;
      const filtroEco = ctx.createBiquadFilter();
      filtroEco.type = "lowpass";
      filtroEco.frequency.value = 2200;
      const retorno = ctx.createGain();
      retorno.gain.value = 0.35;
      eco.connect(filtroEco).connect(retorno);
      retorno.connect(eco);
      retorno.connect(mestre);

      // Vento: ruído grave filtrado, subindo e descendo devagar
      const vento = ctx.createBufferSource();
      vento.buffer = ruidoMarrom(4);
      vento.loop = true;
      const filtroVento = ctx.createBiquadFilter();
      filtroVento.type = "lowpass";
      filtroVento.frequency.value = 520;
      const volumeVento = ctx.createGain();
      volumeVento.gain.value = 0.16;
      vento.connect(filtroVento).connect(volumeVento).connect(mestre);
      lfo(0.07, 0.07, volumeVento.gain);
      lfo(0.045, 240, filtroVento.frequency);
      vento.start();

      // Fundo musical: um acorde aberto em Ré, bem baixo e respirando
      const filtroPad = ctx.createBiquadFilter();
      filtroPad.type = "lowpass";
      filtroPad.frequency.value = 750;
      const volumePad = ctx.createGain();
      volumePad.gain.value = 0.5;
      filtroPad.connect(volumePad);
      volumePad.connect(mestre);
      volumePad.connect(eco);
      [146.83, 220, 293.66, 329.63, 369.99].forEach((frequencia, i) => {
        const osc = ctx.createOscillator();
        osc.type = i % 2 === 0 ? "sine" : "triangle";
        osc.frequency.value = frequencia;
        osc.detune.value = (i - 2) * 4;
        const voz = ctx.createGain();
        voz.gain.value = 0.011;
        osc.connect(voz).connect(filtroPad);
        lfo(0.05 + i * 0.017, 0.008, voz.gain);
        osc.start();
      });
    }

    function nota(frequencia, inicio, duracao, volume, tipo = "sine") {
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.type = tipo;
      osc.frequency.value = frequencia;
      ganho.gain.setValueAtTime(0, inicio);
      ganho.gain.linearRampToValueAtTime(volume, inicio + 0.015);
      ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
      osc.connect(ganho);
      ganho.connect(mestre);
      ganho.connect(eco);
      osc.start(inicio);
      osc.stop(inicio + duracao + 0.05);
      return osc;
    }

    function passaro() {
      const posicao = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const base = 2300 + Math.random() * 1400;
      const pios = 2 + Math.floor(Math.random() * 4);
      let t = ctx.currentTime + 0.05;
      for (let i = 0; i < pios; i++) {
        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();
        osc.frequency.setValueAtTime(base, t);
        osc.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.06);
        osc.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.13);
        ganho.gain.setValueAtTime(0, t);
        ganho.gain.linearRampToValueAtTime(0.009, t + 0.012);
        ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        osc.connect(ganho);
        if (posicao) {
          posicao.pan.value = Math.random() * 1.6 - 0.8;
          ganho.connect(posicao);
        } else {
          ganho.connect(mestre);
        }
        osc.start(t);
        osc.stop(t + 0.2);
        t += 0.17 + Math.random() * 0.12;
      }
      if (posicao) {
        posicao.connect(mestre);
        posicao.connect(eco);
      }
      proximoPassaro = setTimeout(passaro, 7000 + Math.random() * 12000);
    }

    function alternar() {
      if (!ctx) montar();
      ligado = !ligado;
      if (ligado) {
        ctx.resume();
        mestre.gain.setTargetAtTime(0.45, ctx.currentTime, 1.2);
        proximoPassaro = setTimeout(passaro, 4000);
      } else {
        mestre.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
        clearTimeout(proximoPassaro);
      }
      return ligado;
    }

    document.addEventListener("visibilitychange", () => {
      if (!ctx || !ligado) return;
      if (document.hidden) ctx.suspend();
      else ctx.resume();
    });

    return {
      alternar,
      // Folhas roçando: um sopro curto de ruído agudo, bem baixinho
      farfalhar() {
        if (!ligado || ctx.currentTime - ultimoFarfalhar < 0.15) return;
        ultimoFarfalhar = ctx.currentTime;
        if (!ruidoFolhas) {
          ruidoFolhas = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
          const dados = ruidoFolhas.getChannelData(0);
          for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
        }
        const fonte = ctx.createBufferSource();
        fonte.buffer = ruidoFolhas;
        fonte.playbackRate.value = 0.8 + Math.random() * 0.4;
        const filtro = ctx.createBiquadFilter();
        filtro.type = "bandpass";
        filtro.frequency.value = 2600 + Math.random() * 1800;
        filtro.Q.value = 0.9;
        const ganho = ctx.createGain();
        const t = ctx.currentTime;
        ganho.gain.setValueAtTime(0, t);
        ganho.gain.linearRampToValueAtTime(0.05, t + 0.05);
        ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        fonte.connect(filtro).connect(ganho).connect(mestre);
        fonte.start(t);
        fonte.stop(t + 0.45);
      },
      // Sininho de venda: duas notas que somem devagar
      sino() {
        if (!ligado) return;
        const t = ctx.currentTime;
        nota(1046.5, t, 1.8, 0.025);
        nota(1318.5, t + 0.09, 2.2, 0.018);
      },
      // Venda recusada: um "tum" grave e curto
      negado() {
        if (!ligado) return;
        nota(196, ctx.currentTime, 0.45, 0.03, "triangle");
      },
    };
  })();

  const botoes = document.createElement("div");
  botoes.className = "jardim-botoes";
  secao.appendChild(botoes);

  const botaoSom = document.createElement("button");
  botaoSom.type = "button";
  botaoSom.className = "jardim-botao";
  botaoSom.setAttribute("aria-pressed", "false");
  botaoSom.textContent = "🔈 Sons da floresta";
  botaoSom.addEventListener("click", () => {
    const ligado = Som.alternar();
    botaoSom.setAttribute("aria-pressed", String(ligado));
    botaoSom.textContent = `${ligado ? "🔊" : "🔈"} Sons da floresta`;
  });
  botoes.appendChild(botaoSom);

  // Tela cheia: o jardim ocupa a tela inteira, e as plantas ficam maiores
  if (document.fullscreenEnabled) {
    const botaoTela = document.createElement("button");
    botaoTela.type = "button";
    botaoTela.className = "jardim-botao jardim-botao-tela";
    botaoTela.textContent = "⤢ Tela cheia";
    botaoTela.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else secao.requestFullscreen();
    });
    document.addEventListener("fullscreenchange", () => {
      botaoTela.textContent = document.fullscreenElement === secao ? "✕ Sair da tela cheia" : "⤢ Tela cheia";
      esconderDica();
    });
    botoes.appendChild(botaoTela);
  }

  window.Jardim = { atualizar, vendeu, recusou };
})();
