"""Champion skill impacts: build a small Unity project (outside the repo) with only these prefabs and their
dependencies, plus the RefFx baker from the defence project's pipeline. Then run Unity (see run.txt) and build.py.
"""
import os, re, shutil, sys
DEF = r"E:/LAO_MINI_GAME/5_LAO_Defence/tools"
sys.path.insert(0, DEF)
import build_sd as B  # guid index of the source project

SRC_PROJ = DEF + "/unity_ref/proj"
PROJ = r"E:/LAO_MINI_GAME/_fxbake_lr"
FX = B.ROOT + "/AssetBundleResource/FX"
PREFABS = [
    "character_prefab/Empress_skill/skill1/Empress_skill1_ice_Hit.prefab",
    "character_prefab/Labiata_skill/buff/Labiata_buff_skill1_hit.prefab",
    "character_prefab/fafnir_skill/Fafnir_ns1_skill/skill1/vfx_fafnir_ns1_hit_last.prefab",
    "character_prefab/Ramiel_skill/Ramiel_N_Skill1_Hit.prefab",
    "character_prefab/Titania_skill/skill1/Titania_skill1_hit.prefab",
    "character_prefab/nidhogg_skill/nidhogg_skill1_hit.prefab",
    "enemy_prefab/BlackKnight_skill/BlackKnight_N_Skill1_A.prefab",
    "enemy_prefab/BlackKnight_skill/BlackKnight_N_Skill1_B.prefab",
    "enemy_prefab/Juggernaut_skill/skill2/Juggernaut_skill2_last_hit.prefab",
    "enemy_prefab/Executioner_skill/skill1/Executioner_skill1_Hit.prefab",
    "enemy_prefab/Goltarion_N_skill/Goltarion_N_Skill1_A.prefab",
    "enemy_prefab/Goltarion_N_skill/Goltarion_N_Skill1_B.prefab",
    "enemy_prefab/EmperorChick_skill/EmperorChick_skill2_hit.prefab",
]
DEP_EXT = (".prefab", ".fbx", ".anim", ".controller", ".png", ".mat", ".shader", ".asset", ".tga", ".psd", ".jpg", ".mesh")


def copy_asset(src, copied):
    src = src.replace("\\", "/")
    rel = os.path.relpath(src, B.ROOT).replace("\\", "/")
    if src not in copied and os.path.exists(src):
        dst = os.path.join(PROJ, "Assets", "Ref", rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)
        if os.path.exists(src + ".meta"):
            shutil.copyfile(src + ".meta", dst + ".meta")
        copied.add(src)
        if src.lower().endswith((".prefab", ".controller", ".mat", ".asset")):
            text = open(src, encoding="utf-8", errors="ignore").read()
            for g in set(re.findall(r"guid: ([0-9a-f]{32})", text)):
                p = B.guid_index().get(g)
                if p and p.lower().endswith(DEP_EXT):
                    copy_asset(p, copied)
    return "Assets/Ref/" + rel


def main():
    for d in ("Packages", "ProjectSettings"):
        if not os.path.exists(os.path.join(PROJ, d)):
            shutil.copytree(os.path.join(SRC_PROJ, d), os.path.join(PROJ, d))
    os.makedirs(os.path.join(PROJ, "Assets", "Editor"), exist_ok=True)
    for f in ("RefFx.cs", "RefFx.cs.meta"):
        p = os.path.join(SRC_PROJ, "Assets", f)
        if not os.path.exists(p):
            p = os.path.join(SRC_PROJ, "Assets", "Editor", f)
        if os.path.exists(p):
            shutil.copyfile(p, os.path.join(PROJ, "Assets", "Editor", f))
    sh = os.path.join(PROJ, "Assets", "Ref", "AssetBundleResource", "Shader")
    if not os.path.exists(sh):
        shutil.copytree(os.path.join(SRC_PROJ, "Assets", "Ref", "AssetBundleResource", "Shader"), sh)
    copied, jobs = set(), []
    for rel in PREFABS:
        src = FX + "/" + rel
        if not os.path.exists(src):
            print("missing", rel); continue
        r = copy_asset(src, copied)
        jobs.append("|".join([os.path.splitext(os.path.basename(rel))[0], r, "static", "0", "0", "-1", ""]))
    open(os.path.join(PROJ, "fx_jobs.txt"), "w", encoding="utf-8").write("\n".join(jobs) + "\n")
    print("jobs", len(jobs), "copied", len(copied))


if __name__ == "__main__":
    main()
