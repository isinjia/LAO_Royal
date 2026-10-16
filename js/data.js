// Last Royal: cards, champions, arenas, towers, progression and balance.
// Field units are tiles: the arena is 18 x 32 (x -9..9, z -16..16), the player defends z < 0.
(function () {
  // card rarity (the original game's ranks); SS troops are champions with an active skill
  const RARITY = [
    { name: 'B', color: '#8aa0b4' },
    { name: 'A', color: '#38b6ff' },
    { name: 'S', color: '#ffc81e' },
    { name: 'SS', color: '#ff7a2a' },
  ];

  // speeds in tiles / s (slow / medium / fast / very fast)
  const SPD = { slow: 0.8, mid: 1.05, fast: 1.5, vfast: 2.0 };

  // Troop: hp, dmg per hit, rate (s per hit), range (tiles, edge to edge), speed, air, hits ('ground'|'all'),
  // aim ('any'|'buildings'), splash radius, radius (body), mass, fx (attack visual), sfx, arena (unlocked at).
  // Bioroid rigs use one shared scale (k = per-card multiplier); Iron Blood rigs are normalised to h tiles tall.
  // skill (champions): { name, cost, cd, kind: nova | barrage | dash | summon | shield | storm | laser, ... }
  const T = (id, o) => Object.assign({
    id, type: 'troop', count: 1, air: false, hits: 'all', aim: 'any', splash: 0, radius: 0.45, mass: 4,
    sight: 5.5, k: 1, deploy: 1, arena: 0,
  }, o);
  const S = (id, o) => Object.assign({ id, type: 'spell', count: 1, arena: 0 }, o);

  const ORCA = [
    // ── B ──
    T('brownie', { rig: 'brownie', img: 'c_BR_Brownie_N', name: '브라우니 분대', cost: 2, rarity: 0, count: 3, hp: 150, dmg: 70, rate: 1.2, range: 5, speed: SPD.fast, radius: 0.35, mass: 2, fx: 'bullet', color: 0xffe08a, sfx: 'rifle', desc: '돌격소총으로 무장한 브라우니 3기. 싸고 빠르게 공중·지상을 견제합니다.' }),
    T('leprechaun', { rig: 'leprechaun', img: 'c_BR_Leprechaun_N', name: '레프리콘', cost: 3, rarity: 0, hp: 620, dmg: 48, rate: 0.35, range: 5, speed: SPD.mid, fx: 'bullet', color: 0x9dff7a, sfx: 'mg', desc: '기관총 연사. 공중 유닛과 무리 상대로 든든합니다.' }),
    T('gnome', { rig: 'gnome', img: 'c_BR_Gnome_N', name: '놈', cost: 3, rarity: 0, hp: 360, dmg: 210, rate: 1.8, range: 4.5, hits: 'ground', splash: 1.5, speed: SPD.mid, fx: 'grenade', color: 0xffa040, sfx: 'cannon', desc: '유탄 범위 공격. 지상 무리를 쓸어버리지만 공중은 못 맞힙니다.' }),
    T('valkyrie', { rig: 'valkyrie', img: 'c_BR_Valkyrie_N', name: '발키리', cost: 3, rarity: 0, hp: 700, dmg: 90, rate: 0.6, range: 4.5, speed: SPD.fast, fx: 'bullet', color: 0x9fd0ff, sfx: 'gun', desc: '빠른 발로 달려와 고속 연사하는 돌격형 사수.' }),
    // ── A ──
    T('impet', { rig: 'impet', img: 'c_BR_Impet_N', name: '임펫', cost: 4, rarity: 1, hp: 1450, dmg: 180, rate: 1.4, range: 1.2, hits: 'ground', splash: 1.6, speed: SPD.mid, radius: 0.5, mass: 6, fx: 'flame', color: 0xff6a2a, sfx: 'spray', desc: '화염방사 근거리 범위 공격. 지상 무리 상대로 최고의 방어수.' }),
    T('raven', { rig: 'raven', img: 'c_BR_Raven_N', name: '레이븐', cost: 4, rarity: 1, hp: 720, dmg: 230, rate: 1.1, range: 6.5, speed: SPD.mid, fx: 'snipe', color: 0xfff2b0, sfx: 'handgun', desc: '장거리 저격. 강 건너에서도 적을 노립니다.' }),
    T('harpy', { rig: 'harpy', img: 'c_BR_Harpy_N', name: '하르페', cost: 4, rarity: 1, air: true, hp: 1000, dmg: 135, rate: 1.5, range: 3.5, splash: 1.5, speed: SPD.fast, radius: 0.55, mass: 5, fx: 'missile', color: 0xff8a3d, sfx: 'missile', desc: '비행 미사일 범위 공격. 공중에서 무리를 녹입니다.' }),
    T('banshee', { rig: 'banshee', img: 'c_BR_Banshee_N', name: '밴시', cost: 3, rarity: 1, arena: 1, hp: 560, dmg: 95, rate: 1.2, range: 5, splash: 1.2, slow: 0.35, slowDur: 2.5, speed: SPD.mid, fx: 'wave', color: 0x7affd4, sfx: 'laser', desc: '음파 범위 공격, 맞은 적은 2.5초간 35% 둔화.' }),
    T('sylphid', { rig: 'sylphid', img: 'c_BR_Sylphid_N', name: '실피드', cost: 3, rarity: 1, arena: 1, air: true, hp: 520, dmg: 115, rate: 1.0, range: 2.5, speed: SPD.fast, fx: 'bullet', color: 0xd78bff, sfx: 'gun', k: 0.9, desc: '고속 비행 전투기. 지상 근접 유닛의 손이 닿지 않습니다.' }),
    T('undine', { rig: 'undine', img: 'c_BR_Undine_N', name: '운디네', cost: 4, rarity: 1, arena: 1, air: true, hp: 760, dmg: 120, rate: 1.3, range: 4.5, splash: 1.3, slow: 0.35, slowDur: 2, speed: SPD.mid, fx: 'frost', color: 0x9feaff, sfx: 'ice', k: 0.9, desc: '비행 빙결탄. 범위 피해와 함께 적을 둔화시킵니다.' }),
    T('nymph', { rig: 'nymph', img: 'c_BR_Nymph_N', name: '님프', cost: 4, rarity: 1, arena: 1, hp: 760, dmg: 60, rate: 0.9, range: 4.5, speed: SPD.mid, fx: 'bullet', color: 0x9fffc8, sfx: 'rifle', heal: { amount: 95, every: 2.5, radius: 3.6 }, desc: '주변 아군을 주기적으로 치료하는 지원형 사수.' }),
    // ── S ──
    T('zero', { rig: 'zero', img: 'c_DS_KunoichiZero_N', name: '쿠노이치 제로', cost: 4, rarity: 2, hp: 1250, dmg: 620, rate: 1.6, range: 0.8, hits: 'ground', speed: SPD.fast, radius: 0.45, mass: 5, fx: 'slash', color: 0xff3b6b, sfx: 'slash', desc: '초고속 참격. 한 방 피해가 매우 큰 암살자.' }),
    T('thetis', { rig: 'thetis', img: 'c_BR_Thetis_N', name: '테티스', cost: 4, rarity: 2, arena: 1, air: true, hp: 640, dmg: 170, rate: 1.6, range: 5, chain: 3, stun: 0.5, speed: SPD.fast, fx: 'lightning', color: 0x66ccff, sfx: 'elec', k: 0.9, desc: '연쇄 번개 3타겟 + 0.5초 기절. 충전·집중 공격을 끊어냅니다.' }),
    T('mercury', { rig: 'mercury', img: 'c_ST_Mercury_N', name: '머큐리', cost: 4, rarity: 2, arena: 1, hp: 1500, dmg: 260, rate: 1.5, range: 0.8, hits: 'ground', aim: 'buildings', jump: true, speed: SPD.vfast, radius: 0.5, mass: 6, fx: 'slash', color: 0x7dffb0, sfx: 'slash', desc: '건물만 노리는 초고속 돌격. 강을 뛰어넘습니다.' }),
    T('leona', { rig: 'leona', img: 'c_BR_Leona_N', name: '레오나', cost: 5, rarity: 2, arena: 2, hp: 980, dmg: 290, rate: 1.6, range: 6, pierce: 0.6, speed: SPD.mid, radius: 0.5, mass: 6, fx: 'laser', color: 0xff9ad5, sfx: 'laserBig', desc: '관통 레이저. 일직선 위의 모든 적에게 피해.' }),
    T('azazel', { rig: 'azazel', img: 'c_DS_Azazel_N', name: '아자젤', cost: 5, rarity: 2, arena: 2, hp: 760, dmg: 270, rate: 1.4, range: 5.5, splash: 1.5, speed: SPD.mid, fx: 'holy', color: 0xffe9a0, sfx: 'energy', desc: '성광 대폭발. 공중·지상 모두 범위 공격.' }),
    T('phoenix', { rig: 'phoenix', img: 'c_BR_Phoenix_N', name: '피닉스', cost: 5, rarity: 2, arena: 2, air: true, hp: 1150, dmg: 210, rate: 1.6, range: 3.5, splash: 1.6, speed: SPD.mid, radius: 0.55, mass: 6, fx: 'fireball', color: 0xff5a1f, sfx: 'expS', desc: '하늘을 나는 화염탄 포격수. 튼튼한 공중 범위 딜러.' }),
    T('hela', { rig: 'hela', img: 'c_BR_Hela_N', name: '헬라', cost: 5, rarity: 2, arena: 2, hp: 1050, dmg: 190, rate: 1.6, range: 5.5, chain: 4, speed: SPD.mid, radius: 0.5, mass: 6, fx: 'lightning', color: 0xc77dff, sfx: 'elec', desc: '연쇄 번개 4타겟. 무리와 공중을 동시에 정리합니다.' }),
    // ── SS (champions) ──
    T('empress', { rig: 'empress', img: 'c_PECS_Empress_N', name: '엠프레스', cost: 6, rarity: 3, hp: 3400, dmg: 220, rate: 1.5, range: 1.0, hits: 'ground', aim: 'buildings', speed: SPD.slow, radius: 0.75, mass: 18, fx: 'cannon', color: 0xff7b3a, sfx: 'cannon', k: 0.95, desc: '건물만 노리는 중장갑 탱커. 뒤에 지원 유닛을 붙이세요.',
      skill: { name: '포격 개시', cost: 2, cd: 12, kind: 'barrage', n: 5, radius: 1.6, dmg: 320, reach: 7, color: 0xff7b3a, desc: '전방 적 진영에 포탄 5발을 쏟아붓습니다.' } }),
    T('sleipnir', { rig: 'sleipnir', img: 'c_BR_Sleipnir_N', name: '슬레이프니르', cost: 5, rarity: 3, arena: 2, air: true, hp: 1600, dmg: 880, rate: 3.0, range: 0.5, hits: 'ground', aim: 'buildings', splash: 1.2, speed: SPD.mid, radius: 0.6, mass: 8, fx: 'bomb', color: 0xffb070, sfx: 'expM', desc: '건물만 노리는 비행 폭격기. 탑 위에 폭탄을 쏟아붓습니다.',
      skill: { name: '애프터버너', cost: 1, cd: 10, kind: 'haste', dur: 4, k: 1.8, color: 0xffb070, desc: '4초간 이동·공격 속도 80% 증가.' } }),
    T('labiata', { rig: 'labiata', img: 'c_3P_Labiata_N', name: '라비아타', cost: 7, rarity: 3, arena: 2, hp: 3500, dmg: 800, rate: 1.8, range: 0.9, hits: 'ground', speed: SPD.slow, radius: 0.7, mass: 16, fx: 'slash', color: 0xffd36e, sfx: 'swing', desc: '오르카의 지휘관. 압도적인 체력과 일격의 근접 전투.',
      skill: { name: '지휘관의 일격', cost: 3, cd: 13, kind: 'nova', radius: 2.8, dmg: 600, stun: 0.8, color: 0xffd36e, desc: '주변 적 모두에게 큰 피해 + 0.8초 기절.' } }),
    T('titania', { rig: 'titania', img: 'c_3P_Titania_N', name: '티타니아', cost: 5, rarity: 3, arena: 3, hp: 1500, dmg: 200, rate: 1.4, range: 4.5, splash: 1.4, slow: 0.3, slowDur: 2, speed: SPD.mid, radius: 0.5, mass: 6, fx: 'frost', color: 0xaef4ff, sfx: 'ice', desc: '빙결의 요정. 범위 둔화 공격으로 전선을 붙잡습니다.',
      skill: { name: '절대 영도', cost: 2, cd: 14, kind: 'nova', radius: 3.4, dmg: 220, freeze: 2.5, color: 0xaef4ff, desc: '주변의 적과 탑을 2.5초간 얼립니다.' } }),
    T('tiamat', { rig: 'tiamat', img: 'c_ST_Tiamat_N', name: '티아멧', cost: 6, rarity: 3, arena: 3, hp: 1350, dmg: 360, rate: 1.8, range: 6.5, pierce: 0.6, speed: SPD.mid, radius: 0.55, mass: 7, fx: 'laser', color: 0x6ef0ff, sfx: 'laserBig', desc: '대구경 관통 레이저를 쏘는 해양의 여제.',
      skill: { name: '대해의 포효', cost: 2, cd: 12, kind: 'laser', dmg: 900, width: 1.3, reach: 11, color: 0x6ef0ff, desc: '전장을 가로지르는 초대형 레이저.' } }),
    T('constantia', { rig: 'constantia', img: 'c_3P_ConstantiaS2_N', name: '콘스탄챠 S2', cost: 6, rarity: 3, arena: 3, hp: 1450, dmg: 300, rate: 1.6, range: 6, pierce: 0.5, speed: SPD.mid, radius: 0.5, mass: 6, fx: 'laser', color: 0xff6af0, sfx: 'laserBig', desc: '오르카의 부관. 관통 레이저로 전선을 꿰뚫습니다.',
      skill: { name: '궤도 레이저', cost: 2, cd: 13, kind: 'laser', dmg: 950, width: 1.3, reach: 13, color: 0xff6af0, desc: '전장을 세로로 가르는 궤도 레이저.' } }),
    T('fafnir', { rig: 'fafnir', img: 'c_BR_Fafnir_N', name: '파프니르', cost: 6, rarity: 3, arena: 4, air: true, hp: 2000, dmg: 230, rate: 1.5, range: 4, chain: 3, speed: SPD.mid, radius: 0.65, mass: 9, fx: 'lightning', color: 0x5aa8ff, sfx: 'elec', k: 0.9, desc: '뇌룡. 연쇄 번개를 두르고 하늘을 지배합니다.',
      skill: { name: '뇌룡의 분노', cost: 2, cd: 12, kind: 'storm', n: 7, dmg: 300, stun: 0.6, reach: 6, color: 0x5aa8ff, desc: '주변 적들에게 낙뢰 7발.' } }),
    T('ramiel', { rig: 'ramiel', img: 'c_DS_Ramiel_N', name: '라미엘', cost: 5, rarity: 3, arena: 4, hp: 1250, dmg: 260, rate: 1.5, range: 5, splash: 1.5, stun: 0.25, speed: SPD.mid, radius: 0.5, mass: 6, fx: 'holy', color: 0xfff1b8, sfx: 'energy', desc: '심판의 천사. 성광 폭발로 적을 잠시 멈춥니다.',
      skill: { name: '심판의 성광', cost: 2, cd: 13, kind: 'barrage', n: 3, radius: 2.0, dmg: 520, stun: 0.8, reach: 7, pillar: true, color: 0xfff1b8, desc: '적 밀집 지역에 성광 기둥 3개.' } }),
  ];

  const IRON = [
    // ── B ──
    T('nightchick', { rig: 'e_NightChick_N', img: 'e_NightChick_N', name: '나이트 칙 무리', cost: 3, rarity: 0, count: 4, hp: 230, dmg: 100, rate: 1.1, range: 0.6, hits: 'ground', speed: SPD.fast, radius: 0.35, mass: 2, h: 1.1, fx: 'claw', color: 0xffd060, sfx: 'swing', desc: '떼로 몰려드는 소형 병기 4기.' }),
    T('drone', { rig: 'e_Drone_N', img: 'e_Drone_N', name: '드론 편대', cost: 3, rarity: 0, count: 3, air: true, hp: 200, dmg: 85, rate: 1.0, range: 2, speed: SPD.fast, radius: 0.35, mass: 2, h: 1.0, fx: 'bullet', color: 0xff7070, sfx: 'gun', desc: '비행 드론 3기.' }),
    T('legion', { rig: 'e_Legion_N', img: 'e_Legion_N', name: '레기온', cost: 3, rarity: 0, hp: 1450, dmg: 165, rate: 1.2, range: 0.8, hits: 'ground', speed: SPD.mid, radius: 0.5, mass: 6, h: 1.5, fx: 'claw', color: 0xffc080, sfx: 'swing', desc: '튼튼한 근접 보병.' }),
    T('phalangites', { rig: 'e_Phalangites_N', img: 'e_Phalangites_N', name: '팔랑기테스', cost: 3, rarity: 0, hp: 600, dmg: 150, rate: 1.1, range: 4.5, speed: SPD.mid, h: 1.5, fx: 'bullet', color: 0xffb070, sfx: 'rifle', desc: '중거리 사격 보병.' }),
    T('pupphead', { rig: 'e_PuppHead_N', img: 'e_PuppHead_N', name: '퍼프헤드', cost: 2, rarity: 0, count: 2, hp: 330, dmg: 140, rate: 1.0, range: 0.6, hits: 'ground', speed: SPD.vfast, radius: 0.4, mass: 3, h: 1.2, fx: 'claw', color: 0xffe070, sfx: 'swing', desc: '값싸고 재빠른 돌격병 2기.' }),
    // ── A ──
    T('centurion', { rig: 'e_Centurion_N', img: 'e_Centurion_N', name: '센츄리온', cost: 4, rarity: 1, hp: 720, dmg: 215, rate: 1.1, range: 6, speed: SPD.mid, h: 1.5, fx: 'snipe', color: 0xff9a7a, sfx: 'handgun', desc: '장거리 사격 병기.' }),
    T('intruder', { rig: 'e_Intruder_N', img: 'e_Intruder_N', name: '인트루더', cost: 4, rarity: 1, hp: 680, dmg: 230, rate: 1.7, range: 5, hits: 'ground', splash: 1.5, speed: SPD.mid, h: 1.5, fx: 'grenade', color: 0xffa040, sfx: 'cannon', desc: '지상 범위 포격.' }),
    T('fallen', { rig: 'e_Fallen_N', img: 'e_Fallen_N', name: '폴른', cost: 3, rarity: 1, arena: 1, hp: 700, dmg: 95, rate: 0.6, range: 4.5, speed: SPD.fast, h: 1.5, fx: 'bullet', color: 0xff6060, sfx: 'mg', desc: '빠르게 움직이며 연사합니다.' }),
    T('harvester', { rig: 'e_Harvester_N', img: 'e_Harvester_N', name: '하베스터', cost: 4, rarity: 1, arena: 1, hp: 1500, dmg: 190, rate: 1.4, range: 1.2, hits: 'ground', splash: 1.6, speed: SPD.mid, radius: 0.55, mass: 7, h: 1.7, fx: 'claw', color: 0xffc040, sfx: 'swing', desc: '주변을 휩쓰는 근접 범위 공격.' }),
    T('bigchick', { rig: 'e_BigChick_N', img: 'e_BigChick_N', name: '빅 칙', cost: 4, rarity: 1, arena: 1, hp: 2100, dmg: 150, rate: 1.3, range: 0.8, hits: 'ground', speed: SPD.mid, radius: 0.6, mass: 10, h: 1.9, fx: 'claw', color: 0xffd060, sfx: 'swing', desc: '덩치 큰 칙. 전선을 버티는 저렴한 탱커.' }),
    T('rampart', { rig: 'e_Rampart_N', img: 'e_Rampart_N', name: '램파트', cost: 4, rarity: 1, arena: 1, hp: 2700, dmg: 105, rate: 1.2, range: 0.8, hits: 'ground', speed: SPD.slow, radius: 0.65, mass: 14, h: 1.9, fx: 'claw', color: 0xffa060, sfx: 'cannon', desc: '두꺼운 장갑의 방벽. 뒤의 사수를 지킵니다.' }),
    // ── S ──
    T('predator', { rig: 'e_Predator_N', img: 'e_Predator_N', name: '프레데터', cost: 4, rarity: 2, hp: 1250, dmg: 600, rate: 1.6, range: 0.8, hits: 'ground', speed: SPD.fast, radius: 0.5, mass: 5, h: 1.6, fx: 'claw', color: 0xff4040, sfx: 'slash', desc: '고속 사냥꾼. 일격이 무겁습니다.' }),
    T('gigantes', { rig: 'e_Gigantes_N', img: 'e_Gigantes_N', name: '기간테스', cost: 6, rarity: 2, hp: 3800, dmg: 240, rate: 1.5, range: 1.0, hits: 'ground', aim: 'buildings', speed: SPD.slow, radius: 0.75, mass: 18, h: 2.4, fx: 'claw', color: 0xffa060, sfx: 'cannon', desc: '건물만 노리는 거대 병기.' }),
    T('doomeater', { rig: 'e_DoomEater_N', img: 'e_DoomEater_N', name: '둠 이터', cost: 4, rarity: 2, arena: 1, hp: 1500, dmg: 260, rate: 1.5, range: 0.8, hits: 'ground', aim: 'buildings', jump: true, speed: SPD.vfast, radius: 0.55, mass: 6, h: 1.8, fx: 'claw', color: 0xff5050, sfx: 'swing', desc: '건물만 노리는 고속 돌격. 강을 뛰어넘습니다.' }),
    T('destroyer', { rig: 'e_Destroyer_N', img: 'e_Destroyer_N', name: '디스트로이어', cost: 5, rarity: 2, arena: 2, hp: 780, dmg: 270, rate: 1.4, range: 5.5, splash: 1.5, speed: SPD.mid, h: 1.7, fx: 'holy', color: 0xff6a4a, sfx: 'energy', desc: '공중·지상 범위 에너지포.' }),
    T('fortress', { rig: 'e_Fortress_N', img: 'e_Fortress_N', name: '포트리스', cost: 5, rarity: 2, arena: 2, hp: 2200, dmg: 200, rate: 1.6, range: 5, hits: 'ground', aim: 'buildings', splash: 1, speed: SPD.slow, radius: 0.7, mass: 15, h: 2.3, fx: 'grenade', color: 0xff8050, sfx: 'cannon', desc: '건물만 노리는 이동 포대. 멀리서 탑을 포격하며 버팁니다.' }),
    // ── SS (champions) ──
    T('blackknight', { rig: 'e_BlackKnight_N', img: 'e_BlackKnight_N', name: '블랙 나이트', cost: 5, rarity: 3, arena: 2, hp: 2100, dmg: 330, rate: 1.3, range: 1.0, hits: 'ground', splash: 1.2, speed: SPD.fast, radius: 0.6, mass: 9, h: 2.0, fx: 'slash', color: 0xb070ff, sfx: 'slash', desc: '빠르고 강한 흑기사. 주변까지 베어냅니다.',
      skill: { name: '흑마 돌격', cost: 1, cd: 9, kind: 'dash', dist: 5, dmg: 520, radius: 1.3, color: 0xb070ff, desc: '목표를 향해 돌진하며 경로의 적을 베어냅니다.' } }),
    T('juggernaut', { rig: 'e_Juggernaut_N', img: 'e_Juggernaut_N', name: '저거너트', cost: 7, rarity: 3, arena: 2, hp: 3500, dmg: 800, rate: 1.8, range: 0.9, hits: 'ground', speed: SPD.slow, radius: 0.75, mass: 16, h: 2.3, fx: 'claw', color: 0xff8040, sfx: 'expM', desc: '압도적인 중장갑 근접 병기.',
      skill: { name: '대지 분쇄', cost: 3, cd: 13, kind: 'nova', radius: 2.8, dmg: 560, stun: 0.8, color: 0xff8040, desc: '주변 적 모두에게 큰 피해 + 0.8초 기절.' } }),
    T('executioner', { rig: 'e_Executioner_EW', img: 'e_Executioner_EW', name: '엑스큐셔너', cost: 6, rarity: 3, arena: 3, hp: 2600, dmg: 400, rate: 1.5, range: 1.0, hits: 'ground', splash: 1.2, speed: SPD.mid, radius: 0.65, mass: 12, h: 2.3, fx: 'slash', color: 0xff3050, sfx: 'slash', desc: '처형인. 거대한 낫으로 주변을 베어냅니다.',
      skill: { name: '단두대', cost: 2, cd: 11, kind: 'dash', dist: 4.5, dmg: 850, radius: 1.5, color: 0xff3050, desc: '목표를 향해 돌진하며 경로의 적을 처형합니다.' } }),
    T('goltarion', { rig: 'e_Goltarion_N', img: 'e_Goltarion_N', name: '골타리온', cost: 6, rarity: 3, arena: 3, hp: 3000, dmg: 380, rate: 1.5, range: 1.0, hits: 'ground', splash: 1.4, speed: SPD.slow, radius: 0.75, mass: 16, h: 2.5, fx: 'claw', color: 0xff6060, sfx: 'expM', desc: '방어막을 두른 거대 병기.',
      skill: { name: '방어막 전개', cost: 2, cd: 14, kind: 'shield', dur: 5, k: 0.2, color: 0xff6060, desc: '5초간 받는 피해 80% 감소.' } }),
    T('emperorchick', { rig: 'e_EmperorChick_N', img: 'e_EmperorChick_N', name: '엠페러 칙', cost: 6, rarity: 3, arena: 3, hp: 2400, dmg: 260, rate: 1.4, range: 4.5, splash: 1.2, speed: SPD.slow, radius: 0.7, mass: 14, h: 2.4, fx: 'grenade', color: 0xffd040, sfx: 'cannon', desc: '칙들의 황제. 부하를 불러냅니다.',
      skill: { name: '황제의 부름', cost: 2, cd: 12, kind: 'summon', card: 'nightchick', n: 4, color: 0xffd040, desc: '나이트 칙 4기를 소환합니다.' } }),
    T('nidhogg', { rig: 'e_Nidhogg_N', img: 'e_Nidhogg_N', name: '니드호그', cost: 7, rarity: 3, arena: 4, air: true, hp: 2800, dmg: 300, rate: 1.6, range: 3.5, splash: 1.6, speed: SPD.slow, radius: 0.75, mass: 14, h: 2.4, fx: 'fireball', color: 0x9aff60, sfx: 'expM', desc: '세계수를 갉아먹는 비룡. 공중 범위 공격.',
      skill: { name: '부식의 숨결', cost: 2, cd: 12, kind: 'barrage', n: 4, radius: 1.8, dmg: 380, slow: 0.4, reach: 6, color: 0x9aff60, desc: '전방에 부식탄 4발, 맞은 적은 둔화.' } }),
  ];

  const SPELLS = [
    S('strike', { name: '포격 지원', icon: 'strike', cost: 4, rarity: 1, spell: 'fireball', radius: 2.5, dmg: 580, towerK: 0.35, knock: 0.6, color: 0xff7a2a, sfx: 'expB', desc: '지정 지점에 포격. 범위 피해와 넉백 (탑에는 35%).' }),
    S('emp', { name: 'EMP', icon: 'emp', cost: 2, rarity: 0, spell: 'zap', radius: 2.5, dmg: 190, towerK: 0.35, stun: 0.6, color: 0x7ad8ff, sfx: 'elec', desc: '즉시 전자기 충격. 범위 피해 + 0.6초 기절.' }),
    S('freeze', { name: '절대 빙결', icon: 'freeze', cost: 4, rarity: 2, arena: 1, spell: 'freeze', radius: 3, dmg: 100, towerK: 0.35, freeze: 4, color: 0xaef4ff, sfx: 'ice', desc: '범위 안의 적과 탑을 4초간 얼립니다.' }),
    S('napalm', { name: '화염 지대', icon: 'napalm', cost: 4, rarity: 1, arena: 1, spell: 'zone', radius: 3, dmg: 95, dur: 6, slow: 0.15, towerK: 0.35, color: 0xff6a2a, sfx: 'spray', desc: '6초 동안 불타는 지대. 초당 피해 + 15% 둔화. 무리에 강합니다.' }),
    S('missile', { name: '순항 미사일', icon: 'missile', cost: 6, rarity: 2, arena: 2, spell: 'fireball', radius: 1.8, dmg: 1050, towerK: 0.35, knock: 1, color: 0xffc040, sfx: 'expB', desc: '좁은 범위에 막대한 피해. 사수 처리와 마무리용.' }),
    S('overclock', { name: '오버클럭', icon: 'overclock', cost: 2, rarity: 2, arena: 2, spell: 'rage', radius: 3.5, dur: 6, k: 1.35, color: 0xd65cff, sfx: 'reinforce', desc: '아군의 이동·공격 속도를 6초간 35% 올립니다.' }),
  ];

  // buildings: placed on your half, they stand still and lose health over their lifetime.
  // Defensive ones pull "buildings only" attackers away from your towers; spawners keep producing troops.
  const B = (id, o) => Object.assign({ id, type: 'building', count: 1, arena: 0, r: 0.9 }, o);
  const BUILDINGS = [
    B('turret', { faction: 'orca', name: '그렘린 포탑', icon: 'turret', cost: 4, rarity: 1, hp: 1050, life: 30, dmg: 130, rate: 0.8, range: 6, hits: 'all', guard: { rig: 'leprechaun', k: 1.05 }, fx: 'bullet', color: 0xffe08a, sfx: 'mg', desc: '공중·지상을 쏘는 방어 포탑 (30초). 건물만 노리는 적을 끌어당깁니다.' }),
    B('outpost', { faction: 'orca', name: '전진 기지', icon: 'outpost', cost: 5, rarity: 1, arena: 1, hp: 950, life: 40, spawn: { card: 'brownie', every: 6 }, guard: { rig: 'brownie', k: 1 }, color: 0x7ad8ff, desc: '40초 동안 6초마다 브라우니를 출격시킵니다.' }),
    B('barricade', { faction: 'orca', name: '방벽', icon: 'barricade', cost: 3, rarity: 0, hp: 1900, life: 25, wall: true, r: 1.15, color: 0x9fd0ff, desc: '튼튼한 방벽 (25초). 건물만 노리는 적을 붙잡고 지상 유닛의 길을 막습니다.' }),
    B('i_barricade', { faction: 'iron', name: '장갑 장벽', icon: 'barricade', cost: 3, rarity: 0, hp: 1900, life: 25, wall: true, r: 1.15, color: 0xffb070, desc: '튼튼한 장벽 (25초). 건물만 노리는 적을 붙잡고 지상 유닛의 길을 막습니다.' }),
    B('i_turret', { faction: 'iron', name: '철충 포대', icon: 'turret', cost: 4, rarity: 1, hp: 1050, life: 30, dmg: 130, rate: 0.8, range: 6, hits: 'all', guard: { rig: 'e_Phalangites_N', h: 1.4 }, fx: 'bullet', color: 0xffb070, sfx: 'rifle', desc: '공중·지상을 쏘는 방어 포대 (30초). 건물만 노리는 적을 끌어당깁니다.' }),
    B('hatchery', { faction: 'iron', name: '부화장', icon: 'outpost', cost: 5, rarity: 1, arena: 1, hp: 950, life: 40, spawn: { card: 'nightchick', every: 5 }, guard: { rig: 'e_NightChick_N', h: 1.1 }, color: 0xffd060, desc: '40초 동안 5초마다 나이트 칙을 부화시킵니다.' }),
  ];

  ORCA.forEach((c) => { c.faction = 'orca'; });
  IRON.forEach((c) => { c.faction = 'iron'; });
  const CARDS = [...ORCA, ...IRON, ...BUILDINGS,
    ...SPELLS.map((s) => Object.assign({}, s, { faction: 'orca' })),
    ...SPELLS.map((s) => Object.assign({}, s, { id: 'i_' + s.id, faction: 'iron' }))];

  const FACTIONS = {
    orca: {
      name: '오르카', color: '#3aa8ff', hex: 0x3aa8ff, banner: 'c_3P_Labiata_N',
      king: { rig: 'constantia', k: 1.35, fx: 'laser', color: 0xff6af0, sfx: 'laserBig' },
      princess: { rig: 'nymph', k: 1.25, fx: 'bullet', color: 0x9ff4ff, sfx: 'rifle' },
      deck: ['brownie', 'leprechaun', 'impet', 'raven', 'harpy', 'zero', 'empress', 'strike'],
      emotes: [['c_BR_Brownie_N', '좋아요!'], ['c_3P_Labiata_N', '잘했어요'], ['c_BR_Leprechaun_N', '이런…'], ['c_DS_KunoichiZero_N', '덤벼라!']],
    },
    iron: {
      name: '철충', color: '#ff4a5a', hex: 0xff4a5a, banner: 'e_IronPrince_N',
      king: { rig: 'e_IronPrince_N', h: 2.5, fx: 'holy', color: 0xff5050, sfx: 'energy' },
      princess: { rig: 'e_Fortress_N', h: 2.0, fx: 'bullet', color: 0xffa070, sfx: 'cannon' }, // an artillery walker reads as a gun emplacement (the dark scythe guard read as debris)
      deck: ['nightchick', 'drone', 'legion', 'centurion', 'intruder', 'predator', 'gigantes', 'i_strike'],
      emotes: [['e_NightChick_N', '삐빅!'], ['e_IronPrince_N', '하찮군'], ['e_Drone_N', '오류 발생'], ['e_BlackKnight_N', '섬멸한다']],
    },
  };

  // trophy road: each arena re-skins the floor, raises the opponent's card level and unlocks cards
  const ARENAS = [
    { name: '훈련 구역', bg: 'assets/bg/arena0.jpg', floor: 'assets/bg/floor0.jpg', floorDim: 0.05, trophy: 0, lvl: 1, home: ['#34424f', '#2f3c48'], away: ['#463a40', '#40353b'], rim: '#151a20', river: '#0d3446', glow: 0x55ddff },
    { name: '폐허 도시', bg: 'assets/bg/arena1.jpg', floor: 'assets/bg/floor1.jpg', deck: ['#a6b4a6', '#c2b096'], trophy: 300, lvl: 2, home: ['#3d4440', '#383f3b'], away: ['#4a4038', '#443a33'], rim: '#1a1c19', river: '#163a2c', glow: 0x7dffb0 },
    { name: '철충 둥지', bg: 'assets/bg/arena2.jpg', floor: 'assets/bg/floor2.jpg', deck: ['#aaa8c4', '#c6a2a8'], trophy: 800, lvl: 3, home: ['#3a3446', '#342f40'], away: ['#55303a', '#4d2a33'], rim: '#1b1218', river: '#3a0f22', glow: 0xff5a8a },
    { name: '오르카 호 갑판', bg: 'assets/bg/arena3.jpg', floor: 'assets/bg/floor3.jpg', deck: ['#a0b8d4', '#bcaab8'], floorDim: 0.42, trophy: 1500, lvl: 4, home: ['#2c3e58', '#283850'], away: ['#4a3a46', '#433440'], rim: '#0d1422', river: '#0b2d55', glow: 0x6ab8ff },
    { name: '최종 결전', bg: 'assets/bg/arena4.jpg', floor: 'assets/bg/floor4.jpg', deck: ['#a8a8b4', '#c4aa8e'], floorDim: 0.26, trophy: 2500, lvl: 5, home: ['#2a2a32', '#26262e'], away: ['#3c2626', '#352222'], rim: '#0a0a0e', river: '#3a2a08', glow: 0xffc040 },
  ];
  const arenaOf = (trophy) => { let a = 0; ARENAS.forEach((r, i) => { if (trophy >= r.trophy) a = i; }); return a; };

  // card levels: +10% HP and damage per level; upgrades cost card copies and parts (gold)
  const LEVEL = {
    max: 9,
    mult: (lv) => Math.pow(1.1, (lv || 1) - 1),
    copies: [0, 2, 4, 10, 20, 50, 100, 200, 400], // [lv]: copies needed to go from level lv to lv+1 ([0] unused)
    gold: [0, 20, 50, 150, 400, 1000, 2000, 4000, 8000],
  };

  const BAL = {
    W: 18, H: 32,
    river: 1,             // |z| < river is water (ground troops cross on the bridges)
    bridgeX: 5.5, bridgeW: 1.3, // bridge centres and half width
    tower: {
      king: { hp: 4800, dmg: 110, rate: 1.0, range: 7, r: 1.6, z: 13.3 },
      princess: { hp: 3050, dmg: 105, rate: 0.8, range: 7.5, r: 1.2, x: 5.5, z: 10 },
      bld: { r: 0.9 }, // player-built structures (size of their bunker art)
    },
    elixirMax: 10, elixirStart: 5, elixirRate: 2.8, // seconds per 1 energy
    matchTime: 180, doubleAt: 60, overtime: 60,
    deployDepth: 1.6,     // the player's area ends this far before the river
    pocketDepth: 6,       // ... and reaches this far into a lane whose princess tower has fallen
    diffs: [
      // attackAt: energy the AI waits for before starting a push of its own
      { key: 'easy', name: '훈련', think: 1.8, reserve: 2, elixirK: 0.7, smart: 0.2, lvl: -1, trophy: 0.5, attackAt: 9.5 },
      { key: 'normal', name: '실전', think: 0.8, reserve: 1, elixirK: 1, smart: 0.7, lvl: 0, trophy: 1, attackAt: 8 },
      { key: 'hard', name: '정예', think: 0.45, reserve: 0, elixirK: 1.05, smart: 1, lvl: 1, trophy: 1.4, attackAt: 7 },
    ],
    modes: [
      { key: 'normal', name: '일반전', desc: '3분 · 마지막 1분 에너지 2배' },
      { key: 'rush', name: '에너지 폭주', desc: '처음부터 에너지 2배 · 연장전 3배' },
      { key: 'draft', name: '무작위 덱', desc: '양측 모두 해금 카드로 만든 무작위 덱' },
      { key: 'daily', name: '오늘의 작전', desc: '날마다 바뀌는 특수 규칙' },
    ],
  };

  // AI commanders: each plays with a style (attack: energy offset before pushing; split: alternates lanes;
  // tanks: builds around two win conditions; counter: always follows up a defence)
  const STYLES = {
    aggro: { name: '돌격형', attack: -1.6, split: true },
    control: { name: '수비형', attack: 0.8, counter: true },
    siege: { name: '공성형', attack: 0, tanks: true },
    balanced: { name: '균형형', attack: -0.6, counter: true },
  };
  const COMMANDERS = {
    iron: [
      { img: 'e_LemonadeOmega_N', name: '레모네이드 오메가', style: 'control' },
      { img: 'e_AzazelAlter_N', name: '아자젤 얼터', style: 'aggro' },
      { img: 'e_Raider_B04', name: '레이더 B04', style: 'balanced' },
      { img: 'e_IronPrince_N', name: '철의 왕자', style: 'siege' },
    ],
    orca: [
      { img: 'c_3P_Labiata_N', name: '라비아타 프로토타입', style: 'balanced' },
      { img: 'c_3P_ConstantiaS2_N', name: '콘스탄챠 S2', style: 'control' },
      { img: 'hero_alice', name: '앨리스', style: 'aggro' },
      { img: 'c_DS_Azazel_N', name: '아자젤', style: 'siege' },
    ],
  };

  // supply crates: earned by winning, opened after a short real-time unlock
  const CHESTS = [
    { key: 'normal', name: '보급 상자', time: 30, gold: [40, 70], cards: 3, weight: 70, color: '#8aa0b4' },
    { key: 'rare', name: '정예 보급 상자', time: 120, gold: [110, 170], cards: 5, weight: 24, color: '#38b6ff' },
    { key: 'epic', name: '특급 보급 상자', time: 300, gold: [260, 380], cards: 8, weight: 6, color: '#ffc81e', ss: true },
  ];

  // daily operation: one rule twist per day (index = days since epoch)
  const MUTATORS = [
    { key: 'mirror', name: '거울 작전', desc: '상대가 내 덱과 똑같은 카드로 싸웁니다.', mirror: true },
    { key: 'champs', name: '영웅의 날', desc: '챔피언 스킬 에너지 -1, 재사용 시간 40% 단축.', skillCost: -1, skillCd: 0.6 },
    { key: 'swift', name: '전격전', desc: '모든 유닛 이동 속도 +35%, 에너지 회복 +50%.', speed: 1.35, elixir: 1.5 },
    { key: 'titans', name: '거인의 전장', desc: '모든 유닛·건물 체력 +60% (공격력은 그대로). 오래 버티는 쪽이 이깁니다.', hp: 1.6 },
    { key: 'sudden', name: '단기 결전', desc: '경기 시간 90초, 처음부터 에너지 2배.', time: 90, rush: true },
    // combined rules
    { key: 'heroblitz', name: '영웅 전격전', desc: '전격전 + 영웅의 날: 이동 속도 +35%, 챔피언 스킬 에너지 -1·재사용 40% 단축.', speed: 1.35, skillCost: -1, skillCd: 0.6 },
    { key: 'titanmirror', name: '거인 거울전', desc: '거울 작전 + 거인의 전장: 같은 덱, 모든 체력 +60%.', mirror: true, hp: 1.6 },
  ];
  // the day turns at midnight Korean time (UTC+9)
  const dayIndex = (date) => Math.floor(((date || Date.now()) + 9 * 3600000) / 86400000);
  const mutatorOf = (date) => MUTATORS[dayIndex(date) % MUTATORS.length];

  // trophy road: one-time rewards as the trophy count climbs (claimed on the title screen)
  const ROAD = [];
  for (let tr = 100; tr <= 3000; tr += 100) ROAD.push(tr % 500 === 0 ? { trophy: tr, chest: tr >= 1500 ? 'epic' : 'rare' } : { trophy: tr, gold: 60 + Math.floor(tr / 10) });

  // rotating objectives (three active at a time); progress comes from each battle's stats
  const MISSIONS = [
    { k: 'win', name: '전투 승리', goal: 3, gold: 90 },
    { k: 'crowns', name: '크라운 획득', goal: 6, gold: 70 },
    { k: 'three', name: '3크라운 승리', goal: 1, gold: 120 },
    { k: 'skills', name: '챔피언 스킬 사용', goal: 5, gold: 70 },
    { k: 'cards', name: '카드 배치', goal: 40, gold: 50 },
    { k: 'kills', name: '적 유닛 처치', goal: 60, gold: 60 },
    { k: 'dmg', name: '누적 피해', goal: 100000, gold: 80 },
    { k: 'rush', name: '에너지 폭주 모드 플레이', goal: 2, gold: 60 },
    { k: 'iron', name: '철충 진영으로 승리', goal: 1, gold: 80 },
    { k: 'orca', name: '오르카 진영으로 승리', goal: 2, gold: 70 },
  ];

  window.DATA = {
    RARITY, CARDS, FACTIONS, ARENAS, LEVEL, BAL, MISSIONS, ROAD, MUTATORS, mutatorOf, dayIndex, STYLES, COMMANDERS, CHESTS, arenaOf,
    card: Object.fromEntries(CARDS.map((c) => [c.id, c])),
    byFaction: (f) => CARDS.filter((c) => c.faction === f),
  };
})();
