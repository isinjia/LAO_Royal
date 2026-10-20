# 유닛 무기 원작 대조표

원작 게임 테이블(`Assets/LastOneTable/LoJson.js.bytes`에서 추출한 `_BattleSim/data` units·skills·skilldesc·loc)의 액티브 스킬 이름과 설명을 카드 공격(`fx`)과 대조한 표입니다. 철충은 원작 테이블에 스킬 설명이 비어 있어 스킬 이름만 적었습니다.

fx 종류: bullet 총탄 · snipe 저격 · missile 미사일 · grenade 유탄/포격 · laser 빔 · lightning 전기 · frost 냉기 · fireball 화염 · holy 에너지 · slash 검 · claw 근접 타격

## 브라우니 분대 (brownie) fx=bullet  ← 'Char_BR_Brownie_N'
  **판정:** 돌격 소총 → bullet 총탄 ✔
  orig name: T-2 브라우니, group SkillGroup_BR_Brownie_N
  A1 견제 사격: 돌격 소총을 발사해 {0} 피해를 줍니다. 2라운드 동안 대상의 적중과 회피를 낮추고 받는 피해를 증가시킵니다.
  A2 조준 사격: 돌격 소총 조준 사격으로 {0} 피해를 줍니다. 목표가 회피 / 방어력 감소 상태인 경우, 피해량이 증가합니다.

## 레프리콘 (leprechaun) fx=bullet  ← 'Char_BR_Leprechaun_N'
  **판정:** 기관총 → bullet 총탄 ✔
  orig name: T-3 레프리콘, group SkillGroup_BR_Leprechaun_N
  A1 경기관총 사격: 기관총을 발사해 {0} 피해를 줍니다. 대상이 회피 / 방어력 감소 상태인 경우, 피해량이 증가하며 각각 중첩되어 적용됩니다.
  A2 경기관총 난사: 기관총을 난사해 목표 범위에 보호 무시의 {0} 피해를 줍니다. 대상이 회피 / 방어력 감소 상태인 경우 피해량이 증가하며 각각 중첩되어 적용됩니다.

## 놈 (gnome) fx=bullet  ← 'Char_BR_Gnome_N'
  **판정:** 사격(원호 사격) + 방벽 → bullet 총탄 ✔
  A1 원호 사격 | 사격으로 {0} 피해를 주고, 2라운드 동안 대상을 표식으로 설정합니다. 대상은 회피가 감소하며 받는 피해가 증가합니다.
  A2 방벽 생성 | 3라운드 동안 행 보호 효과와 방어력 / 효과 저항 증가 효과를 얻고, 자신의 현재 HP%에 비례해 공격자의 방어 관통이 감소합니다. <방벽 생성>의 효과는 중첩되지 않습니다.

## 발키리 (valkyrie) fx=snipe  ← 'Char_BR_Valkyrie_N'
  **판정:** 라이플·정밀 저격 → snipe 저격 ✔
  orig name: T-8W 발키리, group SkillGroup_BR_Valkyrie_N
  A1 교란 사격: 라이플 사격으로 {0} 피해를 줍니다.  대상이 표식 또는 도발 상태인 경우, 각각 피해량이 증가합니다.
  A2 정밀 저격: 정밀 저격으로 {0} 보호 무시 피해를 줍니다.  치명타 시, 피해량이 증가하고 대상의 피해 최소화 관련 '강화 효과'를 해제합니다.

## 임펫 (impet) fx=missile  ← 'Char_BR_Impet_N'
  **판정:** 대 장갑 로켓·열압력탄 → missile 로켓 ✔
  orig name: AA-7 임펫, group SkillGroup_BR_Impet_N
  A1 대 장갑 로켓: 대 장갑 로켓을 발사해 {0} 피해를 줍니다. 적중 시, 2라운드 동안 대상의 방어력을 감소시킵니다.
  A2 MK08. 열압력탄: 열압력탄을 발사해 대상에게 {0} 피해를 줍니다. 치명타 시, 피해량이 증가합니다. 또한 대상이 방어력 / 회피 감소 상태인 경우 각각 피해량이 증가합니다.

