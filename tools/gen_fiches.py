# -*- coding: utf-8 -*-
"""Génère les fiches compactes (tools/fiches_src.py) dans data/fiches.json.
Les 6 fiches détaillées écrites à la main sont conservées telles quelles.
Usage : python tools/gen_fiches.py   (puis node tools/build-bundle.mjs)"""
import json, hashlib, os, sys, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from fiches_src import F

D = lambda f: os.path.join(ROOT, 'data', f)
matchups = json.load(open(D('matchups.json'), encoding='utf-8'))['matchups']
fiches = json.load(open(D('fiches.json'), encoding='utf-8'))
sources = json.load(open(D('sources.json'), encoding='utf-8'))['sources']
poppt = next(s for s in sources if s['id'] == 'poppt1')
VID = {'proj': 'Xxs5B8PSGMs', 'zack': 'crcmNx_Lxu4', 'ledgeesc': 'jMGl4V3gG2c', 'ledgetrap': 'EmRPEV8NU-s', 'bait': 'DyMSbyS40VM', 'corner': 'oKHrBh0vJUs', 'neutral': '61tEahwFbUE'}
TITRE = {v['video_id']: v['titre'] for v in poppt['videos']}
BASE = 'https://ssb.wiki.gallery/images/'

# Index des GIFs : (id, suffixe) -> (fichier, page)
hb = {}
for line in open(D('hitboxes.txt'), encoding='utf-8'):
    if not line.strip() or line.startswith('#'): continue
    pid, page, pre, lst = line.rstrip('\n').split('|')
    for suf in lst.split(','):
        f = suf[1:] if suf.startswith('!') else pre + suf + 'SSBU.gif'
        hb[(pid, suf)] = (f, f'https://www.ssbwiki.com/{page}_(SSBU)/Hitboxes')

def gif_url(f):
    h = hashlib.md5(f.replace(' ', '_').encode()).hexdigest()
    return f'{BASE}{h[0]}/{h[:2]}/{urllib.parse.quote(f)}'

PREFIX_SUBST = {'plant': '', 'zss': '', 'iceclimbers': '', 'olimar': '', 'rosalina': ''}
def resolve(pid, code):
    owner = pid
    if pid == 'pyra-mythra':
        owner, code = code.split(':') if ':' in code else ('mythra', code)
        owner = owner.lower()
    for key in [(owner, code)] + [(owner, s) for (o, s) in hb if o == owner and s.endswith(code) and len(s) - len(code) <= 12]:
        if key in hb: return hb[key]
    return None

GOALS = {'kill', 'racking', 'stage_control', 'setup'}
import re
LAB = [('DashAttack','Attaque en course'),('UTilt','Up-tilt'),('FTilt','Ftilt'),('DTilt','Dtilt'),('USmash','Up-smash'),('FSmash','Side-smash'),('DSmash','Down-smash'),
       ('NAir','Nair'),('FAir','Fair'),('BAir','Bair'),('UAir','Up-air'),('DAir','Dair'),('ZAir','Zair'),('Nair','Nair'),('Fair','Fair'),('Bair','Bair'),('Uair','Up-air'),
       ('UThrow','Up-throw'),('DThrow','Down-throw'),('FThrow','Forward throw'),('BThrow','Back throw'),('Jab','Jab'),('Up_Air_','Up-air')]
def label(code):
    c = code.split(':')[-1]
    for k, v in LAB:
        if c.startswith(k): return v + (' ' + re.sub(r'([a-z])([A-Z])', r'\1 \2', c[len(k):]).strip() if c[len(k):].strip('_') else '')
    return re.sub(r'([a-z])([A-Z])', r'\1 \2', c).replace('_', ' ').strip()
errors, hand = [], {f['id'] for f in fiches['fiches']}
byid = {m['id']: m for m in matchups}
missing = [m['id'] for m in matchups if m['id'] not in hand and m['id'] not in F]
if missing: errors.append('fiches manquantes : ' + ', '.join(missing))
out = [f for f in fiches['fiches'] if f['id'] in hand and not f.get('genere')]
for pid, e in F.items():
    if pid not in byid: errors.append(f'id inconnu : {pid}'); continue
    if pid in hand and not next(f for f in fiches['fiches'] if f['id'] == pid).get('genere'): continue
    m = byid[pid]; medias, combos = [], []
    seen = {}
    for i, (titre, inputs, pct, pos, di, but, cm, gifs) in enumerate(e['c']):
        if but not in GOALS: errors.append(f'{pid} : but {but}')
        ids = []
        for g in gifs:
            r = resolve(pid, g)
            if not r: errors.append(f'{pid} : GIF introuvable {g}'); continue
            f, page = r
            if f not in seen:
                seen[f] = f'gif-{pid}-{len(seen)}'
                medias.append({'id': seen[f], 'type': 'gif', 'titre': f'{m["nom"].split(" / ")[0] if pid != "pyra-mythra" else g.split(":")[0]} — {label(g)}', 'url': gif_url(f), 'source': 'SmashWiki (hitbox)',
                               'auteur': 'Contributeurs SmashWiki · images du jeu © Nintendo', 'lien': page, 'timestamp': '', 'permission': 'lien_seulement', 'statut': 'verifie'})
            ids.append(seen[f])
        combos.append({'id': f'{pid}-c{i+1}', 'titre': titre, 'inputs': [x.strip() for x in inputs.split('>')],
                       'conditions': {'pourcent': pct + ' (indicatif)', 'position': pos, 'di': di}, 'but': but, 'variantes': [],
                       'contre_mesures': cm, 'medias': ids, 'ref_poppt': None, 'sources': []})
    vid = VID[e['p']]
    medias.append({'id': f'poppt-{e["p"]}', 'type': 'youtube', 'video_id': vid, 'start': 0, 'titre': 'Poppt — ' + TITRE[vid], 'source': 'YouTube · School of Smash Fundamentals',
                   'auteur': 'Poppt1', 'lien': f'https://www.youtube.com/watch?v={vid}', 'timestamp': '', 'permission': 'lien_seulement', 'statut': 'verifie'})
    combos[0]['ref_poppt'] = {'statut': 'lie', 'video_url': f'https://www.youtube.com/watch?v={vid}', 'titre': TITRE[vid], 'timestamp': '',
                              'note': 'Leçon de fondamentaux liée par thème (vidéo entière). Ajoute le timestamp précis dans Admin quand tu l’as repéré.'}
    out.append({'id': pid, 'nom': m['nom'], 'difficulte': m['difficulte'], 'genere': True, 'conseil_rapide': e['q'], 'win_conditions': e['w'],
                'setups': [{'titre': a, 'reconnaitre': b, 'reponse': c} for a, b, c in e['s']], 'combos': combos, 'medias': medias,
                'conseils_bowser': e['t'], 'stage': e.get('st', ''),
                'sources': [{'titre': f'SmashWiki — {m["nom"]} : hitboxes', 'url': medias[0]['lien'] if medias and medias[0]['type'] == 'gif' else ''}]})
if errors:
    print('✗', '\n  '.join(errors)); sys.exit(1)
order = {m['id']: i for i, m in enumerate(matchups)}
out.sort(key=lambda f: order.get(f['id'], 999))
fiches['fiches'] = out
json.dump(fiches, open(D('fiches.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'✓ {len(out)} fiches ({sum(1 for f in out if f.get("genere"))} générées), {sum(len(f["medias"]) for f in out)} médias')
