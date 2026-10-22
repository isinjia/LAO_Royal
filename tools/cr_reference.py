"""Clash Royale reference stats at one level, taken from the game's own data files.

Source: RoyaleAPI cr-api-data (the live client's csv tables as json, last updated 2023-10-18)
  https://royaleapi.github.io/cr-api-data/json/cards_stats.json
Writes tools/cr_reference.json: for every card of this game, the Clash Royale card it is modelled on and that card's
stats at level 10 (the level every card here plays at), plus the crown towers at the same level.

  python tools/cr_reference.py [path/to/cards_stats.json]   (downloads the file when no path is given)
"""
import json
import os
import sys
import urllib.request

URL = "https://royaleapi.github.io/cr-api-data/json/cards_stats.json"
LEVEL = 10
START = {"Common": 1, "Rare": 3, "Epic": 6, "Legendary": 9, "Champion": 11}  # the level each rarity's tables begin at

# this game's card -> the Clash Royale card (its troop / building / spell name in the tables)
TROOPS = {
    # orca
    "brownie": "SpearGoblins", "leprechaun": "BlowdartGoblin", "gnome": "Musketeer", "valkyrie": "Princess",
    "impet": "MegaMinion", "raven": "BabyDragon", "harpy": "ElectroDragon", "banshee": "Minions", "sylphid": "Bats",
    "undine": "DartBarrell", "nymph": "Firecracker", "zero": "MiniPekka", "thetis": "MinionHorde",
    "mercury": "SkeletonDragons", "leona": "Witch", "azazel": "BattleHealer", "hela": "ElectroWizard",
    "empress": "ArcherQueen", "sleipnir": "GoldenKnight", "labiata": "MegaKnight", "titania": "Phoenix",
    "tiamat": "Balloon", "constantia": "EliteArcher", "fafnir": "ElectroGiant", "ramiel": "InfernoDragon",
    # iron
    "nightchick": "Goblins", "drone": "MiniSparkys", "legion": "IceWizard", "phalangites": "Knight",
    "pupphead": "ElectroSpirit", "centurion": "Wizard", "intruder": "HogRider", "fallen": "Archer",
    "harvester": "RageBarbarian", "bigchick": "Valkyrie", "rampart": "IceGolemite", "predator": "Prince",
    "gigantes": "Giant", "doomeater": "DarkPrince", "destroyer": "AxeMan", "fortress": "RoyalGiant",
    "blackknight": "Monk", "juggernaut": "Pekka", "executioner": "Assassin", "goltarion": "MightyMiner",
    "emperorchick": "SkeletonKing", "nidhogg": "Golem",
}
BUILDINGS = {"turret": "Tesla", "i_turret": "Cannon", "outpost": "GoblinHut", "hatchery": "Tombstone", "phoenix": "Mortar"}
SPELLS = {
    "strike": "Fireball", "emp": "Zap", "freeze": "Freeze", "napalm": "Earthquake", "missile": "Rocket",
    "poison": "Poison", "clone": "Clone", "volley": "Arrows", "thunder": "Lightning", "repair": "Heal",
    "gravity": "Tornado", "overclock": "Rage",
}
NAMES_KO = {
    "SpearGoblins": "창 고블린", "BlowdartGoblin": "다트 고블린", "Musketeer": "머스킷병", "Princess": "프린세스",
    "MegaMinion": "메가 미니언", "BabyDragon": "아기 드래곤", "ElectroDragon": "일렉트로 드래곤", "Minions": "미니언",
    "Bats": "박쥐", "DartBarrell": "비행 기계", "Firecracker": "폭죽 병사", "MiniPekka": "미니 페카",
    "MinionHorde": "미니언 무리", "SkeletonDragons": "해골 드래곤", "Witch": "마녀", "BattleHealer": "배틀 힐러",
    "ElectroWizard": "일렉트로 마법사", "ArcherQueen": "아처 퀸", "GoldenKnight": "골든 나이트", "MegaKnight": "메가 나이트",
    "Phoenix": "피닉스", "Balloon": "벌룬", "EliteArcher": "매직 아처", "ElectroGiant": "일렉트로 자이언트",
    "InfernoDragon": "인페르노 드래곤", "Goblins": "고블린", "MiniSparkys": "재피", "IceWizard": "아이스 마법사",
    "Knight": "기사", "ElectroSpirit": "일렉트로 정령", "Wizard": "마법사", "HogRider": "호그 라이더", "Archer": "아처",
    "RageBarbarian": "나무꾼", "Valkyrie": "발키리", "IceGolemite": "아이스 골렘", "Prince": "왕자", "Giant": "자이언트",
    "DarkPrince": "다크 프린스", "AxeMan": "엑스큐셔너", "RoyalGiant": "로얄 자이언트", "Monk": "수도승", "Pekka": "페카",
    "Assassin": "밴디트", "MightyMiner": "마이티 광부", "SkeletonKing": "해골 킹", "Golem": "골렘",
    "Tesla": "테슬라", "Cannon": "대포", "GoblinHut": "고블린 오두막", "Tombstone": "묘비", "Mortar": "박격포",
    "Fireball": "파이어볼", "Zap": "전기 충격", "Freeze": "얼음", "Earthquake": "지진", "Rocket": "로켓", "Poison": "독",
    "Clone": "복제", "Arrows": "화살", "Lightning": "번개", "Heal": "치유", "Tornado": "토네이도", "Rage": "분노",
}