## 레이븐 (raven) fx=grenade  ← 'Char_BR_Raven_N'
  **판정:** 디스크 봄(폭탄) → grenade 투척 폭발 ✔
  orig name: AO-2 레이븐, group SkillGroup_BR_Raven_N
  A1 디스크 봄: 디스크 봄으로 {0} 보호 무시 피해를 주고, 대상의 방어력을 감소시킵니다. 적중 대상이 경장/중장형인 경우, 대상의 방어력 강화 효과를 해제합니다. 치명타 시, 대상의 보호 효과를 해제합니다.
  A2 표적 스캔: 대상에게 {0} 보호 무시 피해를 주고, 2라운드 동안 표식 / 받는 피해 증가 상태로 만듭니다.  치명타 시, 회피 강화 / 피해 감소 효과를 해제합니다.  스킬 레벨 당 +30%의 적중 보정이 적용됩니다.

## 하르페 (harpy) fx=missile  ← 'Char_BR_Harpy_N'
  **판정:** NARAAK 미사일 → missile ✔
  orig name: P-22 하르페이아, group SkillGroup_BR_Harpy_N
  A1 NARAAK 미사일: 미사일을 발사하여 지정 범위에 {0} 피해를 줍니다. 적중 대상이 표식 / 이동 불가 상태인 경우, 피해량이 증가합니다. 적중 여부에 관계 없이 2라운드 동안 대상의 회피를 감소시킵니다.
  A2 풀 버스트: 전탄발사를 통해 단일 대상에게 {0} 보호 무시 피해를 줍니다.  치명타 시, 피해량이 증가합니다. 적중 시, 2라운드 동안 대상을 표식 / 이동 불가 상태로 만듭니다. 스킬 레벨 당 +9%의 적중 보정이 적용됩니다.

## 밴시 (banshee) fx=bullet  ← 'Char_BR_Banshee_N'
  **판정:** 기관포·급강하 폭격 → bullet 기관포 ✔
  orig name: A-87 밴시, group SkillGroup_BR_Banshee_N
  A1 기관포 소사: 기관포를 발사해 지정 범위에 {0} 피해를 줍니다. 대상이 표식 / 이동 불가 /회피 감소 디버프를 받고있으면 피해량이 증가합니다.
  A2 급강하 폭격: 급강하 폭격으로 지정 대상에게 {0} 보호 무시 피해를 줍니다. 대상이 표식 / 이동 불가 / 회피 감소 디버프를 받고있으면 피해량이 증가합니다.

## 실피드 (sylphid) fx=bullet  ← 'Char_BR_Sylphid_N'
  **판정:** 60형 LMG → bullet 총탄 ✔
  orig name: P-18 실피드, group SkillGroup_BR_Sylphid_N
  A1 60형 LMG: 머신건으로 {0} 피해를 주고, 적중 여부와 상관없이 2라운드 동안 대상의 회피를 감소시킵니다. 대상이 기동형인 경우, 회피 감소 효과가 2배로 적용됩니다. 대상이 표식 / 이동 불가/ 회피 감소 디버프 상태면 피해량이 증가합니다. 스쿼드 내에 [A-87 밴시]가 있다면 [기관포 소사] 협동 공격을 유도합니다.
  A2 열 추적 로크 미사일: 공대공 미사일을 발사해 {0} 피해를 줍니다. 대상이 기동형이거나 치명타 시, 피해량이 증가합니다. 스킬 레벨 당 +10%의 적중 보정이 적용됩니다. 스쿼드 내에 [A-87 밴시]가 있다면 [급강하 폭격] 협동 공격을 유도합니다.

