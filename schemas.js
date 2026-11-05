/* Schémas animés originaux (SVG + SMIL), utilisables hors-ligne.
   Formes génériques : B = toi (Bowser), A = adversaire. Aucun asset du jeu. */
(function () {
  'use strict';
  const W = 320, H = 180;
  const C = { b: 'var(--sch-b)', a: 'var(--sch-a)', fx: 'var(--sch-fx)', line: 'var(--sch-line)', txt: 'var(--sch-txt)' };

  const frame = (body, label) =>
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="${H}" fill="var(--sch-bg)"/>${body}</svg>`;
  const ground = (x1 = 20, x2 = 300, y = 150) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${C.line}" stroke-width="3" stroke-linecap="round"/>`;
  const bowser = (inner = '') => `<g><rect x="-22" y="-22" width="44" height="44" rx="10" fill="${C.b}"/><text x="0" y="6" text-anchor="middle" font-size="18" font-weight="700" fill="#fff">B</text>${inner}</g>`;
  const opp = (inner = '') => `<g><circle r="12" fill="${C.a}"/><text x="0" y="5" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">A</text>${inner}</g>`;
  const cap = t => `<text x="${W / 2}" y="172" text-anchor="middle" font-size="10.5" fill="${C.txt}">${t}</text>`;

  const S = {
    jongle: () => frame(`${ground()}
      <g><animateTransform attributeName="transform" type="translate" dur="3s" repeatCount="indefinite"
        values="160 120;160 70;160 95;160 50;160 80;160 30;160 120" keyTimes="0;0.15;0.3;0.45;0.6;0.75;1"/>${bowser()}</g>
      <g><animateTransform attributeName="transform" type="translate" dur="3s" repeatCount="indefinite"
        values="160 138;160 138;160 115;160 138;160 105;160 138;160 138" keyTimes="0;0.12;0.3;0.42;0.6;0.72;1"/>${opp()}</g>
      ${cap('Jongle : A reste sous toi — DI sur le côté, esquive tardive')}`, 'Jongle vertical'),

    'kill-confirm': () => frame(`${ground()}
      <g><animateTransform attributeName="transform" type="translate" dur="3s" repeatCount="indefinite"
        values="150 128;150 128;150 128;210 20;290 -40;150 128" keyTimes="0;0.3;0.4;0.6;0.8;1"/>${bowser()}</g>
      <g><animateTransform attributeName="transform" type="translate" dur="3s" repeatCount="indefinite"
        values="100 138;128 138;128 138;128 138;100 138;100 138" keyTimes="0;0.3;0.4;0.6;0.8;1"/>${opp()}</g>
      <g transform="translate(280 30)"><path d="M0-12 4-4 12-4 6 2 8 11 0 6-8 11-6 2-12-4-4-4Z" fill="${C.fx}" opacity="0">
        <animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.7;0.8;1" dur="3s" repeatCount="indefinite"/></path></g>
      ${cap('Lancer → coup vertical : DI latérale, ne reste pas en bouclier figé')}`, 'Kill confirm'),

    edgeguard: () => frame(`
      <path d="M0 110 H150 V180 H0Z" fill="var(--sch-stage)"/><line x1="0" y1="110" x2="150" y2="110" stroke="${C.line}" stroke-width="3"/>
      <g><animateTransform attributeName="transform" type="translate" dur="3s" repeatCount="indefinite"
        values="235 170;225 120;215 105;215 105;240 175;235 170" keyTimes="0;0.35;0.5;0.55;0.85;1"/>${bowser()}</g>
      <g><animateTransform attributeName="transform" type="translate" dur="3s" repeatCount="indefinite"
        values="130 98;130 98;180 80;195 85;150 98;130 98" keyTimes="0;0.3;0.48;0.55;0.8;1"/>${opp()}</g>
      <path d="M250 165 Q240 130 225 110" stroke="${C.b}" stroke-dasharray="4 4" fill="none" stroke-width="2"/>
      ${cap('Edgeguard : reviens haut, garde ton double saut')}`, 'Edgeguard'),

    zoning: () => frame(`${ground()}
      <g><animateTransform attributeName="transform" type="translate" dur="3s" repeatCount="indefinite"
        values="60 128;120 128;150 128;60 128" keyTimes="0;0.5;0.9;1"/>${bowser(`<circle r="30" fill="none" stroke="${C.fx}" stroke-width="2" opacity="0.6"><animate attributeName="opacity" values="0.6;0.1;0.6" dur="0.6s" repeatCount="indefinite"/></circle>`)}</g>
      <g transform="translate(270 138)">${opp()}</g>
      ${[0, 0.8, 1.6].map(d => `<circle r="5" fill="${C.a}"><animateMotion dur="1s" begin="${d}s;${d + 3}s" repeatCount="1" path="M255 136 L110 136" fill="remove"/></circle>`).join('')}
      ${cap('Zoning : avance par à-coups en bouclier, pas de saut prévisible')}`, 'Zoning'),

    'pression-bouclier': () => frame(`${ground()}
      <g transform="translate(150 128)">${bowser(`<g transform="rotate(0)"><circle r="30" fill="none" stroke="${C.fx}" stroke-width="3">
          <animate attributeName="opacity" values="0.9;0.9;0;0;0.9" keyTimes="0;0.45;0.5;0.95;1" dur="3s" repeatCount="indefinite"/></circle></g>
        <path d="M-30 0 A30 30 0 0 1 30 0" stroke="${C.b}" stroke-width="6" fill="none" opacity="0">
          <animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;0.48;0.55;0.7;1" dur="3s" repeatCount="indefinite"/>
          <animateTransform attributeName="transform" type="rotate" values="0;0;360;720;720" keyTimes="0;0.48;0.6;0.7;1" dur="3s" repeatCount="indefinite"/></path>`)}</g>
      <g><animateTransform attributeName="transform" type="translate" dur="3s" repeatCount="indefinite"
        values="220 40;175 95;175 100;175 100;240 20;220 40" keyTimes="0;0.35;0.45;0.5;0.7;1"/>${opp()}</g>
      ${cap('Aérien sur bouclier → up-B hors bouclier immédiat')}`, 'Pression bouclier')
  };

  self.PMSchemas = {
    list: () => Object.keys(S),
    render: name => (S[name] ? S[name]() : frame(cap('Schéma inconnu : ' + name), 'Schéma'))
  };
})();