def at(row, key, level=LEVEL):
    """A per-level value; champions (no level 10) step back one level from 11 by the game's 10 %."""
    arr = row.get(key) or []
    i = level - START.get(row.get("rarity"), 1)
    if 0 <= i < len(arr):
        return arr[i]
    if i < 0 and arr:
        return round(arr[0] / 1.1 ** (-i))
    return None


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    data = json.load(open(src, encoding="utf-8")) if src else json.load(urllib.request.urlopen(URL))
    by = {k: {r["name"]: r for r in data[k] if r.get("name")} for k in ("troop", "building", "spell", "projectile", "characters", "character_buff")}
    ch, pr = by["characters"], by["projectile"]

    def dmg_of(c):
        d = at(c, "damage_per_level")
        for key in ("custom_first_projectile", "projectile"):
            if d is None and c.get(key) in pr:
                p = pr[c[key]]
                d = at(dict(p, rarity=c["rarity"]), "damage_per_level")
                if d is None and p.get("spawn_projectile") in pr:  # a shot that bursts (the firecracker's shrapnel)
                    d = at(dict(pr[p["spawn_projectile"]], rarity=c["rarity"]), "damage_per_level")
        return d

    def splash_of(c):
        r = c.get("area_damage_radius") or 0
        for key in ("custom_first_projectile", "projectile"):
            p = pr.get(c.get(key) or "")
            if p:
                r = max(r, p.get("radius") or 0)
                if p.get("spawn_projectile") in pr:  # a burst of shrapnel covers about a tile
                    r = max(r, 1000)
        return r / 1000

    def flags_of(c):
        """The mechanics the reference card has, in this game's names."""
        p = pr.get(c.get("projectile") or "") or {}
        buffs = [c.get("buff_on_damage"), p.get("target_buff"), c.get("reflected_attack_buff")]
        bd = by["character_buff"]
        f = set()
        for b in filter(None, buffs):
            m = (bd.get(b) or p.get("target_buff_data") or {}).get("speed_multiplier", 0)
            f.add("stun" if m <= -100 else "slow" if m < 0 else "")
        if (p.get("chained_hit_count") or 0) > 1: f.add("chain")
        if c.get("variable_damage2"): f.add("ramp")
        if c.get("buff_when_not_attacking"): f.add("heal")
        if c.get("charge_range"): f.add("charge")
        if c.get("kamikaze"): f.add("kamikaze")
        if c.get("jump_enabled"): f.add("jump")
        if c.get("reflected_attack_buff"): f.add("reflect")
        if p.get("pingpong_visual_time") or p.get("piercing"): f.add("pierce")
        return sorted(x for x in f if x)

    out = {"source": URL, "level": LEVEL, "cards": {}}
    for gid, name in TROOPS.items():
        t = by["troop"][name]
        c = ch[t["summon_character"]]
        rate, dmg = (c.get("hit_speed") or 0) / 1000, dmg_of(c)
        p = pr.get(c.get("projectile") or "") or {}
        if p.get("pingpong_visual_time"):  # a thrown axe flies out and back: two hits a cycle, the cycle waits for its return
            rate += p["pingpong_visual_time"] / 1000
            dmg *= 2
        if c.get("multiple_targets"):  # bolts that all strike a lone target
            dmg *= c["multiple_targets"]
        shield = round(c["shield_hitpoints"] * 1.1 ** (LEVEL - START[c["rarity"]])) if c.get("shield_hitpoints") else 0
        out["cards"][gid] = {
            "cr": NAMES_KO[name], "key": name, "type": "troop", "cost": t["mana_cost"], "count": t.get("summon_number") or 1,
            "hp": at(c, "hitpoints_per_level") + shield, "dmg": dmg, "rate": rate,
            "range": (c.get("range") or 0) / 1000, "speed": (c.get("speed") or 0) / 60,
            "air": bool(c.get("flying_height")), "targets": "buildings" if c.get("target_only_buildings") else "all" if c.get("attacks_air") else "ground",
            "splash": splash_of(c), "spawn": bool(c.get("spawn_character")), "champion": c["rarity"] == "Champion",
            "flags": flags_of(c),
            "ramp": [1, c["variable_damage2"] / c["damage"], c["variable_damage3"] / c["damage"]] if c.get("variable_damage2") and c.get("damage") else None,
            "rampAt": [c["variable_damage_time1"] / 1000, (c["variable_damage_time1"] + c["variable_damage_time2"]) / 1000] if c.get("variable_damage_time1") else None,
            "load": (c.get("load_time") or 0) / 1000,
            "chargeRange": (c.get("charge_range") or 0) / 100, "radius": (c.get("collision_radius") or 500) / 1000,
        }
    for gid, name in BUILDINGS.items():
        b = by["building"][name]
        p = pr.get(b.get("projectile") or "")
        dmg = at(b, "damage_per_level") or (p and at(dict(p, rarity=b["rarity"]), "damage_per_level"))
        out["cards"][gid] = {
            "cr": NAMES_KO[name], "key": name, "type": "building", "cost": b.get("elixir") or {"GoblinHut": 5}.get(name, 0), "hp": at(b, "hitpoints_per_level"),
            "dmg": dmg, "rate": (b.get("hit_speed") or 0) / 1000 if dmg else 0, "range": (b.get("range") or 0) / 1000,
            "life": (b.get("life_time") or 0) / 1000, "targets": "all" if b.get("attacks_air") else "ground" if dmg else "none",
            "spawn": b.get("spawn_number") or 0, "every": (b.get("spawn_pause_time") or 0) / 1000,
        }
    PROJ_SPELLS = {"Fireball": ("FireballSpell", "Rare", 4, 1), "Rocket": ("RocketSpell", "Rare", 6, 1), "Arrows": ("ArrowsSpell", "Common", 3, 3)}
    for gid, name in SPELLS.items():
        if name in PROJ_SPELLS:  # spells that are a thrown projectile live in the projectile table
            pn, rar, cost, waves = PROJ_SPELLS[name]
            p = pr[pn]
            out["cards"][gid] = {"cr": NAMES_KO[name], "key": name, "type": "spell", "cost": cost,
                                 "dmg": at(dict(p, rarity=rar), "damage_per_level") * waves, "radius": (p.get("radius") or 0) / 1000,
                                 "towerPct": p.get("crown_tower_damage_percent")}
            continue
        s = by["spell"][name]
        dmg = at(s, "damage_per_level")
        if dmg is None and s.get("projectile") in pr:
            dmg = at(dict(pr[s["projectile"]], rarity=s["rarity"]), "damage_per_level")
        buff = by["character_buff"].get(s.get("buff") or "") or {}
        dps = None
        if buff.get("damage_per_second"):  # the tables give the first level's rate: 10 % a level from there, as every stat
            dps = round(buff["damage_per_second"] * 1.1 ** (LEVEL - START[s["rarity"]]))
        out["cards"][gid] = {
            "cr": NAMES_KO[name], "key": name, "type": "spell", "cost": s.get("mana_cost"), "dmg": dmg if dmg is not None else dps,
            "perSecond": dps is not None and dmg is None, "radius": (s.get("radius") or 0) / 1000, "dur": (s.get("life_duration") or 0) / 1000,
            "towerPct": s.get("crown_tower_damage_percent") if s.get("crown_tower_damage_percent") is not None else buff.get("crown_tower_damage_percent"),
            "buildingPct": buff.get("building_damage_percent"), "slowPct": buff.get("speed_multiplier"),
        }
    tw = {}
    for key, name, proj in (("princess", "PrincessTower", "TowerPrincessProjectile"), ("king", "KingTower", "KingProjectile")):
        b = by["building"][name]
        tw[key] = {"hp": at(b, "hitpoints_per_level"), "dmg": at(dict(pr[proj], rarity="Common"), "damage_per_level"),
                   "rate": b["hit_speed"] / 1000, "range": b["range"] / 1000}
    out["towers"] = tw
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cr_reference.json")
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    missing = [(g, k) for g, v in out["cards"].items() for k in ("hp", "dmg") if k in v and v[k] is None and not (v["type"] == "spell")]
    print("written", path, "missing:", missing)


if __name__ == "__main__":
    main()