## 운디네 (undine) fx=bullet  ← 'Char_BR_Undine_N'
  **판정:** 2연장 리볼버 캐논 → bullet 기관포탄 ✔
  orig name: P-3M 운디네, group SkillGroup_BR_Undine_N
  A1 2연장 리볼버 캐논: 리볼버 캐논으로 단일 대상에게 {0} 피해를 주고, 2라운드 동안 대상을 도발하며 적중 / 회피를 감소시킵니다. 치명타 시, 피해량이 증가합니다. 적중 시, 스킬 위력이 최대 2회까지 증가합니다.
  A2 F.F 미사일: 날치 미사일로 {0} 피해를 줍니다. 대상이 표식 또는 도발 상태면 피해량이 증가합니다. <AG-2C 세이렌 : 포격 지휘> 또는 <MH-4 테티스 : 전술 공중중계> 효과가 적용된 상태인 경우, 공격 대상의 받는 피해 감소 효과를 해제합니다.

## 님프 (nymph) fx=bullet  ← 'Char_BR_Nymph_N'
  **판정:** 기관총 → bullet 총탄 ✔
  orig name: T-10 님프, group SkillGroup_BR_Nymph_N
  A1 집속 사격: 기관총을 발사해 단일 대상에게 {0} 피해를 줍니다.  대상이 표식 / 방어력 감소 / 회피 감소 상태인 경우, 각각 피해량이 증가합니다.
  A2 제압 난사: 기관총을 난사해 지정 범위에 {0} 보호 무시 피해를 줍니다.  적중 여부에 관계 없이, 제압 사격을 통해 2라운드 동안 대상의 적중 / 회피를 감소시킵니다. 대상이 받는 피해 증가 또는 도발 상태인 경우, 피해량이 증가합니다.

## 쿠노이치 제로 (zero) fx=slash  ← 'Char_DS_KunoichiZero_N'
  **판정:** 은밀 접근 일격·뇌신 일섬 → slash 근접 참격 ✔
  orig name: 쿠노이치 제로, group SkillGroup_DS_KunoichiZero_N
  A1 은밀: 적에게 은밀하게 접근하여 {0} 전기 피해를 줍니다. 중장형 적에게 추가 피해를 입힙니다. 치명타 시, 피해량이 증가합니다.
  A2 뇌신 일섬: 지정 범위에 {0} 보호 무시 전기 피해를 주고, 대상의 행동력 / 회피 / 전기 속성 저항을 감소시킵니다.  대상이 화염/냉기 속성 저항 감소 상태일 경우, 피해량이 증가합니다.

## 테티스 (thetis) fx=bullet  ← 'Char_BR_Thetis_N'
  **판정:** 기관총 난사 → bullet 총탄 ✔
  orig name: MH-4 테티스, group SkillGroup_BR_Thetis_N
  A1 사격은 자신있지롱-: 기관총을 난사해 지정 범위에 {0} 보호 무시 피해를 줍니다. 적중 대상의 AP를 감소시키며, 2라운드 동안 회피 / 적중을 낮춥니다. <H.P.E : 보조> 활성화 시, 각 감소 효과가 2배로 적용됩니다. <H.P.E : 무장> 활성화 상태로 치명타 시, 피해량이 증가하며 피해 최소화 효과를 해제합니다. 해당 스킬은 -30%의 적중 보정이 적용됩니다.
  A2 내가 주는 선물이야!: 지정 대상에게 미사일과 연막탄을 발사해 {0} 피해를 주고, 2라운드 동안 표식 / 받는 피해 증가 / 적중 감소 상태로 만듭니다. 각 효과는 중첩 가능합니다. <H.P.E : 보조> 활성화 시, 받는 피해 증가 / 적중 감소 효과가 2배로 적용되며 적중 강화 효과를 해제합니다. <H.P.E : 무장> 활성화 상태면 피해량이 증가합니다.

