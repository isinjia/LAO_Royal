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
    T('brownie', { rig: 'brownie', img: 'c_BR_Brownie_N', cr: '창 고블린', name: '브라우니 분대', cost: 2, rarity: 0, count: 3, hp: 121, dmg: 74, rate: 1.7, range: 5.5, speed: SPD.vfast, radius: 0.35, mass: 2, fx: 'bullet', color: 0xffe08a, sfx: 'rifle', desc: '돌격소총으로 무장한 브라우니 3기. 싸고 빠르게 공중·지상을 견제합니다.' }),
    T('leprechaun', { rig: 'leprechaun', img: 'c_BR_Leprechaun_N', cr: '다트 고블린', name: '레프리콘', cost: 3, rarity: 0, hp: 237, dmg: 119, rate: 0.7, range: 6.5, speed: SPD.vfast, fx: 'bullet', color: 0x9dff7a, sfx: 'mg', desc: '기관총 연사. 공중 유닛과 무리 상대로 든든합니다.' }),
    T('gnome', { rig: 'gnome', img: 'c_BR_Gnome_N', cr: '머스킷병', name: '노움', cost: 4, rarity: 0, hp: 656, dmg: 198, rate: 1.0, range: 6.0, speed: SPD.mid, fx: 'bullet', color: 0xffd080, sfx: 'rifle', desc: '방어벽을 펼치는 수비형 사수. AR-X-780 소총으로 공중·지상을 견제하며 전선을 버팁니다.' }), // (original: defender, AR-X-780 rifle + deployable wall)
    T('valkyrie', { rig: 'valkyrie', img: 'c_BR_Valkyrie_N', cr: '프린세스', hitFx: 'hnadgun_hit', name: '발키리', cost: 3, rarity: 0, hp: 237, dmg: 154, rate: 3.0, range: 9.0, splash: 2.5, speed: SPD.mid, fx: 'snipe', color: 0x9fd0ff, sfx: 'handgun', desc: '모신나강 저격소총의 정밀 저격수. 멀리서 쏜 탄이 터지며 주변의 무리까지 함께 맞힙니다.' }), // (original: attacker, Mosin-Nagant sniper rifle)
    // ── A ──
    T('impet', { rig: 'impet', img: 'c_BR_Impet_N', cr: '메가 미니언', name: '임펫', cost: 3, rarity: 1, air: true, hp: 762, dmg: 283, rate: 1.5, range: 1.6, speed: SPD.mid, radius: 0.5, mass: 5, fx: 'missile', color: 0xffa040, sfx: 'missile', desc: '강철라인의 비행 중화기 바이오로이드. RPG2040 대장갑 로켓으로 공중·지상의 한 대상에 큰 피해를 줍니다.' }), // (the original AA-7: a flying attacker with an RPG2040 launcher)
    T('raven', { rig: 'raven', img: 'c_BR_Raven_N', cr: '아기 드래곤', name: '레이븐', cost: 4, rarity: 1, air: true, hp: 1051, dmg: 146, rate: 1.5, range: 3.5, splash: 1.2, speed: SPD.fast, fx: 'grenade', color: 0xfff2b0, sfx: 'cannon', desc: '하늘의 전방 관측병. 디스크 런처로 공중·지상의 무리를 범위 폭격합니다.' }), // (original: flying spotter, disc launcher)
    T('harpy', { rig: 'harpy', img: 'c_BR_Harpy_N', cr: '일렉트로 드래곤', hitFx: 'Kunoichi_skill2_after_Lighting', name: '하르페이아', cost: 5, rarity: 1, air: true, hp: 867, dmg: 175, rate: 2.1, range: 3.5, splash: 0, chain: 3, stun: 0.5, speed: SPD.mid, radius: 0.55, mass: 5, fx: 'lightning', color: 0xb98bff, sfx: 'elec', desc: '번지는 전격 미사일로 세 대상까지 연쇄 타격하고 잠시 멈춥니다.' }),
    T('banshee', { rig: 'banshee', img: 'c_BR_Banshee_N', cr: '미니언', name: '밴시', cost: 3, rarity: 1, arena: 1, air: true, hp: 209, dmg: 107, rate: 1.0, range: 1.6, splash: 0, count: 3, speed: SPD.fast, fx: 'bullet', color: 0x7affd4, sfx: 'cannon', desc: '급강하 폭격기 3기. 37mm 기관포로 공중·지상을 휩씁니다.' }), // (original: flying dive bomber, 37mm autocannon + aerial bomb)
    T('sylphid', { rig: 'sylphid', img: 'c_BR_Sylphid_N', cr: '박쥐', name: '실피드', cost: 2, rarity: 1, arena: 1, air: true, hp: 74, dmg: 74, rate: 1.3, range: 1.2, count: 5, speed: SPD.vfast, fx: 'bullet', color: 0xd78bff, sfx: 'mg', k: 0.9, desc: '고속 추격기 5기. 빠르고 약해서 타워 한 방에 떨어집니다.' }), // (original: flying anti-air pursuer, LMG + homing missile)
    T('undine', { rig: 'undine', img: 'c_BR_Undine_N', cr: '비행 기계', name: '운디네', cost: 4, rarity: 1, arena: 1, air: true, hp: 559, dmg: 156, rate: 1.1, range: 6.0, speed: SPD.fast, fx: 'bullet', color: 0x9feaff, sfx: 'cannon', k: 0.9, desc: '비행 수비기. 30mm 리볼버 캐논으로 버티며 적을 붙잡아 둡니다.' }), // (original: flying defender, 30mm revolver cannon + missile)
    T('nymph', { rig: 'nymph', img: 'c_BR_Nymph_N', cr: '폭죽 병사', name: '님프', cost: 3, rarity: 1, arena: 1, hp: 277, dmg: 58, rate: 3.0, range: 6.0, splash: 1.2, speed: SPD.fast, fx: 'bullet', color: 0x9fffc8, sfx: 'mg', desc: '크리스 MG80 경기관총의 제압 사격. 좁은 범위의 무리를 한꺼번에 묶어 둡니다.' }), // (original: attacker, Kriss MG80 LMG with a suppressing barrage)
    // ── S ──
    T('zero', { rig: 'zero', img: 'c_DS_KunoichiZero_N', cr: '미니 페카', name: '쿠노이치 제로', cost: 4, rarity: 2, hp: 1239, dmg: 656, rate: 1.6, range: 0.8, hits: 'ground', speed: SPD.fast, radius: 0.45, mass: 5, fx: 'slash', color: 0xff3b6b, sfx: 'slash', desc: '초고속 참격. 한 방 피해가 매우 큰 암살자.' }),
    T('thetis', { rig: 'thetis', img: 'c_BR_Thetis_N', cr: '미니언 무리', name: '테티스', cost: 5, rarity: 2, arena: 1, air: true, hp: 209, dmg: 107, rate: 1.0, range: 1.6, count: 6, speed: SPD.fast, fx: 'bullet', color: 0x66ccff, sfx: 'mg', k: 0.9, desc: '비행 지원기 6기. M312 경기관총의 연사와 스왈로 미사일로 적을 묶습니다.' }), // (original: flying supporter, M312-E3 LMG + SWALLOW missiles)
    T('mercury', { rig: 'mercury', img: 'c_ST_Mercury_N', cr: '해골 드래곤', name: '머큐리', cost: 4, rarity: 2, arena: 1, air: true, hp: 512, dmg: 146, rate: 1.9, range: 3.5, splash: 0.8, count: 2, speed: SPD.fast, radius: 0.5, mass: 6, fx: 'bullet', color: 0x7dffb0, sfx: 'gun', desc: '드론 허브 페타소스로 공중·지상을 범위 공격하는 비행 지원기 2기.' }), // (original: flying controller, drone hub Petasos)
    T('leona', { rig: 'leona', img: 'c_BR_Leona_N', cr: '마녀', name: '레오나', cost: 5, rarity: 2, arena: 2, hp: 765, dmg: 122, rate: 1.1, range: 5.5, splash: 1.0, spawn: { card: 'brownie', every: 7, n: 2 }, speed: SPD.mid, radius: 0.5, mass: 6, fx: 'bullet', color: 0xff9ad5, sfx: 'handgun', desc: '지휘 프레임을 두른 지휘관. P86G 권총으로 주변까지 쏘며 7초마다 브라우니 2기를 불러냅니다.' }), // (original: commander supporter, P86G pistol)
    T('azazel', { rig: 'azazel', img: 'c_DS_Azazel_N', cr: '배틀 힐러', name: '아자젤', cost: 4, rarity: 2, arena: 2, air: true, hp: 1563, dmg: 135, rate: 1.5, range: 1.6, healHit: { r: 4, amt: 70 }, speed: SPD.mid, fx: 'claw', color: 0xffe9a0, sfx: 'energy', desc: '하늘을 나는 수호 천사. 가까이 붙어 싸우며, 공격할 때마다 주변 아군을 회복시킵니다.' }), // (original: flying defender, Holy Light; Clash Royale's Battle Healer: heals around it on every hit)
    T('phoenix', { rig: 'phoenix', img: 'c_BR_Phoenix_N', cr: '박격포', name: '피닉스', cost: 5, rarity: 2, arena: 2, air: true, hp: 909, dmg: 242, rate: 5.0, range: 11.5, hits: 'ground', splash: 1.6, speed: SPD.slow, radius: 0.55, mass: 6, fx: 'grenade', color: 0xff8a3d, sfx: 'cannon', desc: '비행 포병. M87 105mm 곡사포로 멀리서 지상을 포격합니다. 공중은 못 맞힙니다.' }), // (original: flying artillery, M87 105mm howitzer)
    T('hela', { rig: 'hela', img: 'c_BR_Hela_N', cr: '일렉트로 마법사', name: '헬라', cost: 4, rarity: 2, arena: 2, hp: 649, dmg: 200, rate: 1.8, range: 5.0, stun: 0.5, speed: SPD.fast, radius: 0.5, mass: 6, fx: 'holy', color: 0xc77dff, sfx: 'energy', desc: '나노 입자 신호 증폭으로 폐기 부품을 형상화해 적을 붙잡습니다. 맞은 적은 잠시 멈춥니다.' }), // (original: supporter, neural signal amplifier staff)
    // ── SS (champions) ──
    T('empress', { rig: 'empress', img: 'c_PECS_Empress_N', cr: '아처 퀸', name: '엠프리스', cost: 5, rarity: 3, hp: 909, dmg: 205, rate: 1.2, range: 5.0, slow: 0.3, slowDur: 1, speed: SPD.mid, radius: 0.6, mass: 10, fx: 'frost', color: 0x9feaff, sfx: 'ice', k: 0.95, desc: '아이스 에이지 블래스터로 한 대상을 정확히 쏘아 얼려 붙잡는 펭귄 황제.',
      skill: { name: '아이스 에이지', cost: 2, cd: 12, kind: 'barrage', n: 5, radius: 1.6, dmg: 300, slow: 0.45, reach: 7, color: 0x9feaff, desc: '전방 적 진영에 얼음 폭풍 5발, 맞은 적은 둔화.' } }), // (original: attacker, Ice Age Blaster)
    T('labiata', { rig: 'labiata', img: 'c_3P_Labiata_N', cr: '메가 나이트', name: '라비아타', cost: 7, rarity: 3, arena: 2, hp: 3630, dmg: 244, rate: 1.7, range: 1.2, hits: 'ground', splash: 1.3, speed: SPD.mid, radius: 0.7, mass: 16, fx: 'slash', color: 0xffd36e, sfx: 'swing', desc: '오르카의 지휘관. 거대한 체력으로 버티며 플라즈마 반응로 양손검으로 주변을 휩씁니다.',
      skill: { name: '지휘관의 일격', cost: 3, cd: 13, kind: 'nova', radius: 2.8, dmg: 600, stun: 0.8, color: 0xffd36e, desc: '주변 적 모두에게 큰 피해 + 0.8초 기절.' } }),
    T('titania', { rig: 'titania', img: 'c_3P_Titania_N', cr: '피닉스', name: '티타니아', cost: 5, rarity: 3, arena: 3, air: true, hp: 1300, dmg: 198, rate: 1.0, range: 1.6, splash: 1.0, slow: 0.3, slowDur: 2, speed: SPD.mid, radius: 0.5, mass: 6, fx: 'frost', color: 0xaef4ff, sfx: 'ice', desc: '서리 폭풍 마이크로봇 군체를 부리는 빙결의 요정.',
      skill: { name: '절대 영도', cost: 2, cd: 14, kind: 'nova', radius: 3.4, dmg: 220, freeze: 2.5, color: 0xaef4ff, desc: '주변의 적과 탑을 2.5초간 얼립니다.' } }),
    T('tiamat', { rig: 'tiamat', img: 'c_ST_Tiamat_N', cr: '벌룬', name: '티아멧', cost: 5, rarity: 3, arena: 3, air: true, hp: 1533, dmg: 584, rate: 2.0, range: 0.5, aim: 'buildings', hits: 'ground', speed: SPD.mid, radius: 0.55, mass: 7, fx: 'slash', color: 0x6ef0ff, sfx: 'slash', desc: '리히트슈베르트와 대장갑 블레이드로 건물만 노리고 적진 깊숙이 뛰어드는 비행 선봉장.',
      skill: { name: '리히트슈베르트', cost: 2, cd: 11, kind: 'dash', dist: 5, dmg: 820, radius: 1.4, color: 0x6ef0ff, desc: '목표를 향해 돌진하며 경로의 적을 베어냅니다.' } }), // (original: flying vanguard, Richtschwert + anti-armour blades)
    T('constantia', { rig: 'constantia', img: 'c_3P_ConstantiaS2_N', cr: '매직 아처', name: '콘스탄챠 S2', cost: 4, rarity: 3, arena: 3, hp: 484, dmg: 122, rate: 1.1, range: 7.0, slow: 0.3, slowDur: 1.5, speed: SPD.mid, radius: 0.5, mass: 6, fx: 'snipe', color: 0xff6af0, sfx: 'rifle', desc: '오르카의 부관. 커스텀 레버액션 라이플로 아주 멀리서 적을 맞히고 발을 묶습니다.',
      skill: { name: '보리 지원 사격', cost: 2, cd: 13, kind: 'barrage', n: 3, radius: 1.6, dmg: 520, slow: 0.4, reach: 7, color: 0xff6af0, desc: '보리가 전방 적 진영 3곳을 지원 사격, 맞은 적은 둔화.' } }), // (original Char_3P_ConstantiaS2_N: A1 라이플 사격, A2 발목 잡기 with Bori)
    T('fafnir', { rig: 'fafnir', img: 'c_BR_Fafnir_N', cr: '일렉트로 자이언트', name: '파프니르', cost: 7, rarity: 3, arena: 4, hp: 3518, dmg: 148, rate: 2.1, range: 1.2, chain: 3, stun: 0.5, hits: 'ground', aim: 'buildings', speed: SPD.slow, radius: 0.65, mass: 9, fx: 'lightning', color: 0x5aa8ff, sfx: 'elec', k: 0.9, desc: '테슬라 꼬리 주피터로 건물만 노리고 걸어가며, 때릴 때마다 주변 적에게 번개를 퍼뜨려 멈추는 뇌룡.',
      skill: { name: '뇌룡의 분노', cost: 2, cd: 12, kind: 'storm', n: 7, dmg: 300, stun: 0.6, reach: 6, color: 0x5aa8ff, desc: '주변 적들에게 낙뢰 7발.' } }),
    T('ramiel', { rig: 'ramiel', img: 'c_DS_Ramiel_N', cr: '인페르노 드래곤', hitFx: 'Phoenix_skill1_hit', name: '라미엘', cost: 4, rarity: 3, arena: 4, hp: 1177, dmg: 33, rate: 0.4, range: 3.5, splash: 0, ramp: [1, 3.33, 11.67], speed: SPD.mid, radius: 0.5, mass: 6, fx: 'laser', color: 0xff3a1a, sfx: 'expS', desc: '핵융합 반응로 모탈 신의 업화로 적을 태웁니다.',
      skill: { name: '모탈 신', cost: 2, cd: 13, kind: 'barrage', n: 3, radius: 2.0, dmg: 520, reach: 7, pillar: true, color: 0xff6a2a, desc: '적 밀집 지역에 업화 기둥 3개.' } }), // (original: attacker, fusion reactor Mortal Sin, fire)
  ];

  const IRON = [
    // ── B ──
    T('nightchick', { rig: 'e_NightChick_N', img: 'e_NightChick_N', cr: '고블린', name: '나이트 칙 무리', cost: 2, rarity: 0, count: 4, hp: 184, dmg: 109, rate: 1.1, range: 0.5, hits: 'ground', speed: SPD.vfast, radius: 0.35, mass: 2, h: 1.1, fx: 'bullet', color: 0xffd060, sfx: 'mg', desc: '기관총을 단 소형 철충 4기. 싸고 빠르게 떼로 달려들어 근접 탄막을 쏟아냅니다.' }), // (original: Fallen-based light attacker, machine gun)
    T('drone', { rig: 'e_Drone_N', img: 'e_Drone_N', cr: '재피', name: '드론 편대', cost: 4, rarity: 0, count: 3, air: true, hp: 482, dmg: 106, rate: 2.1, range: 4.5, stun: 0.5, speed: SPD.mid, radius: 0.35, mass: 2, h: 1.0, fx: 'lightning', color: 0xff7070, sfx: 'elec', desc: '충격 미사일을 쏘는 비행 정찰 드론 3기. 맞은 적은 0.5초 감전되어 멈춥니다.' }), // (original: Drone 08 scout UAV, shock missile)
    T('legion', { rig: 'e_Legion_N', img: 'e_Legion_N', cr: '아이스 마법사', hitFx: 'Empress_skill1_ice_Hit', name: '레기온', cost: 3, rarity: 0, hp: 625, dmg: 82, rate: 1.7, range: 5.5, splash: 1.0, slow: 0.35, slowDur: 1.5, speed: SPD.mid, radius: 0.5, mass: 6, h: 1.5, fx: 'frost', color: 0x5ad8ff, sfx: 'mg', desc: 'GAU 미니건의 연사와 끈끈이 폭탄으로 적의 발을 묶습니다.' }), // (original: Rampart-based support, GAU minigun + sticky bombs)
    T('phalangites', { rig: 'e_Phalangites_N', img: 'e_Phalangites_N', cr: '기사', name: '팔랑스', cost: 3, rarity: 0, hp: 1607, dmg: 184, rate: 1.2, range: 1.2, hits: 'ground', speed: SPD.mid, h: 1.5, fx: 'bullet', color: 0xffb070, sfx: 'mg', desc: '기관총으로 전열을 지키는 방패 보병.' }), // (original: Phalanx line, machine-gun protector)
    T('pupphead', { rig: 'e_PuppHead_N', img: 'e_PuppHead_N', cr: '일렉트로 정령', name: '펍 헤드', cost: 1, rarity: 0, hp: 209, dmg: 90, rate: 1.1, range: 2.5, chain: 9, stun: 0.5, kamikaze: true, speed: SPD.vfast, radius: 0.4, mass: 3, h: 1.2, fx: 'lightning', color: 0xffe070, sfx: 'elec', desc: '고압 충격기를 품고 적에게 뛰어드는 AGS 경찰견. 한 번 방전해 주변 적 최대 9기를 감전시키고 0.5초 멈춥니다.' }), // (original: SD3M Pupp Head, HV stun gun; its chain rope is left out: it fires electricity)
    // ── A ──
    T('centurion', { rig: 'e_Centurion_N', img: 'e_Centurion_N', cr: '마법사', hitFx: 'simple_explosion', name: '센츄리온', cost: 5, rarity: 1, hp: 656, dmg: 256, rate: 1.4, range: 5.5, splash: 1.5, speed: SPD.mid, h: 1.5, fx: 'grenade', color: 0xffa020, sfx: 'cannon', desc: 'XM 유탄 발사기로 공중·지상의 무리를 넓게 포격하는 철충 지휘기.' }), // (original MOB_MP_Centurion_N: A1 XM 유탄 발사기, A2 일제 공격 개시)
    T('intruder', { rig: 'e_Intruder_N', img: 'e_Intruder_N', cr: '호그 라이더', name: '인트루더', cost: 4, rarity: 1, hp: 1544, dmg: 289, rate: 1.6, range: 0.8, hits: 'ground', aim: 'buildings', jump: true, speed: SPD.vfast, h: 1.5, fx: 'missile', color: 0xffa040, sfx: 'missile', desc: '건물만 노리고 강을 뛰어넘어 파고드는 고속 침투기. 재밍 미사일로 탑을 두드립니다.' }), // (original MOB_MP_Intruder_N: A1 재밍 미사일, A2 요격 준비)
    T('fallen', { rig: 'e_Fallen_N', img: 'e_Fallen_N', cr: '아처', name: '폴른', cost: 3, rarity: 1, arena: 1, hp: 277, dmg: 97, rate: 0.9, range: 5.0, count: 2, speed: SPD.mid, h: 1.5, fx: 'bullet', color: 0xff6060, sfx: 'mg', desc: '폴른 2기. 빠르게 움직이며 연사합니다.' }),
    T('harvester', { rig: 'e_Harvester_N', img: 'e_Harvester_N', cr: '나무꾼', name: '하베스터', cost: 4, rarity: 1, arena: 1, hp: 1166, dmg: 220, rate: 0.8, range: 0.7, hits: 'ground', stun: 0.3, speed: SPD.vfast, radius: 0.55, mass: 7, h: 1.7, fx: 'claw', color: 0xffc040, sfx: 'swing', desc: '집게와 갈고리로 적을 끌어당겨 짓누릅니다. 묵직한 일격은 잠시 기절.' }), // (original: Tommy Walker-based bruiser, claw + grappling hook)
    T('bigchick', { rig: 'e_BigChick_N', img: 'e_BigChick_N', cr: '발키리', name: '빅 칙', cost: 4, rarity: 1, arena: 1, hp: 1737, dmg: 243, rate: 1.5, range: 1.2, splash: 2.0, hits: 'ground', speed: SPD.mid, radius: 0.6, mass: 10, h: 1.9, fx: 'bullet', color: 0xffd060, sfx: 'mg', desc: '덩치 큰 칙. 중기관총으로 버티며 쏘아대는 중장 철충.' }), // (original: heavy attacker, medium MG + close-range heavy gun)
    T('rampart', { rig: 'e_Rampart_N', img: 'e_Rampart_N', cr: '아이스 골렘', name: '램파트', cost: 2, rarity: 1, arena: 1, hp: 1090, dmg: 77, rate: 2.5, range: 0.75, hits: 'ground', aim: 'buildings', speed: SPD.slow, radius: 0.65, mass: 14, h: 1.9, fx: 'bullet', color: 0xffa060, sfx: 'gun', desc: '진압 방패와 10mm 기관단총의 AGS 방벽. 건물만 향해 걸으며 적의 공격을 대신 받아 끌고 다니는 값싼 방패입니다.' }), // (original: CT66 Rampart, riot shield + 10mm SMG)
    // ── S ──
    T('predator', { rig: 'e_Predator_N', img: 'e_Predator_N', cr: '왕자', name: '프레데터', cost: 5, rarity: 2, hp: 1752, dmg: 357, rate: 1.4, range: 1.6, hits: 'ground', chargeRun: 3, jump: true, speed: SPD.mid, radius: 0.5, mass: 5, h: 1.6, fx: 'claw', color: 0xff4040, sfx: 'slash', desc: '사냥감을 향해 내달리는 사냥꾼. 일정 거리를 달리면 속도가 2배가 되고 첫 일격이 2배 피해입니다.' }),
    T('gigantes', { rig: 'e_Gigantes_N', img: 'e_Gigantes_N', cr: '자이언트', name: '기간테스', cost: 5, rarity: 2, hp: 3724, dmg: 231, rate: 1.5, range: 1.2, hits: 'ground', aim: 'buildings', speed: SPD.slow, radius: 0.75, mass: 18, h: 2.4, fx: 'claw', color: 0xffa060, sfx: 'cannon', desc: '건물만 노리는 거대 병기. 방패를 앞세운 로켓 배쉬로 들이받습니다.' }),
    T('doomeater', { rig: 'e_DoomEater_N', img: 'e_DoomEater_N', cr: '다크 프린스', selfSplash: true, hitFx: 'Executioner_skill1_Hit', name: '둠 이터', cost: 4, rarity: 2, arena: 1, hp: 1315, dmg: 226, rate: 1.3, range: 1.2, splash: 1.1, chargeRun: 3.5, jump: true, hits: 'ground', speed: SPD.mid, radius: 0.55, mass: 6, h: 1.8, fx: 'slash', color: 0xff5a2a, sfx: 'energy', desc: '달려들며 에너지를 모아, 돌진 뒤 첫 일격을 2배로 터뜨려 주변을 휩쓰는 연결체 철충.' }), // (original: connected-class boss, stored-energy blast)
    T('destroyer', { rig: 'e_Destroyer_N', img: 'e_Destroyer_N', cr: '엑스큐셔너', name: '디스트로이어', cost: 5, rarity: 2, arena: 2, splash: 1.0, hp: 1168, dmg: 308, rate: 2.4, range: 4.5, pierce: 0.6, speed: SPD.mid, h: 1.7, fx: 'laser', color: 0xff6a4a, sfx: 'laserBig', desc: '대구경 집속 입자포. 일직선 위의 적을 모두 꿰뚫습니다.' }), // (original: heavy artillery, large-calibre cluster particle cannon)
    T('fortress', { rig: 'e_Fortress_N', img: 'e_Fortress_N', cr: '로얄 자이언트', name: '포트리스', cost: 6, rarity: 2, arena: 2, hp: 2796, dmg: 279, rate: 1.7, range: 5.0, hits: 'ground', aim: 'buildings', speed: SPD.slow, radius: 0.7, mass: 15, h: 2.3, fx: 'grenade', color: 0xff8050, sfx: 'cannon', desc: '건물만 노리는 이동 포대. 멀리서 탑을 포격하며 버팁니다.' }),
    // ── SS (champions) ──
    T('blackknight', { rig: 'e_BlackKnight_N', img: 'e_BlackKnight_N', cr: '수도승', name: '사이클롭스', cost: 5, rarity: 3, arena: 2, hp: 1818, dmg: 127, rate: 0.8, range: 1.2, hits: 'ground', speed: SPD.mid, radius: 0.6, mass: 9, h: 2.0, fx: 'slash', color: 0xb070ff, sfx: 'slash', desc: '빛이 들지 않는 성역의 단독 행동 개체. 칼날 팔로 한 대상을 빠르게 연달아 척살합니다.',
      skill: { name: '조직 재생', cost: 2, cd: 12, kind: 'shield', dur: 5, k: 0.35, color: 0xb070ff, desc: '5초간 조직을 재생하며 받는 피해 65% 감소.' } }), // (original MP_BlackKnight is the S-class 사이클롭스: active 1 척살, a range-1 melee strike over a 9-tile area; active 2 조직 재생, self regeneration)
    T('juggernaut', { rig: 'e_Juggernaut_N', img: 'e_Juggernaut_N', cr: '페카', name: '저거너트', cost: 7, rarity: 3, arena: 2, hp: 3431, dmg: 744, rate: 1.8, range: 1.2, hits: 'ground', speed: SPD.slow, radius: 0.75, mass: 16, h: 2.3, fx: 'claw', color: 0xff8040, sfx: 'expM', desc: '압도적인 중장갑 근접 병기. 스턴 펀치로 때려눕힙니다.',
      skill: { name: '대지 분쇄', cost: 3, cd: 13, kind: 'nova', radius: 2.8, dmg: 560, stun: 0.8, color: 0xff8040, desc: '주변 적 모두에게 큰 피해 + 0.8초 기절.' } }),
    T('executioner', { rig: 'e_Executioner_EW', img: 'e_Executioner_EW', cr: '밴디트', name: '익스큐셔너', cost: 3, rarity: 3, arena: 3, hp: 825, dmg: 176, rate: 1.0, range: 0.75, hits: 'ground', speed: SPD.fast, radius: 0.65, mass: 12, h: 2.3, fx: 'slash', color: 0xff3050, sfx: 'slash', desc: '처형인. 값싸고 빠른 처형인. 쌍검으로 한 대상씩 베고, 단두대 돌진으로 뒷줄까지 파고듭니다.',
      skill: { name: '단두대', cost: 2, cd: 11, kind: 'dash', dist: 4.5, dmg: 850, radius: 1.5, color: 0xff3050, desc: '목표를 향해 돌진하며 경로의 적을 처형합니다.' } }),
    T('goltarion', { rig: 'e_Goltarion_N', img: 'e_Goltarion_N', cr: '마이티 광부', name: '에큐토스', cost: 4, rarity: 3, arena: 3, hp: 2045, dmg: 36, rate: 0.4, range: 1.6, hits: 'ground', splash: 0, ramp: [1, 5, 10], rampAt: [2.25, 4.5], speed: SPD.mid, radius: 0.75, mass: 16, h: 2.5, fx: 'slash', color: 0xff6060, sfx: 'slash', desc: '철충에 잠식된 거병. 거대한 검의 머리베기로 주변을 함께 베어냅니다.', // (original MOB_MP_Goltarion_N '에큐토스': A1 머리베기, A2 검선 지정 - melee range 1)
      skill: { name: '방어막 전개', cost: 2, cd: 14, kind: 'shield', dur: 5, k: 0.2, color: 0xff6060, desc: '5초간 받는 피해 80% 감소.' } }),
    T('emperorchick', { rig: 'e_EmperorChick_N', img: 'e_EmperorChick_N', cr: '해골 킹', name: '칙 엠페러', cost: 4, rarity: 3, arena: 3, hp: 2091, dmg: 186, rate: 1.6, range: 1.2, splash: 1.3, hits: 'ground', speed: SPD.mid, radius: 0.7, mass: 14, h: 2.4, fx: 'bullet', color: 0xffd040, sfx: 'cannon', desc: '칙들의 황제. 중기관포로 주변까지 휩쓸고 부하를 불러냅니다.',
      skill: { name: '황제의 부름', cost: 2, cd: 12, kind: 'summon', card: 'nightchick', n: 4, color: 0xffd040, desc: '나이트 칙 4기를 소환합니다.' } }),
    T('nidhogg', { rig: 'e_Nidhogg_N', img: 'e_Nidhogg_N', cr: '골렘', name: '니드호그', cost: 8, rarity: 3, arena: 4, hp: 4672, dmg: 245, rate: 2.5, aim: 'buildings', range: 0.75, splash: 1.6, slow: 0.3, slowDur: 2, hits: 'ground', speed: SPD.slow, radius: 0.75, mass: 14, h: 2.4, fx: 'flame', color: 0x9aff60, sfx: 'spray', desc: '독극물 합성기 칵테일 메이커로 부식성 독을 퍼뜨리는 AGS. 건물만 노리고 걸어가며, 맞은 적은 둔화.',
      skill: { name: '부식의 숨결', cost: 2, cd: 12, kind: 'barrage', n: 4, radius: 1.8, dmg: 380, slow: 0.4, reach: 6, color: 0x9aff60, desc: '전방에 부식탄 4발, 맞은 적은 둔화.' } }),
  ];

  const SPELLS = [
    S('strike', { cr: '파이어볼', name: '포격 지원', icon: 'strike', cost: 4, rarity: 1, spell: 'fireball', radius: 2.5, dmg: 625, towerK: 0.3, knock: 0.6, color: 0xff7a2a, sfx: 'expB', desc: '지정 지점에 포격. 범위 피해와 넉백 (탑에는 30%).' }),
    S('emp', { cr: '전기 충격', name: 'EMP', icon: 'emp', cost: 2, rarity: 0, spell: 'zap', radius: 2.5, dmg: 175, towerK: 0.3, stun: 0.5, color: 0x7ad8ff, sfx: 'elec', desc: '즉시 전자기 충격. 범위 피해 + 0.5초 기절.' }),
    S('freeze', { cr: '얼음', name: '절대 빙결', icon: 'freeze', cost: 4, rarity: 2, arena: 1, spell: 'freeze', radius: 3, dmg: 105, towerK: 0.3, freeze: 4, color: 0xaef4ff, sfx: 'ice', desc: '범위 안의 적과 탑을 4초간 얼립니다.' }),
    S('napalm', { cr: '지진', name: '화염 지대', icon: 'napalm', cost: 3, rarity: 1, arena: 1, spell: 'zone', radius: 3.5, dmg: 76, dur: 3, slow: 0.5, towerK: 0.65, bldK: 4.5, color: 0xff6a2a, sfx: 'spray', desc: '3초 동안 거세게 타오르는 지대. 초당 피해 + 50% 둔화, 설치한 건물에는 4.5배 피해.' }),
    S('missile', { cr: '로켓', name: '순항 미사일', icon: 'missile', cost: 6, rarity: 2, arena: 2, spell: 'fireball', radius: 2, dmg: 1349, towerK: 0.25, knock: 1, color: 0xffc040, sfx: 'expB', desc: '좁은 범위에 막대한 피해. 사수 처리와 마무리용.' }),
    S('poison', { cr: '독', name: '부식 독가스', icon: 'poison', cost: 4, rarity: 2, arena: 1, spell: 'zone', gas: true, radius: 3.5, dmg: 83, dur: 8, slow: 0.15, towerK: 0.3, color: 0x8aff5a, sfx: 'spray', desc: '8초 동안 독가스가 퍼진 지대. 초당 피해 + 15% 둔화. 오래 머무는 무리를 녹입니다.' }),
    S('clone', { cr: '복제', name: '홀로그램 복제', icon: 'clone', cost: 3, rarity: 2, arena: 2, spell: 'clone', radius: 3, color: 0x5ad8ff, sfx: 'reinforce', desc: '범위 안 아군 유닛마다 체력 1의 복제체를 하나씩 불러냅니다. 영웅은 복제되지 않습니다.' }),
    S('volley', { cr: '화살', name: '탄막 사격', icon: 'volley', cost: 3, rarity: 0, spell: 'volley', radius: 4, dmg: 333, waves: 3, towerK: 0.3, color: 0xffe07a, sfx: 'mg', desc: '넓은 범위에 세 차례 탄막이 쏟아집니다. 체력이 낮은 무리를 쓸어냅니다.' }),
    S('thunder', { cr: '번개', name: '낙뢰 포격', icon: 'thunder', cost: 6, rarity: 2, arena: 2, spell: 'lightning', radius: 3.5, dmg: 960, n: 3, stun: 0.5, towerK: 0.3, color: 0xbfe0ff, sfx: 'elec', desc: '범위 안에서 체력이 가장 높은 대상 셋에 낙뢰. 맞은 대상은 잠시 기절합니다.' }),
    S('repair', { cr: '치유', name: '긴급 수리', icon: 'repair', cost: 1, rarity: 1, spell: 'heal', radius: 3, heal: 400, color: 0x7dffb0, sfx: 'reinforce', desc: '범위 안 아군 유닛의 체력을 400 회복합니다.' }),
    S('gravity', { cr: '토네이도', name: '중력장', icon: 'gravity', cost: 3, rarity: 2, arena: 1, spell: 'pull', radius: 5.5, dmg: 155, dur: 1.05, towerK: 0.17, color: 0xb48cff, sfx: 'quake', desc: '1초 동안 범위 안 적을 중심으로 끌어당기며 피해. 흩어진 적을 한데 모읍니다.' }),
    S('overclock', { cr: '분노', name: '오버클럭', icon: 'overclock', cost: 2, rarity: 2, arena: 2, spell: 'rage', radius: 3, dur: 6, k: 1.35, color: 0xd65cff, sfx: 'reinforce', desc: '아군의 이동·공격 속도를 6초간 35% 올립니다.' }),
  ];

  // buildings: placed on your half, they stand still and lose health over their lifetime.
  // Defensive ones pull "buildings only" attackers away from your towers; spawners keep producing troops.
  const B = (id, o) => Object.assign({ id, type: 'building', count: 1, arena: 0, r: 0.9 }, o);
  const BUILDINGS = [
    B('turret', { faction: 'orca', cr: '테슬라', name: '그렘린 포탑', icon: 'turret', cost: 4, rarity: 1, hp: 1048, life: 30, dmg: 209, rate: 1.1, range: 5.5, hits: 'all', guard: { rig: 'leprechaun', k: 1.05 }, fx: 'bullet', color: 0xffe08a, sfx: 'mg', desc: '공중·지상을 모두 쏘는 방어 포탑 (30초). 건물만 노리는 적을 끌어당깁니다.' }),
    B('outpost', { faction: 'orca', cr: '고블린 오두막', name: '전진 기지', icon: 'outpost', cost: 5, rarity: 1, arena: 1, hp: 772, life: 29, spawn: { card: 'brownie', every: 10, n: 3 }, guard: { rig: 'brownie', k: 1 }, color: 0x7ad8ff, desc: '29초 동안 10초마다 브라우니 분대(3기)를 출격시킵니다.' }),
    B('barricade', { faction: 'orca', anyFaction: true, name: '방벽', icon: 'barricade', cost: 3, rarity: 0, hp: 1364, life: 40, wall: true, r: 1.15, color: 0x9fd0ff, desc: '튼튼한 방벽 (40초). 건물만 노리는 적을 붙잡고 지상 유닛의 길을 막습니다.' }),
    B('i_turret', { faction: 'iron', cr: '대포', name: '철충 포대', icon: 'turret', cost: 3, rarity: 1, hp: 749, life: 30, dmg: 193, rate: 0.9, range: 5.5, hits: 'ground', guard: { rig: 'e_Phalangites_N', h: 1.4 }, fx: 'bullet', color: 0xffb070, sfx: 'rifle', desc: '지상만 쏘는 값싼 방어 포대 (30초). 건물만 노리는 적을 끌어당깁니다. 공중은 못 맞힙니다.' }),
    B('hatchery', { faction: 'iron', cr: '묘비', name: '부화장', icon: 'outpost', cost: 3, rarity: 1, arena: 1, hp: 482, life: 30, spawn: { card: 'nightchick', every: 6 }, guard: { rig: 'e_NightChick_N', h: 1.1 }, color: 0xffd060, desc: '30초 동안 6초마다 나이트 칙 1기를 부화시키는 값싼 수비용 부화장.' }),
  ];

  ORCA.forEach((c) => { c.faction = 'orca'; });
  IRON.forEach((c) => { c.faction = 'iron'; });
  // faction pace: the orca bioroids fight at the listed (Clash Royale) pace; the iron machines swing slower and much
  // harder, for more damage per second overall (their ramping attacks keep their own rhythm)
  const PACE = { iron: { rate: 1.4, dps: 1 } }; // (same damage per second as the listed stats: equal levels play even)
  [...IRON, ...BUILDINGS].forEach((c) => {
    const p = PACE[c.faction];
    if (!p || !c.dmg || c.ramp) return;
    c.rate = Math.round(c.rate * p.rate * 100) / 100;
    c.dmg = Math.round(c.dmg * p.rate * p.dps);
  });
  // units only a commander's support call brings (never in a deck, the codex or the shop)
  const TOKENS = [
    T('lemonadegamma', { rig: 'lemonadegamma', img: 'c_PECS_LemonadeGamma_N', name: '레모네이드 감마', faction: 'lemonade', token: true, cost: 0, rarity: 2, hp: 2600, dmg: 230, rate: 1.4, range: 1.2, hits: 'ground', splash: 0.8, speed: SPD.mid, radius: 0.6, mass: 12, fx: 'slash', color: 0xffd34d, sfx: 'swing', desc: '레모네이드 지원으로 투입되는 근접 전투원.' }),
    T('rampalion', { rig: 'rampalion', img: 'c_AGS_Rampart_NS1', name: '램파리온', faction: 'cmd', token: true, cost: 0, rarity: 3, k: 0.5, hp: 3400, dmg: 170, rate: 0.9, range: 5, speed: SPD.mid, radius: 0.7, mass: 16, fx: 'bullet', color: 0xffc27a, sfx: 'mg', desc: '사령관의 부름에 강림하는 수호자.',
      skill: { name: '헤븐 앤 헬', cost: 2, cd: 12, kind: 'dash', heavenhell: true, castT: 1.9, dist: 8, dmg: 1150, radius: 1.6, color: 0xffc27a, desc: '전자기 회오리로 적을 묶고 불사자를 내달린 뒤, 빛이 되어 일직선으로 돌진합니다.' } }),
  ];
  const CARDS = [...ORCA, ...IRON, ...BUILDINGS,
    ...SPELLS.map((s) => Object.assign({}, s, { faction: 'orca', anyFaction: true }))]; // (one set of spells for everyone: the iron copies 'i_<id>' are gone, old saves are moved over)

  const FACTIONS = {
    orca: {
      name: '오르카', color: '#3aa8ff', hex: 0x3aa8ff, banner: 'c_3P_Labiata_N',
      king: { rig: 'constantia', k: 1.35, fx: 'snipe', color: 0xff6af0, sfx: 'rifle' },
      princess: { rig: 'nymph', k: 1.25, fx: 'bullet', color: 0x9ff4ff, sfx: 'rifle' },
      deck: ['brownie', 'leprechaun', 'impet', 'raven', 'harpy', 'zero', 'empress', 'strike'],
      emotes: [['c_BR_Brownie_N', '좋아요!'], ['c_3P_Labiata_N', '잘했어요'], ['c_BR_Leprechaun_N', '이런…'], ['c_DS_KunoichiZero_N', '덤벼라!']],
    },
    iron: {
      name: '철충', color: '#ff4a5a', hex: 0xff4a5a, banner: 'e_IronPrince_N',
      king: { rig: 'e_IronPrince_N', h: 2.5, fx: 'holy', color: 0xff5050, sfx: 'energy' },
      princess: { rig: 'e_Fortress_N', h: 2.0, fx: 'bullet', color: 0xffa070, sfx: 'cannon' }, // an artillery walker reads as a gun emplacement (the dark scythe guard read as debris)
      deck: ['nightchick', 'fallen', 'legion', 'phalangites', 'centurion', 'intruder', 'gigantes', 'strike'],
      emotes: [['e_NightChick_N', '삐빅!'], ['e_IronPrince_N', '하찮군'], ['e_Drone_N', '오류 발생'], ['e_BlackKnight_N', '섬멸한다']],
    },
    // the commander (사령관): an opponent that turns up now and then; Brownies on both side towers, the commander on the king tower
    cmd: {
      name: '사령관', color: '#ff9a3a', hex: 0xff9a3a, banner: 'cmd_face', pool: 'orca', foeOnly: true,
      king: { drawn: 'commander', h: 1.7, fx: 'bullet', color: 0xffc27a, sfx: 'rifle' },
      princess: { rig: 'brownie', k: 1.25, fx: 'bullet', color: 0xffe08a, sfx: 'rifle' },
      deck: ['brownie', 'leprechaun', 'impet', 'raven', 'harpy', 'zero', 'empress', 'strike'],
      emotes: [['c_BR_Brownie_N', '사령관님!'], ['cmd_face', '...'], ['c_BR_Brownie_N', '으앗!'], ['c_AGS_Rampart_NS1', '각오해라!']],
    },
    // Lemonade: Alpha on the king tower; Delta (left) and Beta (right) are dagger towers (Clash Royale's Dagger Duchess)
    lemonade: {
      name: '레모네이드', color: '#ffd34d', hex: 0xffd34d, banner: 'c_PECS_LemonadeAlpha_N', pool: 'orca',
      king: { rig: 'lemonadealpha', k: 1.35, fx: 'bullet', color: 0xffe066, sfx: 'rifle' },
      princess: { rig: 'e_LemonadeDelta_N', h: 3.6, dy: -0.7, shadow: 1.1, fx: 'bullet', color: 0xffe066, sfx: 'rifle', dagger: true },
      princessR: { rig: 'lemonadebeta', k: 1.25, fx: 'bullet', color: 0xffe066, sfx: 'rifle', dagger: true, tint: 1.3, clip: 'idle', dy: -0.6 }, // (her attack clip is a long snake lunge off the tower: she throws from her idle pose) // (all in black: lifted a little to read at unit size)
      deck: ['brownie', 'leprechaun', 'impet', 'raven', 'harpy', 'zero', 'empress', 'strike'],
      emotes: [['c_PECS_LemonadeAlpha_N', '좋아요!'], ['c_PECS_LemonadeBeta_N', '잘했어요'], ['e_LemonadeOmega_N', '이런…'], ['c_PECS_LemonadeAlpha_N', '덤벼라!']],
    },
  };

  // trophy road: each arena re-skins the floor, raises the opponent's card level and unlocks cards
  const ARENAS = [
    { name: '훈련 구역', bg: 'assets/bg/arena0.jpg', floor: 'assets/bg/floor0.jpg', floorDim: 0.05, trophy: 0, lvl: 10, home: ['#34424f', '#2f3c48'], away: ['#463a40', '#40353b'], rim: '#151a20', river: '#0d3446', glow: 0x55ddff },
    { name: '폐허 도시', bg: 'assets/bg/arena1.jpg', floor: 'assets/bg/floor1.jpg', deck: ['#a6b4a6', '#c2b096'], trophy: 300, lvl: 10, home: ['#3d4440', '#383f3b'], away: ['#4a4038', '#443a33'], rim: '#1a1c19', river: '#163a2c', glow: 0x7dffb0 },
    { name: '철충 둥지', bg: 'assets/bg/arena2.jpg', floor: 'assets/bg/floor2.jpg', deck: ['#aaa8c4', '#c6a2a8'], trophy: 800, lvl: 11, home: ['#3a3446', '#342f40'], away: ['#55303a', '#4d2a33'], rim: '#1b1218', river: '#3a0f22', glow: 0xff5a8a },
    { name: '오르카 호 갑판', bg: 'assets/bg/arena3.jpg', floor: 'assets/bg/floor3.jpg', deck: ['#a0b8d4', '#bcaab8'], floorDim: 0.42, trophy: 1500, lvl: 11, home: ['#2c3e58', '#283850'], away: ['#4a3a46', '#433440'], rim: '#0d1422', river: '#0b2d55', glow: 0x6ab8ff },
    { name: '최종 결전', bg: 'assets/bg/arena4.jpg', floor: 'assets/bg/floor4.jpg', deck: ['#a8a8b4', '#c4aa8e'], floorDim: 0.26, trophy: 2500, lvl: 12, home: ['#2a2a32', '#26262e'], away: ['#3c2626', '#352222'], rim: '#0a0a0e', river: '#3a2a08', glow: 0xffc040 },
  ];
  const arenaOf = (trophy) => { let a = 0; ARENAS.forEach((r, i) => { if (trophy >= r.trophy) a = i; }); return a; };

  // card levels: every card starts at level 10 (the cards' listed stats), up to 12; +10% HP and damage per level.
  // Upgrades cost card copies and parts (gold)
  const LEVEL = {
    min: 10, max: 12,
    fixed: 10, // every card plays at this level for now (upgrades locked); null lets levels move again
    mult: (lv) => Math.pow(1.1, (lv || 10) - 10),
    copies: { 10: 20, 11: 50 }, // [lv]: copies needed to go from level lv to lv+1
    gold: { 10: 400, 11: 1000 },
  };

  const BAL = {
    W: 18, H: 32,
    river: 1,             // |z| < river is water (ground troops cross on the bridges)
    bridgeX: 5.5, bridgeW: 1.3, // bridge centres and half width
    tower: {
      king: { hp: 5592, dmg: 116, rate: 1.0, range: 7, r: 1.6, z: 13.3 }, // (towers at the cards' own level, as in Clash Royale)
      princess: { hp: 3262, dmg: 116, rate: 0.8, range: 7.5, r: 1.2, x: 5.5, z: 10 },
      // dagger tower (Dagger Duchess): 8 daggers thrown fast, then slow throws while empty; reloads while it has no target
      dagger: { hp: 0.9, dmg: 0.9, ammo: 8, fast: 0.4, slow: 1.6, reload: 0.55 },
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
      { key: 'normal', name: '일반전', desc: '3분 · 마지막 1분 2X 타임' },
      { key: 'rush', name: '에너지 폭주', desc: '처음부터 2X 타임 · 연장전 3X 타임' },
      { key: 'draft', name: '무작위 덱', desc: '양측 모두 해금 카드로 만든 무작위 덱' },
      { key: 'daily', name: '오늘의 작전', desc: '날마다 바뀌는 특수 규칙' },
      { key: 'practice', name: '연습전', desc: '상대 덱을 골라 연습 · 전공/보상 없음' },
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
    cmd: [
      { img: 'cmd_face', name: '사령관', style: 'balanced' },
    ],
    lemonade: [
      { img: 'c_PECS_LemonadeAlpha_N', name: '레모네이드 알파', style: 'balanced' },
      { img: 'c_PECS_LemonadeBeta_N', name: '레모네이드 베타', style: 'aggro' },
      { img: 'e_LemonadeOmega_N', name: '레모네이드 오메가', style: 'control' },
    ],
    orca: [
      { img: 'c_3P_Labiata_N', name: '라비아타 프로토타입', style: 'balanced' },
      { img: 'c_3P_ConstantiaS2_N', name: '콘스탄챠 S2', style: 'control' },
      { img: 'hero_alice', name: '앨리스', style: 'aggro' },
      { img: 'c_DS_Azazel_N', name: '아자젤', style: 'siege' },
    ],
  };

  // supply crates: earned by winning, opened after a short real-time unlock
  // the shop: crates for parts (opened on the spot), master cards for tuna (a master card of a grade is one copy of any card of that grade)
  const SHOP = {
    crates: [{ key: 'normal', price: 120 }, { key: 'rare', price: 350 }, { key: 'epic', price: 900 }],
    masters: [{ r: 0, n: 10, price: 20 }, { r: 1, n: 5, price: 30 }, { r: 2, n: 2, price: 40 }, { r: 3, n: 1, price: 60 }],
    tunaStart: 100, tunaWin: 3, tunaFirstWin: 10,
  };
  const CHESTS = [
    { key: 'normal', name: '보급 상자', time: 30, gold: [40, 70], cards: 3, weight: 70, color: '#8aa0b4' },
    { key: 'rare', name: '정예 보급 상자', time: 120, gold: [110, 170], cards: 5, weight: 24, color: '#38b6ff' },
    { key: 'epic', name: '특급 보급 상자', time: 300, gold: [260, 380], cards: 8, weight: 6, color: '#ffc81e', ss: true },
  ];

  // daily operation: one rule twist per day (index = days since epoch)
  const MUTATORS = [
    { key: 'mirror', name: '거울 작전', desc: '상대가 내 덱과 똑같은 카드로 싸웁니다.', mirror: true },
    { key: 'champs', name: '영웅의 날', desc: '영웅 스킬 에너지 -1, 재사용 시간 40% 단축.', skillCost: -1, skillCd: 0.6 },
    { key: 'swift', name: '전격전', desc: '모든 유닛 이동 속도 +35%, 에너지 회복 +50%.', speed: 1.35, elixir: 1.5 },
    { key: 'titans', name: '거인의 전장', desc: '모든 유닛·건물 체력 +60% (공격력은 그대로). 오래 버티는 쪽이 이깁니다.', hp: 1.6 },
    { key: 'sudden', name: '단기 결전', desc: '경기 시간 90초, 처음부터 2X 타임.', time: 90, rush: true },
    // combined rules
    { key: 'heroblitz', name: '영웅 전격전', desc: '전격전 + 영웅의 날: 이동 속도 +35%, 영웅 스킬 에너지 -1·재사용 40% 단축.', speed: 1.35, skillCost: -1, skillCd: 0.6 },
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
    { k: 'crowns', name: '별 획득', goal: 6, gold: 70 },
    { k: 'three', name: '별 3개 승리', goal: 1, gold: 120 },
    { k: 'skills', name: '영웅 스킬 사용', goal: 5, gold: 70 },
    { k: 'cards', name: '카드 배치', goal: 40, gold: 50 },
    { k: 'kills', name: '적 유닛 처치', goal: 60, gold: 60 },
    { k: 'dmg', name: '누적 피해', goal: 100000, gold: 80 },
    { k: 'rush', name: '에너지 폭주 모드 플레이', goal: 2, gold: 60 },
    { k: 'iron', name: '철충 진영으로 승리', goal: 1, gold: 80 },
    { k: 'orca', name: '오르카 진영으로 승리', goal: 2, gold: 70 },
  ];

  // faction bond: a deck built mostly from one faction strengthens that faction's units (mixing factions trades the bond for freedom)
  const SYNERGY = {
    orca: [null, { name: '오르카 결속', hp: 1.1, dmg: 1, desc: '오르카 유닛 체력 +10%' }, { name: '오르카 결속 II', hp: 1.15, dmg: 1.05, desc: '오르카 유닛 체력 +15% · 공격력 +5%' }],
    iron: [null, { name: '철충 군단', hp: 1, dmg: 1.1, desc: '철충 유닛 공격력 +10%' }, { name: '철충 군단 II', hp: 1.05, dmg: 1.15, desc: '철충 유닛 공격력 +15% · 체력 +5%' }],
  };
  function synergyOf(deck) {
    const n = { orca: 0, iron: 0 };
    deck.forEach((id) => { const c = CARDS.find((x) => x.id === id); if (c) n[c.faction]++; });
    const f = n.orca >= n.iron ? 'orca' : 'iron', tier = n.orca === n.iron ? 0 : n[f] >= 6 ? 2 : n[f] >= 4 ? 1 : 0; // (an even split bonds neither)
    return { faction: f, tier: 0, count: n[f], hp: 1, dmg: 1, name: '', desc: '' }; // (faction bonds were taken out: no deck gets a bonus)
  }

  // emotes: twenty of the original character stickers (the sticker item atlas), one feeling each, the same for every
  // faction (0-3 are the AI's: cheer, praise, oops, taunt)
  const EMOTES = [['st_smile', '좋아요!'], ['st_nice', '잘했어요'], ['st_oops', '이런…'], ['st_taunt', '덤벼라!'],
    ['st_hello', '안녕!'], ['st_love', '사랑해요'], ['st_party', '축하해요!'], ['st_cry', '흑흑…'], ['st_pout', '흥!'], ['st_scream', '으아악!'],
    ['st_shock', '뭐라고!?'], ['st_what', '응?'], ['st_idea', '좋은 생각!'], ['st_blank', '……'], ['st_grumble', '으으…'],
    ['st_thanks', '고마워요'], ['st_smug', '후후…'], ['st_sing', '신난다~'], ['st_dumbfound', '어이없네'], ['st_confident', '맡겨 줘!']];
  // the mailbox: mail sent with a patch (each id once per commander). oldOnly: only for commanders who started before it
  // (a new account already starts with what it brings)
  const MAIL = [
    { id: 'v068_start', date: '2026.10.22', title: '시작 자원 지급', body: '시작 자원이 부품 1000 · 참치 100으로 늘었습니다. 먼저 시작한 지휘관께도 같은 만큼 보내 드립니다.', gold: 1000, tuna: 100, oldOnly: true },
  ];
  // patch notes shown in their own tab (newest first)
  const NOTES = [
    { ver: 'V0.82', date: '2026.10.22', items: ['임시 오픈'] },
  ];
  window.DATA = {
    NOTES, MAIL, EMOTES, SHOP, RARITY, CARDS, FACTIONS, ARENAS, LEVEL, BAL, MISSIONS, ROAD, MUTATORS, mutatorOf, dayIndex, STYLES, COMMANDERS, CHESTS, arenaOf, synergyOf, SYNERGY,
    card: Object.fromEntries(CARDS.concat(TOKENS).map((c) => [c.id, c])),
    byFaction: (f) => CARDS.filter((c) => c.anyFaction || c.faction === ((FACTIONS[f] && FACTIONS[f].pool) || f)), // (spells belong to every faction) // (Lemonade and the commander play from the orca cards)
  };
})();