## 머큐리 (mercury) fx=bullet  ← 'Char_ST_Mercury_N'
  **판정:** MAV 사출 → bullet 드론 사격 ✔
  orig name: 프랭스터 머큐리, group SkillGroup_ST_Mercury_N
  A1 아르고스의 눈: 지정 범위의 적에게 MAV를 사출하여 {0} 보호 무시 피해를 주고, 적중 여부와 관계없이 대상의 회피 강화 효과를 해제합니다. 적중 시, 2라운드 동안 대상의 적중 / 회피가 감소합니다. 적중 대상에게 <콧대 꺾기> 효과가 적용중인 경우, 추가로 받는 피해 감소 효과를 해제합니다.
  A2 최상의 시간: 모든 아군에게 MAV를 사출하여 대상의 AP를 증가시키고 해로운 효과를 해제합니다. 또한 2라운드 동안 대상의 방어 관통 / 회피 비례 스킬 위력이 증가합니다. 대상이 자신을 제외한 <스트라이커즈> 부대원의 패시브 스킬 효과를 받는 상태인 경우, 상기 효과 수치가 50% 증폭됩니다.

## 레오나 (leona) fx=bullet  ← 'Char_BR_Leona_N'
  **판정:** 권총 → bullet 총탄 ✔
  orig name: 철혈의 레오나, group SkillGroup_BR_Leona_N
  A1 공격 목표 지정: 권총을 발사해 {0} 피해를 주고, 적중 여부에 관계 없이 회피 관련 '강화 효과'를 해제합니다. 적중 시, 2라운드 동안 대상에게 표식을 부여하고 받는 피해를 증가시킵니다. (중첩 불가)
  A2 돌격 명령: 지정한 아군의 현재 AP를 변경시키며, 해로운 효과를 해제합니다.  현재 활성화된 자신의 <지휘> 스킬에 따라, 2라운드 동안 해당 <지휘> 효과를 추가로 부여합니다. 스킬 레벨에 따라 소모 AP가 감소합니다.

## 아자젤 (azazel) fx=holy  ← 'Char_DS_Azazel_N'
  **판정:** 심판(광역 성광) → holy 에너지 ✔
  orig name: 아자젤, group SkillGroup_DS_Azazel_N
  A1 심판: 지정 범위에 {0} 피해를 주고, 2라운드 동안 대상에게 표식 / 받는 피해 증가 / 공격력 / 치명타 감소 효과를 줍니다.
  A2 수호 천사: 2라운드 동안 주변 아군에게 방어막을 부여하며, 공격력 / 방어력 / 적중 / 회피를 증가시킵니다. 스킬 레벨 10에서 범위가 증가합니다.

## 피닉스 (phoenix) fx=grenade  ← 'Char_BR_Phoenix_N'
  **판정:** 정밀 포격·포격 난사 → grenade 포격 ✔
  orig name: GS-130 피닉스, group SkillGroup_BR_Phoenix_N
  A1 정밀 포격: 정밀 포격으로 {0} 보호 무시 피해를 줍니다. 대상이 표식 / 이동 불가 상태면 피해량이 증가합니다. <지상 제압 포격> 상태일 시, 대상에게 AP를 감소시키고, 2라운드 동안 받는 피해 증가를 증가시킵니다.
  A2 포격 난사: 포격을 난사해 지정 범위에 {0} 보호 무시 피해를 줍니다. 대상이 이동 불가 / 회피 감소 상태면 피해량이 증가합니다. 각 피해량 증가 효과는 중첩됩니다. <지상 제압 포격> 상태일 시, 목표 범위 안의 적에게 AP를 감소시키고, 2라운드 동안 받는 피해 증가를 증가시킵니다.

## 헬라 (hela) fx=holy  ← 'Char_BR_Hela_N'
  **판정:** 나노 입자 신호 증폭 → holy 에너지 ✔
  orig name: 헬라, group SkillGroup_BR_Hela_N
  A1 강령: 나노 입자-신호 증폭으로 폐기 부품을 형상화하여 대상을 붙잡고 {0} 보호 무시 피해를 줍니다. 적중 시, 3라운드 동안 대상의 행동력을 감소시키고 자신의 행동력이 증가합니다. 자신의 <손톱> 중첩 수에 따라 효과가 증폭됩니다. 치명타 시, 대상의 모든 광역 피해 분산 효과를 해제합니다. 
  A2 나노 입자 증폭: 폐기 처리된 부품을 재활용하여 대상 아군의 방호 능력을 강화합니다. 효과는 헬라가 생존한 동안 유지됩니다. 라운드 개시 시, 대상은 무거운 부품으로 인해 모든 회피 증감 효과가 해제되지만, 방어력이 증가하고 방어력 비례 치명타 저항이 증가합니다. 이미 <나노 입자 증폭> 상태인 대상으로 재사용 시, 3라운드 동안 강화 해제 저항 효과를 부여합니다. <나노 입자 증폭>에 의한 지속 효과를 가진

## 엠프레스 (empress) fx=frost  ← 'Char_PECS_Empress_N'
  **판정:** 아이스 에이지(냉기 범위) → frost 냉기 ✔
  A1 아이스 에이지 | 지정 범위에 {0} 냉기 속성 피해를 주고, 2라운드 동안 적중 대상의 냉기 저항과 행동력을 감소시킵니다. 대상이 <침수> 상태일 경우, 이동 불가 상태로 만들고 받는 피해가 증가하는 <빙결> 상태를 2라운드 동안 부여합니다.
  A2 펭귄 서프라이즈! | 단일 대상에게 {0} 냉기 속성 피해를 줍니다. 치명타 시, 피해량이 증가합니다.  대상이 <침수> 상태일 경우, 행동 불가 상태로 만들고 받는 피해가 증가하는 <빙결> 상태를 2라운드 동안 부여합니다.

## 슬레이프니르 (sleipnir) fx=laser  ← 'Char_BR_Sleipnir_N'
  **판정:** 레이저 빔 사격 → laser 빔 ✔
  orig name: P-49 슬레이프니르, group SkillGroup_BR_Sleipnir_N
  A1 레이저 빔 사격: 빔 사격으로 대상에게 {0} 피해를 줍니다.  적중 시, 2라운드 동안 대상을 도발하며 적중 / 치명타 / 행동력을 감소시킵니다. (중첩 불가) 스쿼드 내 <P-22 하르페이아>가 있을 경우, [풀 버스트] 스킬 협동 공격을 유도합니다. 
  A2 한계돌파: 목표 지점에 돌진해 {0} 보호 무시 피해를 주고 반격 효과를 해제합니다. 대상의 방어력을 일정 비율 무시합니다. 적중 시, 2라운드 동안 대상의 적중을 감소시키고 표식 / 이동 불가 상태로 만듭니다. 공격 시, 자신의 회피에 비례하여 스킬 위력이 증가합니다.

## 라비아타 (labiata) fx=slash  ← 'Char_3P_Labiata_N'
  **판정:** 대검 → slash 검 ✔
  orig name: 라비아타 프로토타입, group SkillGroup_3P_Labiata_N
  A1 백화난만: 대검을 휘둘러 지정 범위에 {0} 피해를 줍니다.  적중 시, <플라즈마> 중첩 수에 비례하여 피해량이 증가합니다.
  A2 백화요란: 대검으로 강하게 내리쳐 지정 범위에 {0} 보호 무시 피해를 줍니다.  적중 시, <플라즈마> 중첩 수에 비례하여 피해량이 증가합니다. 치명타 시 <플라즈마> 중첩이 3 이상인 경우, 대상의 강화 효과를 해제합니다. 적 처치 시, <플라즈마> 중첩이 제한 수와 관계 없이 1 증가합니다.

## 티타니아 (titania) fx=frost  ← 'Char_3P_Titania_N'
  **판정:** 냉기 공격·서리 폭풍 → frost 냉기 ✔
  orig name: 티타니아 프로스트, group SkillGroup_3P_Titania_N
  A1 차가운 고통: 단일 대상에게 {0} 냉기 피해를 입힙니다.  적중 시, 2라운드 동안 대상의 냉기 저항을 감소시키고 지속 냉기 피해를 줍니다. 적중 대상에게 <천년서리> 효과가 4중첩 이상 누적된 경우, 대상의 강화 효과를 해제합니다.
  A2 서리 폭풍: 매서운 서리 폭풍으로 지정 범위에 {0} 보호 무시 냉기 피해를 입힙니다. 적중 시, 3라운드 동안 대상의 행동력이 감소합니다. 해당 효과는 <천년서리> 효과로 취급합니다. 치명타 시, 피해량이 증가합니다. 스킬 사용 후, 2라운드 동안 자신의 행동력이 감소합니다.

## 티아멧 (tiamat) fx=slash  ← 'Char_ST_Tiamat_N'
  **판정:** 대 장갑 블레이드 → slash 검 ✔
  orig name: X-00 티아멧, group SkillGroup_ST_Tiamat_N
  A1 대 장갑 블레이드: 대 장갑 블레이드로 단일 대상에게 {0} 피해를 줍니다. 자신의 회피에 비례하여 스킬 위력이 증가합니다. 적중 시, 2라운드 동안 대상의 방어력이 감소합니다. 치명타 시, 피해량이 증가합니다. 
  A2 풀 웨폰 어썰트: 한계를 넘은 움직임으로 단일 대상에게 {0} 피해를 줍니다. 자신의 현재 HP가 낮을수록 피해량이 증가합니다. 적중 시, 자신의 대 중장형 피해량이 증가하고 방어막 / 피해 감소 무시 효과를 획득합니다. 치명타 시, 피해량이 증가합니다. 스킬 사용 시, 자신의 공격력에 비례한 고정 피해를 입습니다.

## 콘스탄챠 S2 (constantia) fx=snipe  ← 'Char_3P_ConstantiaS2_N'
  **판정:** 라이플 → snipe 라이플 ✔ (V0.26 수정: 산탄총→라이플)
  orig name: 콘스탄챠 S2, group SkillGroup_3P_ConstantiaS2_N
  A1 라이플 사격: 라이플을 발사해 단일 대상에게 {0} 피해를 줍니다.  적중 시, 2라운드 동안 대상을 받는 피해 증가 상태로 만듭니다. 치명타 시, 해당 라운드 동안 대상의 대 경장형 피해량을 감소시킵니다. (중첩 불가)
  A2 발목 잡기: 보리와 함께 단일 대상에게 {0} 피해를 줍니다. 적중 시, 2라운드 동안 대상을 표식 / 이동 불가 / 행동력 감소 상태로 만듭니다. (중첩 불가) 치명타 시, 대상의 반격 효과를 해제합니다.

## 파프니르 (fafnir) fx=lightning  ← 'Char_BR_Fafnir_N'
  **판정:** 전기 연속 공격·뇌정벽력 → lightning 전기 ✔
  orig name: 파프니르, group SkillGroup_BR_Fafnir_N
  A1 흐로티: 연속 공격으로 단일 대상에게 {0} 전기 피해를 줍니다. 대상의 HP가 낮을 수록 피해량이 증가합니다. 적중 시, 2라운드 동안 대상을 <회로 과열> 상태로 만듭니다.
  A2 뇌정벽력: 우레와 함께 강하하며 지정 범위에 {0} 전기 피해를 줍니다. 목표 지점 주변은 피해량이 75% 감소합니다. 적중 대상과 인접한 적 수에 따라 피해량이 증가합니다. 적중 대상과 인접한 적 수가 2 이상인 경우, 강화 효과를 해제합니다.

## 라미엘 (ramiel) fx=fireball  ← 'Char_DS_Ramiel_N'
  **판정:** 화염 속성(원죄·억겁의 성화) → fireball 화염 ✔
  orig name: 라미엘, group SkillGroup_DS_Ramiel_N
  A1 원죄: 단일 대상에게 {0} 보호 무시 화염 속성 피해를 입힙니다. 자신이 <원죄의 굴레>상태가 아닐 경우, 추가 화염 피해를 입히고 자신이 <원죄의 굴레>상태일 경우, 대상의 방어막 / 피해 감소 효과를 무시하며 높은 추가 화염 피해를 입힙니다. 
  A2 억겁의 성화: 범위 내 대상에게 {0} 보호 무시 화염 피해를 입힙니다. 자신이 <원죄의 굴레>상태가 아닐 경우, 1라운드 동안 지속 화염 피해를 입히고 자신이 <원죄의 굴레>상태일 경우, 대상의 방어막 / 피해 감소 효과를 무시하며 3라운드 동안 높은 지속 화염 피해를 입힙니다. 스킬 사용 후, 2라운드 동안 해제 불가의 스킬 사용 불가 상태가 됩니다.

## 나이트 칙 무리 (nightchick) fx=bullet  ← 'MOB_MP_NightChick_N'
  **판정:** 머신건 → bullet 총탄 ✔
  orig name: 나이트 칙, group SkillGroup_MP_NightChick_N
  A1 머신건 견제 사격
  A2 머신건 연사

## 드론 편대 (drone) fx=missile  ← 'MOB_MP_Drone_TU2'
  **판정:** 충격파 미사일 → missile ✔
  orig name: 경비용 드론, group SkillGroup_MP_Drone_TU2
  A1 충격파 미사일
  A2 정밀 스캔

## 레기온 (legion) fx=bullet  ← 'MOB_MP_Legion_N'
  **판정:** GAU 미니건 + 점착탄 → bullet 총탄 + 둔화 ✔
  orig name: 레기온, group SkillGroup_MP_Legion_N
  A1 GAU 미니건
  A2 점착탄

## 팔랑기테스 (phalangites) fx=bullet  ← 'MOB_MP_Phalangites_N'
  **판정:** 머신건 속사 → bullet 총탄 ✔
  orig name: 팔랑스, group SkillGroup_MP_Phalangites_N
  A1 머신건 속사
  A2 대열 방어

## 퍼프헤드 (pupphead) fx=lightning  ← 'MOB_MP_PuppHead_TU2'
  **판정:** 테이저·체포 사슬 → lightning 전기 충격 + 기절 ✔
  orig name: 경비용 펍 헤드, group SkillGroup_MP_PuppHead_TU2
  A1 테이저 발사
  A2 체포 사슬

## 센츄리온 (centurion) fx=grenade  ← 'MOB_MP_Centurion_N'
  **판정:** XM 유탄 발사기 → grenade 유탄 ✔ (V0.26 수정: 미사일→유탄)
  orig name: 센츄리온, group SkillGroup_MP_Centurion_N
  A1 XM 유탄 발사기
  A2 일제 공격 개시

## 인트루더 (intruder) fx=missile  ← 'MOB_MP_Intruder_N'
  **판정:** 재밍 미사일 → missile ✔ (V0.26 수정: 에너지→미사일)
  orig name: 인트루더, group SkillGroup_MP_Intruder_N
  A1 재밍 미사일
  A2 요격 준비

## 폴른 (fallen) fx=bullet  ← 'MOB_MP_Fallen_TU2'
  **판정:** 머신건 사격 → bullet 총탄 ✔
  orig name: 경비용 폴른, group SkillGroup_MP_Fallen_TU2
  A1 머신건 사격
  A2 대 장갑 진동탄

## 하베스터 (harvester) fx=claw  ← 'MOB_MP_Harvester_N'
  **판정:** 폐기물 분쇄·수거(집게) → claw 근접 타격 ✔
  orig name: 하베스터, group SkillGroup_MP_Harvester_N
  A1 폐기물 분쇄
  A2 폐기물 수거

## 빅 칙 (bigchick) fx=bullet  ← 'MOB_MP_BigChick_N'
  **판정:** 중 기관총 → bullet 총탄 ✔
  orig name: 빅 칙, group SkillGroup_MP_BigChick_N
  A1 중 기관총 사격
  A2 영거리 중 기관총

## 램파트 (rampart) fx=bullet  ← 'MOB_MP_Rampart_TU2'
  **판정:** 목표 견제(기관단총)·목표 호위(방패) → bullet 총탄 ✔
  orig name: 경비용 램파트, group SkillGroup_MP_Rampart_TU2
  A1 목표 견제
  A2 목표 호위

## 프레데터 (predator) fx=claw  ← 'MOB_MP_Predator_B0208'
  **판정:** 후려치기 → claw 근접 타격 ✔
  orig name: 프레데터, group SkillGroup_MP_Predator_B0208
  A1 후려치기
  A2 부식 용액

## 기간테스 (gigantes) fx=claw  ← 'MOB_MP_Gigantes_TU2'
  **판정:** 로켓 배쉬·실드 차지(방패 돌격, 근접) → claw 근접 타격 ✔
  orig name: 양산형 기간테스, group SkillGroup_MP_Gigantes_TU2
  A1 로켓 배쉬
  A2 실드 차지

## 둠 이터 (doomeater) fx=holy  ← 'MOB_MP_DoomEater_N_EW2'
  **판정:** 에너지 추출·죽음의 에너지 → holy 에너지 ✔
  orig name: 둠 이터, group SkillGroup_MP_DoomEater_N_EW2
  A1 에너지 추출
  A2 죽음의 에너지

## 디스트로이어 (destroyer) fx=laser  ← 'MOB_MP_Destroyer_N'
  **판정:** 대구경 집속 입자포 → laser 관통 빔 ✔
  orig name: 디스트로이어, group SkillGroup_MP_Destroyer_N
  A1 대구경 집속 입자포
  A2 에너지 충전 개시

## 포트리스 (fortress) fx=grenade  ← 'MOB_MP_Fortress_N'
  **판정:** 엄호 사격·목표물 처리(포대) → grenade 포격 ✔
  orig name: 양산형 포트리스, group SkillGroup_MP_Fortress_N
  A1 엄호 사격
  A2 목표물 처리

## 사이클롭스 (blackknight) fx=slash  ← 'MOB_MP_BlackKnight_N'
  **판정:** 척살(근접, 사거리 1, 이펙트 검 텍스처) → slash 검 ✔
  orig name: 사이클롭스, group SkillGroup_MP_BlackKnight_N
  A1 척살
  A2 조직 재생

## 저거너트 (juggernaut) fx=claw  ← 'MOB_MP_Juggernaut_N'
  **판정:** 스턴 펀치·몸통 박치기 → claw 근접 타격 ✔
  orig name: 저거너트, group SkillGroup_MP_Juggernaut_N
  A1 스턴 펀치
  A2 몸통 박치기

## 엑스큐셔너 (executioner) fx=slash  ← 'MOB_MP_Executioner_EW'
  **판정:** 처형 개시·학살(쌍검) → slash 검 ✔
  orig name: 익스큐셔너, group SkillGroup_MP_Executioner_EW
  A1 처형 개시
  A2 학살

## 에큐토스 (goltarion) fx=slash  ← 'MOB_MP_Goltarion_N'
  **판정:** 머리베기·검선 지정(사거리 1) → slash 검 ✔ (V0.26 수정: 빔→검, 이름 에큐토스)
  orig name: 에큐토스, group SkillGroup_MP_Goltarion_N
  A1 머리베기
  A2 검선 지정

## 엠페러 칙 (emperorchick) fx=bullet  ← 'MOB_MP_EmperorChick_N'
  **판정:** 칙 머신캐논 → bullet 기관포 ✔
  orig name: 칙 엠페러, group SkillGroup_MP_EmperorChick_N
  A1 칙 머신캐논
  A2 칙 파이널 어택

## 니드호그 (nidhogg) fx=grenade  ← 'MOB_MP_Nidhogg_N'
  **판정:** 파멸의 폭발 → grenade 폭발 ✔
  orig name: 니드호그, group SkillGroup_MP_Nidhogg_N
  A1 파멸의 폭발
  A2 파멸의 징조
